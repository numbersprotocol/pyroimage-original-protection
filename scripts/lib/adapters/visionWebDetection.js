import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createBudgetGuard } from "../budgetGuard.js";
import { getGoogleAccessToken } from "../googleAuth.js";
import { redactSignedQueryInText, redactUrl } from "../perceptualHash.js";

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const DEFAULT_PROJECT_ID = "pyroimage-x402";
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_MAX_CANDIDATES_PER_ASSET = 8;
const DEFAULT_CACHE_TTL_DAYS = 30;
const INTERNAL_HOSTS = ["dia-cdn.numbersprotocol.io", "verify.numbersprotocol.io", "numbersprotocol.io"];

function parseBooleanEnv(name, fallback = false) {
  if (process.env[name] === "1" || process.env[name] === "true") return true;
  if (process.env[name] === "0" || process.env[name] === "false") return false;
  return fallback;
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function compactText(value, length = 16) {
  return sha256Text(value).slice(0, length);
}

function getHostName(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown-host";
  }
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isInternalUrl(url, includeInternal) {
  if (includeInternal) return false;
  try {
    const host = new URL(url).hostname;
    return INTERNAL_HOSTS.some((internalHost) => host === internalHost || host.endsWith(`.${internalHost}`));
  } catch {
    return true;
  }
}

function assetImageUrl(asset) {
  return (
    asset?.media_refs?.thumbnail_url ||
    asset?.media_refs?.snapshot_url_ref ||
    asset?.media_refs?.original_url_ref ||
    ""
  );
}

function sanitizeUrlFields(value) {
  if (Array.isArray(value)) return value.map(sanitizeUrlFields);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if (typeof nested === "string" && key.toLowerCase().includes("url")) {
        return [key, redactSignedQueryInText(nested)];
      }
      return [key, sanitizeUrlFields(nested)];
    }),
  );
}

function cacheKeyForAsset(asset, imageUrl, options) {
  return sha256Text(
    JSON.stringify({
      asset_id: asset.asset_id,
      image_ref: redactUrl(imageUrl),
      max_results: options.maxResults,
      feature: "WEB_DETECTION",
      adapter_version: 1,
    }),
  );
}

function readCache(cachePath) {
  return readJsonIfExists(cachePath, {
    schema_version: 1,
    generated_by: "ttd-mvp visionWebDetection.js",
    entries: {},
  });
}

function writeCache(cachePath, cache) {
  writeJson(cachePath, {
    ...cache,
    updated_at: new Date().toISOString(),
  });
}

function isFreshCacheEntry(entry, now = new Date()) {
  if (!entry?.expires_at) return false;
  return new Date(entry.expires_at).getTime() > now.getTime();
}

function candidateFromImage({ protectedAsset, imageUrl, sourcePageUrl, matchType, index, score, includeInternal }) {
  if (!isHttpUrl(imageUrl) || isInternalUrl(imageUrl, includeInternal)) return null;
  const sourceUrl = sourcePageUrl && isHttpUrl(sourcePageUrl) ? sourcePageUrl : imageUrl;
  const imageRef = redactUrl(imageUrl);
  const sourceRef = redactUrl(sourceUrl);
  const host = getHostName(sourceUrl);

  return {
    candidate_id: `vision_${compactText(`${protectedAsset.asset_id}|${matchType}|${imageUrl}|${index}`)}`,
    protected_asset_id: protectedAsset.asset_id,
    image_url: imageUrl,
    image_ref: imageRef,
    source_id: "GOOGLE_VISION_WEB_DETECTION",
    source_name: `${host} / Vision ${matchType.replace(/_/g, " ")}`,
    source_type: "web_detection",
    source_url: sourceRef,
    source_page: sourceRef,
    retrieved_via: "visionWebDetection",
    run_mode: "automated_vision_web_detection_fetch",
    screenshot_path_or_status: "not_captured_phase_2_vision_adapter",
    transform: "none",
    expected: "unknown",
    vision_match_type: matchType,
    vision_score: Number.isFinite(Number(score)) ? Number(score) : null,
    notes: "Candidate image URL came from Google Cloud Vision WEB_DETECTION and must pass local perceptual-hash matching before alert creation.",
  };
}

function pushImageGroup(candidates, group, context) {
  (group.items || []).forEach((image, index) => {
    const candidate = candidateFromImage({
      ...context,
      imageUrl: image.url,
      matchType: group.matchType,
      index,
      score: image.score,
    });
    if (candidate) candidates.push(candidate);
  });
}

function extractCandidatesFromWebDetection(webDetection, context) {
  const candidates = [];
  pushImageGroup(candidates, { matchType: "full_matching_image", items: webDetection.fullMatchingImages }, context);
  pushImageGroup(candidates, { matchType: "partial_matching_image", items: webDetection.partialMatchingImages }, context);
  pushImageGroup(candidates, { matchType: "visually_similar_image", items: webDetection.visuallySimilarImages }, context);

  (webDetection.pagesWithMatchingImages || []).forEach((page, pageIndex) => {
    const pageContext = { ...context, sourcePageUrl: page.url };
    pushImageGroup(
      candidates,
      { matchType: `page_full_matching_image_${pageIndex}`, items: page.fullMatchingImages },
      pageContext,
    );
    pushImageGroup(
      candidates,
      { matchType: `page_partial_matching_image_${pageIndex}`, items: page.partialMatchingImages },
      pageContext,
    );
  });

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.image_ref}|${candidate.source_url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createVisionRequestBody(imageUrl, maxResults) {
  return {
    requests: [
      {
        image: {
          source: {
            imageUri: imageUrl,
          },
        },
        features: [
          {
            maxResults,
            type: "WEB_DETECTION",
          },
        ],
      },
    ],
  };
}

async function callVisionWebDetection({ imageUrl, maxResults, projectId }) {
  const { accessToken, source } = await getGoogleAccessToken();
  const response = await fetch(VISION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-goog-user-project": projectId,
    },
    body: JSON.stringify(createVisionRequestBody(imageUrl, maxResults)),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Vision WEB_DETECTION failed: HTTP ${response.status} ${redactSignedQueryInText(JSON.stringify(payload))}`);
  }
  const firstResponse = payload.responses?.[0] || {};
  if (firstResponse.error) {
    throw new Error(`Vision WEB_DETECTION returned error: ${redactSignedQueryInText(JSON.stringify(firstResponse.error))}`);
  }

  return {
    authSource: source,
    webDetection: firstResponse.webDetection || {},
  };
}

export function createVisionWebDetectionAdapter(options = {}) {
  const projectId = options.projectId || process.env.TTD_GCP_PROJECT_ID || DEFAULT_PROJECT_ID;
  const cachePath = options.cachePath;
  const costLogPath = options.costLogPath;
  const maxResults = Number(options.maxResults || process.env.TTD_VISION_MAX_RESULTS || DEFAULT_MAX_RESULTS);
  const maxCandidatesPerAsset = Number(
    options.maxCandidatesPerAsset ||
      process.env.TTD_VISION_MAX_CANDIDATES_PER_ASSET ||
      DEFAULT_MAX_CANDIDATES_PER_ASSET,
  );
  const cacheTtlDays = Number(options.cacheTtlDays || process.env.TTD_VISION_CACHE_TTL_DAYS || DEFAULT_CACHE_TTL_DAYS);
  const billableEnabled = parseBooleanEnv("TTD_VISION_BILLABLE", options.billableEnabled === true);
  const dryRun = parseBooleanEnv("TTD_VISION_DRY_RUN", !billableEnabled);
  const includeInternal = parseBooleanEnv("TTD_VISION_INCLUDE_INTERNAL", false);
  const budgetGuard = options.budgetGuard || createBudgetGuard({ costLogPath });
  budgetGuard.ensureLog();

  const stats = {
    dry_run: dryRun,
    billable_enabled: billableEnabled,
    paid_api_used: false,
    api_requests: 0,
    cache_hits: 0,
    dry_run_skips: 0,
    blocked_by_budget: 0,
    missing_query_image: 0,
    candidates_returned: 0,
    budget_guard_respected: true,
    budget_within_cap: true,
    all_calls_allowed: true,
    auth_sources: [],
  };

  async function getCandidates(protectedAsset) {
    const queryImageUrl = assetImageUrl(protectedAsset);
    if (!queryImageUrl) {
      stats.missing_query_image += 1;
      return [];
    }

    const key = cacheKeyForAsset(protectedAsset, queryImageUrl, { maxResults });
    const cache = readCache(cachePath);
    const cached = cache.entries[key];
    if (isFreshCacheEntry(cached)) {
      stats.cache_hits += 1;
      budgetGuard.recordEvent({
        type: "cache_hit",
        asset_id: protectedAsset.asset_id,
        units: 0,
        billable_call: false,
        note: "Vision WEB_DETECTION cache hit; no paid API request made.",
      });
      const cachedCandidates = extractCandidatesFromWebDetection(cached.webDetection || {}, {
        protectedAsset,
        includeInternal,
      }).slice(0, maxCandidatesPerAsset);
      stats.candidates_returned += cachedCandidates.length;
      return cachedCandidates;
    }

    if (dryRun || !billableEnabled) {
      stats.dry_run_skips += 1;
      budgetGuard.recordEvent({
        type: "dry_run",
        asset_id: protectedAsset.asset_id,
        units: 0,
        billable_call: false,
        note: "Vision WEB_DETECTION dry-run; set TTD_VISION_BILLABLE=1 to allow a budget-guarded request.",
      });
      return [];
    }

    const budgetCheck = budgetGuard.checkCanSpend({
      units: 1,
      reason: "Vision WEB_DETECTION per protected asset",
      assetId: protectedAsset.asset_id,
    });
    if (!budgetCheck.allowed) {
      stats.blocked_by_budget += 1;
      stats.budget_guard_respected = true;
      stats.budget_within_cap = false;
      stats.all_calls_allowed = false;
      budgetGuard.recordEvent({
        type: "blocked_by_budget",
        asset_id: protectedAsset.asset_id,
        units: 0,
        billable_call: false,
        projected_monthly_cost_ntd: budgetCheck.projected_monthly_cost_ntd,
        note: budgetCheck.message,
      });
      return [];
    }

    const { authSource, webDetection } = await callVisionWebDetection({
      imageUrl: queryImageUrl,
      maxResults,
      projectId,
    });
    stats.api_requests += 1;
    stats.paid_api_used = true;
    if (!stats.auth_sources.includes(authSource)) stats.auth_sources.push(authSource);

    budgetGuard.recordEvent({
      type: "vision_request",
      asset_id: protectedAsset.asset_id,
      units: 1,
      billable_call: true,
      within_free_tier: budgetCheck.within_free_tier,
      estimated_incremental_cost_ntd: budgetCheck.estimated_incremental_cost_ntd,
      projected_monthly_cost_ntd: budgetCheck.projected_monthly_cost_ntd,
      note: budgetCheck.within_free_tier
        ? "Budget-guarded Vision WEB_DETECTION request completed within the monthly free tier."
        : "Budget-guarded Vision WEB_DETECTION request completed.",
    });

    const now = new Date();
    cache.entries[key] = {
      asset_id: protectedAsset.asset_id,
      query_image_ref: redactUrl(queryImageUrl),
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + cacheTtlDays * 24 * 60 * 60 * 1000).toISOString(),
      max_results: maxResults,
      webDetection: sanitizeUrlFields(webDetection),
    };
    writeCache(cachePath, cache);

    const candidates = extractCandidatesFromWebDetection(webDetection || {}, {
      protectedAsset,
      includeInternal,
    }).slice(0, maxCandidatesPerAsset);
    stats.candidates_returned += candidates.length;
    return candidates;
  }

  return {
    id: "visionWebDetection",
    mode: dryRun || !billableEnabled ? "vision_web_detection_dry_run" : "vision_web_detection_budget_guarded",
    getCandidates,
    getRunSummary() {
      return {
        ...stats,
        project_id: projectId,
        max_results: maxResults,
        max_candidates_per_asset: maxCandidatesPerAsset,
        cache_path: path.basename(cachePath),
        cost_log_path: path.basename(costLogPath),
        cost_summary: budgetGuard.summarizeMonth(),
      };
    },
  };
}
