import fs from "node:fs";
import path from "node:path";

const DEFAULT_MONTHLY_CAP_NTD = 1000;
const DEFAULT_STOP_RATIO = 0.9;
const DEFAULT_WEB_DETECTION_USD_PER_1000 = 3.5;
const DEFAULT_FREE_UNITS_PER_MONTH = 1000;
const DEFAULT_USD_TO_NTD = 35;

function numericEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function roundMoney(value) {
  return Number(value.toFixed(4));
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePolicy(policy = {}) {
  const monthlyCapNtd = Number(policy.monthly_cap_ntd ?? numericEnv("TTD_VISION_MONTHLY_CAP_NTD", DEFAULT_MONTHLY_CAP_NTD));
  const stopRatio = Number(policy.stop_ratio ?? numericEnv("TTD_VISION_STOP_RATIO", DEFAULT_STOP_RATIO));
  const webDetectionUsdPer1000 = Number(
    policy.web_detection_usd_per_1000 ??
      numericEnv("TTD_VISION_WEB_DETECTION_USD_PER_1000", DEFAULT_WEB_DETECTION_USD_PER_1000),
  );
  const freeUnitsPerMonth = Number(
    policy.free_units_per_month ?? numericEnv("TTD_VISION_FREE_UNITS_PER_MONTH", DEFAULT_FREE_UNITS_PER_MONTH),
  );
  const usdToNtd = Number(policy.usd_to_ntd ?? numericEnv("TTD_VISION_USD_TO_NTD", DEFAULT_USD_TO_NTD));

  return {
    monthly_cap_ntd: monthlyCapNtd,
    stop_ratio: stopRatio,
    stop_at_ntd: roundMoney(monthlyCapNtd * stopRatio),
    web_detection_usd_per_1000: webDetectionUsdPer1000,
    free_units_per_month: freeUnitsPerMonth,
    usd_to_ntd: usdToNtd,
    pricing_source:
      "Google Cloud Vision pricing: Web Detection first 1000 units/month free; units 1001+ at USD 3.50 per 1000 units as checked 2026-07-06.",
  };
}

function normalizeLog(rawLog, policy) {
  return {
    schema_version: 1,
    generated_by: "ttd-mvp budgetGuard.js",
    policy,
    events: Array.isArray(rawLog?.events) ? rawLog.events : [],
  };
}

export function estimateVisionCostNtd(units, policyInput = {}) {
  const policy = normalizePolicy(policyInput);
  const billableUnits = Math.max(0, Number(units || 0) - policy.free_units_per_month);
  const costUsd = (billableUnits / 1000) * policy.web_detection_usd_per_1000;
  return {
    units: Number(units || 0),
    billable_units_after_free_tier: billableUnits,
    estimated_cost_usd: roundMoney(costUsd),
    estimated_cost_ntd: roundMoney(costUsd * policy.usd_to_ntd),
  };
}

export function readCostLog(costLogPath, policyInput = {}) {
  const policy = normalizePolicy(policyInput);
  return normalizeLog(readJsonIfExists(costLogPath), policy);
}

export function summarizeMonthlyUsage(costLog, month = monthKey(), policyInput = costLog.policy) {
  const policy = normalizePolicy(policyInput);
  const events = (costLog.events || []).filter((event) => event.month === month);
  const visionUnitsUsed = events
    .filter((event) => event.billable_call === true)
    .reduce((sum, event) => sum + Number(event.units || 0), 0);
  const estimate = estimateVisionCostNtd(visionUnitsUsed, policy);

  return {
    month,
    vision_units_used: visionUnitsUsed,
    ...estimate,
    cache_hits: events.filter((event) => event.type === "cache_hit").length,
    dry_run_skips: events.filter((event) => event.type === "dry_run").length,
    blocked_calls: events.filter((event) => event.type === "blocked_by_budget").length,
    events_recorded: events.length,
    stop_at_ntd: policy.stop_at_ntd,
    budget_remaining_before_stop_ntd: roundMoney(Math.max(0, policy.stop_at_ntd - estimate.estimated_cost_ntd)),
  };
}

export function createBudgetGuard(options = {}) {
  const costLogPath = options.costLogPath;
  if (!costLogPath) {
    throw new Error("BudgetGuard requires a costLogPath.");
  }

  const policy = normalizePolicy(options.policy);

  function loadLog() {
    return readCostLog(costLogPath, policy);
  }

  function writeLog(costLog) {
    ensureParentDir(costLogPath);
    fs.writeFileSync(
      costLogPath,
      `${JSON.stringify(
        {
          ...costLog,
          policy,
          updated_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
  }

  function checkCanSpend({ units = 1, now = new Date(), reason = "vision-web-detection", assetId = "" } = {}) {
    const month = monthKey(now);
    const log = loadLog();
    const current = summarizeMonthlyUsage(log, month, policy);
    const projected = estimateVisionCostNtd(current.vision_units_used + Number(units || 0), policy);
    const incrementalCostNtd = roundMoney(projected.estimated_cost_ntd - current.estimated_cost_ntd);
    const allowed = projected.estimated_cost_ntd <= policy.stop_at_ntd;

    return {
      allowed,
      month,
      reason,
      asset_id: assetId,
      units: Number(units || 0),
      current_monthly_cost_ntd: current.estimated_cost_ntd,
      projected_monthly_cost_ntd: projected.estimated_cost_ntd,
      free_units_per_month: policy.free_units_per_month,
      projected_billable_units_after_free_tier: projected.billable_units_after_free_tier,
      within_free_tier: projected.billable_units_after_free_tier === 0,
      estimated_incremental_cost_ntd: incrementalCostNtd,
      stop_at_ntd: policy.stop_at_ntd,
      monthly_cap_ntd: policy.monthly_cap_ntd,
      current_units: current.vision_units_used,
      projected_units: projected.units,
      message: allowed
        ? "Budget guard allows this Vision WEB_DETECTION request."
        : "Budget guard blocked this Vision WEB_DETECTION request before the 90% monthly cap.",
    };
  }

  function recordEvent(event) {
    const now = event.timestamp ? new Date(event.timestamp) : new Date();
    const month = event.month || monthKey(now);
    const log = loadLog();
    const normalized = {
      timestamp: now.toISOString(),
      month,
      adapter: "visionWebDetection",
      type: event.type,
      asset_id: event.asset_id || "",
      units: Number(event.units || 0),
      billable_call: event.billable_call === true,
      within_free_tier: event.within_free_tier === true,
      estimated_incremental_cost_ntd: Number(event.estimated_incremental_cost_ntd || 0),
      projected_monthly_cost_ntd: Number(event.projected_monthly_cost_ntd || 0),
      note: event.note || "",
    };
    log.events.push(normalized);
    writeLog(log);
    return normalized;
  }

  return {
    costLogPath,
    policy,
    readLog: loadLog,
    summarizeMonth(month = monthKey()) {
      return summarizeMonthlyUsage(loadLog(), month, policy);
    },
    checkCanSpend,
    recordEvent,
    ensureLog() {
      const log = loadLog();
      writeLog(log);
      return log;
    },
  };
}
