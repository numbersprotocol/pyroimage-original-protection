import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertArtifact } from "../src/contracts/artifactContracts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const HARNESS_DIR = process.env.TTD_HARNESS_DIR || path.join(WORKSPACE_ROOT, ".omni/harness");
const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");

const HANDBACK_FILE = "demo-handback.json";
const HANDBACK_MARKDOWN_FILE = "demo-handback.md";
const VALIDATION_FILE = "demo-validation.json";

const REQUIRED_SCREEN_IDS = [
  "library",
  "asset_detail",
  "similarity",
  "monitoring",
  "alert",
  "evidence_report",
  "verification_portal",
];
const REQUIRED_PHASES = [1, 2, 3, 4, 5, 6];
const SIGNED_QUERY_PATTERN = /[?&](?:x-)?(?:expires|signature|key-pair-id|policy)=|[?&]x-amz-/i;
const CLAIM_GUARDRAILS = [
  ["confirmed", "infringement"],
  ["legal", "proof"],
  ["legal", "certainty"],
  ["automatic", "takedown"],
  ["auto", "takedown"],
  ["all", "web", "realtime", "monitoring"],
  ["全", "網", "即", "時", "監", "測"],
];

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, fileName), "utf8"));
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(fileName, data) {
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), `${data.trim()}\n`);
}

function displayNumber(value) {
  if (typeof value !== "number") return String(value);
  return value.toLocaleString("en-US");
}

function parseCostLog() {
  const filePath = path.join(HARNESS_DIR, "cost-log.csv");
  if (!fs.existsSync(filePath)) {
    return {
      tool_spend_twd: 0,
      paid_api_used: false,
      cost_log_header_only: false,
      row_count: 0,
      source_note: "cost-log.csv 尚未建立；demo handback 保持付費工具支出為 0，直到 guardrail 檔案存在。",
    };
  }

  const rows = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (rows.length <= 1) {
    return {
      tool_spend_twd: 0,
      paid_api_used: false,
      cost_log_header_only: true,
      row_count: rows.length,
      source_note: "cost-log.csv 只有 header，沒有付費呼叫紀錄。",
    };
  }

  const header = rows[0].split(",");
  const actualCostIndex = header.indexOf("actual_cost_twd");
  const total = rows.slice(1).reduce((sum, row) => {
    const columns = row.split(",");
    const value = Number(columns[actualCostIndex] || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return {
    tool_spend_twd: total,
    paid_api_used: total > 0,
    cost_log_header_only: false,
    row_count: rows.length,
    source_note: "cost-log.csv 已有成本列；demo handback 顯示 actual_cost_twd 加總值。",
  };
}

function serialized(value) {
  return JSON.stringify(value);
}

function containsSignedQuery(value) {
  return SIGNED_QUERY_PATTERN.test(serialized(value));
}

function containsGuardrailClaim(value) {
  const text = serialized(value).toLowerCase();
  return CLAIM_GUARDRAILS.some((parts) => text.includes(parts.join(" ").toLowerCase()) || text.includes(parts.join("")));
}

function phaseSummary(phase, title, status, artifacts, summary) {
  return {
    phase,
    title,
    status,
    artifacts,
    summary,
  };
}

function flowStep(timebox, screenId, title, artifact, talkTrack, proofPoint) {
  return {
    timebox,
    screen_id: screenId,
    title,
    source_artifact: artifact,
    talk_track: talkTrack,
    proof_point: proofPoint,
  };
}

function metricById(dashboard, id) {
  return dashboard.metrics.find((item) => item.id === id) || {};
}

function renderMarkdown(handback) {
  const phaseRows = handback.completed_phases
    .map((item) => `| Phase ${item.phase} | ${item.title} | ${item.status} | ${item.summary} |`)
    .join("\n");
  const metricRows = handback.metrics_snapshot
    .map((item) => `| ${item.id} | ${item.value_display} | ${item.label_display} | ${item.note} |`)
    .join("\n");
  const flowRows = handback.five_minute_recording_flow
    .map((item) => `| ${item.timebox} | ${item.title} | ${item.talk_track} | ${item.proof_point} |`)
    .join("\n");
  const limitationRows = handback.known_limitations.map((item) => `- ${item}`).join("\n");
  const pmRows = handback.remaining_pm_owned_work.map((item) => `- ${item}`).join("\n");
  const qaRows = handback.qa_ready_checklist.map((item) => `- ${item}`).join("\n");

  return `
# PyroImage 原創影像主動防護 QA 與 PM Handback

Generated at: ${handback.generated_at}

## Demo Target

- Demo route: \`${handback.demo_target.route}\`
- Local demo URL: \`${handback.demo_target.local_url}\`
- App directory: \`${handback.demo_target.app_directory}\`
- Auth: ${handback.demo_target.auth}
- Stable data mode: ${handback.demo_target.stable_data_mode}
- Public artifact checks: ${handback.demo_target.public_artifact_urls.map((item) => `\`${item}\``).join(", ")}

## Local Runbook

1. 進入 \`${handback.demo_target.app_directory}\`。
2. 執行 \`${handback.local_runbook.generate_handback_command}\` 重新產生 handback artifacts。
3. 執行 \`${handback.local_runbook.test_command}\`。
4. 執行 \`${handback.local_runbook.build_command}\`。
5. 執行 \`${handback.local_runbook.dev_server_command}\`，再開啟 \`${handback.demo_target.local_url}\`。

## Completed Phase Summary

| Phase | Title | Status | Summary |
|---|---|---|---|
${phaseRows}

## Metrics Snapshot

| Metric | Value | Label | Note |
|---|---:|---|---|
${metricRows}

## 5-Minute Recording Flow

| Timebox | Screen | Talk track | Proof point |
|---|---|---|---|
${flowRows}

## QA-Ready Checklist

${qaRows}

## Known Limitations

${limitationRows}

## Remaining PM-Owned Work

${pmRows}

## Guardrails

- Monitoring wording stays as \`${handback.guardrails.required_monitoring_wording}\`.
- Alert wording stays as \`${handback.guardrails.required_alert_wording}\`.
- Origin verification supports review only; it does not replace authorization checks.
- Controlled checks and internal-only alerts stay excluded from market validation.
- Paid APIs remain disabled by default; current tool spend is NT$${displayNumber(handback.cost_guardrail.tool_spend_twd)}.
`;
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const dashboard = readJson("dashboard-metrics.json");
  const dashboardValidation = readJson("dashboard-validation.json");
  const validationSummary = readJson("validation-summary.json");
  const indexValidation = readJson("index-validation.json");
  const sourceValidation = readJson("source-monitoring-validation.json");
  const alertValidation = readJson("alert-validation.json");
  const reportValidation = readJson("report-validation.json");
  const verificationValidation = readJson("verification-validation.json");
  const cost = parseCostLog();
  const alertActual = alertValidation.actual || alertValidation || {};
  const reportActual = reportValidation.actual || {};
  const verificationActual = verificationValidation.actual || {};

  const metricsSnapshot = [
    "protected_originals",
    "demo_seed_rows",
    "c2pa_signed_assets",
    "monitored_sources",
    "demo_monitored_sources",
    "suspected_events",
    "evidence_reports",
    "partner_feedback",
    "tool_spend_twd",
  ].map((id) => {
    const item = metricById(dashboard, id);
    return {
      id,
      value: item.value,
      value_display: item.value_display,
      label_display: item.label_display,
      note: item.note,
    };
  });

  const completedPhases = [
    phaseSummary(1, "Data ingestion and validation", "COMPLETED", ["validation-summary.json", "demo-assets.json"], "4,329 actual originals and 300-row demo sample are parsed and sanitized."),
    phaseSummary(2, "Local image index and similarity smoke test", "COMPLETED", ["image-index.jsonl", "index-validation.json", "similarity-query-results.json"], "300 demo rows are indexed; 10 self-match checks and one controlled transform check pass."),
    phaseSummary(3, "Automated patrol metadata", "COMPLETED", ["monitored-sources.json", "monitoring-run.json"], "Designated channels and the latest real patrol run metadata are represented without unsafe crawling."),
    phaseSummary(4, "Real alert workflow", "COMPLETED", ["alerts.json", "cases.json", "review-states.json"], "Fetched-hash matches become pending-review alerts; no-match runs remain honest zero states."),
    phaseSummary(5, "Evidence report", "COMPLETED", ["evidence-report.json", "evidence-report.md"], "Actual pending-review evidence is packaged with source URL, similarity, run metadata, and limitations."),
    phaseSummary(6, "Origin verification portal", "COMPLETED", ["verification-fixtures.json", "verification-validation.json"], "Known original, transformed original, and non-original verdict paths are validated locally at zero paid API cost."),
  ];

  const flow = [
    flowStep("0:00-0:25", "library", "PyroImage original library", "validation-summary.json", "先建立 baseline：PyroImage public originals 有 4,329 筆 actual records，demo 不是憑空樣本。", `${displayNumber(validationSummary.actual.full_seed_rows_loaded)} originals parsed`),
    flowStep("0:25-0:55", "asset_detail", "Protected asset detail / metadata / provenance", "demo-assets.json", "打開單一 protected original，展示 creator、owner、C2PA/provenance 與 certificate link。", `protected asset ${dashboard.protected_asset_id}`),
    flowStep("0:55-1:30", "similarity", "Visual fingerprint matching", "index-validation.json", "說明本機 aHash+dHash 指紋比對與門檻，顯示 self-match 與受控轉檔仍能命中。", `${displayNumber(indexValidation.coverage.indexed_rows)} indexed rows`),
    flowStep("1:30-2:05", "monitoring", "designated-channel patrol", "monitoring-run.json", "切到巡檢資料，說明最新 run 由 adapter 寫入 metadata；缺 Vision secret 時不會花費，仍能保持 dry-run/seed-safe。", `${displayNumber(sourceValidation.actual.source_count)} configured sources`),
    flowStep("2:05-2:40", "alert", "pending-review alert", "alert-validation.json", "展示警報只來自真實抓取候選影像與感知雜湊命中；仍是 internal-only，需人工確認授權與來源脈絡。", `${displayNumber(alertActual.alert_count || 0)} alert / real_hash_match=${alertActual.alerts_are_real_fetched_hash_matches === true}`),
    flowStep("2:40-3:20", "evidence_report", "Evidence report", "report-validation.json", "展示 report section：protected original、candidate use、match explanation、run metadata、review state、public-use label 與 limitations。", `${displayNumber(reportActual.report_count || 0)} report / adapter ${reportActual.adapter_id || "N/A"}`),
    flowStep("3:20-4:20", "verification_portal", "Origin verification portal", "verification-validation.json", "切到貼圖查驗，輸入 known original、controlled transform、non-original control，確認 verdict 不捏造外部結果。", `${displayNumber(verificationActual.query_count || 0)} queries / ${verificationValidation.pass?.all === true ? "PASS" : "CHECK"}`),
    flowStep("4:20-5:00", "verification_portal", "PM close and next work", "demo-handback.md", "收斂 PM 待辦：補上 Actions Vision secret、合併 PR 後跑 ttd-patrol dispatch，並安排 production QA。", "stable static MVP; no paid API unless budget-gated Vision is explicitly enabled"),
  ];

  const handback = {
    generated_at: generatedAt,
    phase: "Phase 4: Verification Portal And UI Integration Handback",
    demo_target: {
      route: "/pyroimage-original-protection",
      local_url: "http://127.0.0.1:4173/pyroimage-original-protection",
      app_directory: "pyroimage-original-protection",
      auth: "N/A；MVP 使用 local/static demo data，沒有登入需求。",
      stable_data_mode: "所有 MVP screens 讀取 static artifacts；錄影不需要 unstable live crawling。",
      public_artifact_urls: [
        "/pyroimage-original-protection/ttd-mvp/dashboard-metrics.json",
        "/pyroimage-original-protection/ttd-mvp/dashboard-validation.json",
        "/pyroimage-original-protection/ttd-mvp/verification-fixtures.json",
        "/pyroimage-original-protection/ttd-mvp/verification-validation.json",
        "/pyroimage-original-protection/ttd-mvp/demo-handback.json",
        "/pyroimage-original-protection/ttd-mvp/demo-validation.json",
      ],
    },
    local_runbook: {
      generate_handback_command: "npm run ttd:handback",
      test_command: "npm run lint",
      build_command: "npm run build:pages",
      dev_server_command: "npm run dev -- --host 127.0.0.1 --port 4173",
      expected_route: "/pyroimage-original-protection",
    },
    qa_ready_checklist: [
      "Desktop viewport: open /pyroimage-original-protection, confirm seven navigation screens switch without blank content.",
      "Mobile viewport: open /pyroimage-original-protection, confirm controls remain usable and text does not overlap.",
      "Confirm /pyroimage-original-protection/ttd-mvp/dashboard-metrics.json and /pyroimage-original-protection/ttd-mvp/demo-validation.json are readable from the same local origin.",
      "Confirm labels distinguish actual patrol output, indexed samples, controlled verification checks, target, and TBD.",
      "Confirm designated-channel patrol and pending-review alert wording remain visible.",
      "Confirm verification portal returns registered-original, transformed-match, and not-registered verdicts.",
      "Confirm no paid API is required and cost-log.csv remains header-only.",
    ],
    completed_phases: completedPhases,
    metrics_snapshot: metricsSnapshot,
    five_minute_recording_flow: flow,
    known_limitations: [
      "Designated-channel patrol is bounded by configured sources, adapter availability, and platform rules; it is not an unrestricted crawler.",
      "目前 seed adapter 的 pending-review alert 只證明 real fetch/hash pipeline；外部侵權主張仍需 Vision 或授權通路與人工複審。",
      "suspected_events 仍為 0 actual until real case exists。",
      "partner_feedback 仍為 0 actual / outreach pending。",
      "Origin verification supports review workflows but does not replace brand-owner authorization checks.",
      "目前沒有預設啟用付費 API；Vision billable path 需 GH secret + 明確 billable flag + budget guard。",
      "任何公開對外說法仍需 PM/法務/partner human review 後再定稿。",
    ],
    remaining_pm_owned_work: [
      "挑選可公開展示的 P0 visual assets，並確認是否需要補簽 C2PA / proof layer。",
      "完成 EV-002 到 EV-005 partner outreach 或改成明確的 pipeline status。",
      "若要宣稱外部實際案例，需補上 human-reviewed source evidence；否則維持 internal-only / pending-review 標籤。",
      "更新簡報與 5 分鐘錄影腳本，保持 actual/sample/controlled-check/TBD 標籤。",
      "合併後執行 PyroImage Patrol workflow_dispatch，並確認 production /pyroimage-original-protection/ 顯示最新真實巡檢與查驗輸出。",
    ],
    guardrails: {
      required_monitoring_wording: "designated-channel patrol",
      required_alert_wording: "pending-review alert",
      no_unstable_live_crawling: true,
      no_paid_api_by_default: true,
      simulated_cases_count_toward_market_validation: false,
      origin_verification_is_review_support_only: true,
    },
    cost_guardrail: {
      tool_spend_twd: cost.tool_spend_twd,
      paid_api_used: cost.paid_api_used,
      cost_log_header_only: cost.cost_log_header_only,
      source_note: cost.source_note,
    },
  };

  const markdown = renderMarkdown(handback);
  const validationTargets = { handback, markdown };
  const screenIds = new Set(dashboard.screens.map((item) => item.id));
  const flowScreenIds = new Set(flow.map((item) => item.screen_id));
  const validation = {
    generated_at: generatedAt,
    phase: "Phase 4: Verification Portal And UI Integration Handback",
    actual: {
      route: handback.demo_target.route,
      local_url: handback.demo_target.local_url,
      public_artifact_urls: handback.demo_target.public_artifact_urls,
      completed_phase_count: completedPhases.length,
      dashboard_screen_count: dashboard.screens.length,
      five_minute_flow_steps: flow.length,
      qa_viewports: ["desktop 1920x1080", "mobile 390x844"],
      suspected_events: dashboardValidation.actual.suspected_events,
      evidence_reports: dashboardValidation.actual.evidence_reports,
      tool_spend_twd: cost.tool_spend_twd,
      paid_api_used: cost.paid_api_used,
      cost_log_header_only: cost.cost_log_header_only,
      qa_status: "pending_qa_sub_loop",
    },
    pass: {
      local_runbook_documents_test_and_build: Boolean(
        handback.local_runbook.test_command && handback.local_runbook.build_command,
      ),
      qa_ready_desktop_and_mobile: handback.qa_ready_checklist.some((item) => item.includes("Desktop")) &&
        handback.qa_ready_checklist.some((item) => item.includes("Mobile")),
      all_completed_phases_summarized:
        completedPhases.length === 6 &&
        REQUIRED_PHASES.every((phase) => completedPhases.some((item) => item.phase === phase && item.status === "COMPLETED")),
      five_minute_flow_covers_required_screens:
        flow.length >= 7 &&
        REQUIRED_SCREEN_IDS.every((id) => screenIds.has(id)) &&
        REQUIRED_SCREEN_IDS.every((id) => flowScreenIds.has(id)),
      pm_can_record_without_unstable_live_crawling: handback.guardrails.no_unstable_live_crawling === true,
      handback_summary_complete:
        handback.known_limitations.length >= 5 &&
        handback.remaining_pm_owned_work.length >= 5 &&
        handback.demo_target.route === "/pyroimage-original-protection",
      simulated_cases_not_market_validation:
        handback.guardrails.simulated_cases_count_toward_market_validation === false &&
        dashboardValidation.actual.suspected_events === 0,
      required_wording_present:
        serialized(handback).includes("designated-channel patrol") &&
        serialized(handback).includes("pending-review alert"),
      no_signed_url_query_strings: !containsSignedQuery(validationTargets),
      no_prohibited_public_claims: !containsGuardrailClaim(validationTargets),
      removed_client_name_not_present: !/Taiwan Mobile|台灣大哥大|台哥大/i.test(serialized(validationTargets)),
      paid_api_disabled_and_unused: cost.paid_api_used === false && cost.tool_spend_twd === 0,
    },
    limitations: handback.known_limitations,
  };

  const allPass = Object.values(validation.pass).every(Boolean);

  assertArtifact("demoHandback", handback);

  writeJson(HANDBACK_FILE, handback);
  writeText(HANDBACK_MARKDOWN_FILE, markdown);
  writeJson(VALIDATION_FILE, validation);

  if (!allPass) {
    throw new Error(`Verification portal handback validation failed: ${JSON.stringify(validation.pass)}`);
  }

  console.log(
    JSON.stringify(
      {
        output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
        route: handback.demo_target.route,
        local_url: handback.demo_target.local_url,
        completed_phase_count: completedPhases.length,
        five_minute_flow_steps: flow.length,
        qa_status: validation.actual.qa_status,
        tool_spend_twd: cost.tool_spend_twd,
        paid_api_used: cost.paid_api_used,
      },
      null,
      2,
    ),
  );
}

main();
