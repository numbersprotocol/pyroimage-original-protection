import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  containsSignedQueryMaterial,
  fingerprintBuffer,
  inferImageExtension,
  redactSignedQueryInText,
  redactUrl,
  reencodeImageBuffer,
  sha256Buffer,
} from "./lib/perceptualHash.js";
import {
  DEFAULT_MATCH_THRESHOLD,
  buildIndexByAssetId,
  loadIndexedEntries,
  matchCandidateToProtectedAsset,
  queryIndex,
} from "./lib/matcher.js";
import { combineAdapters, getCandidatesForAsset } from "./lib/sourceAdapter.js";
import { createSeedUrlsAdapter } from "./lib/adapters/seedUrls.js";
import { createVisionWebDetectionAdapter } from "./lib/adapters/visionWebDetection.js";
import { createNamedChannelCrawlerAdapter } from "./lib/adapters/namedChannels.js";
import { createBudgetGuard } from "./lib/budgetGuard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const INPUT_DIR = process.env.TTD_INPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");
const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || INPUT_DIR;
const PATROL_STATE_DIR = process.env.TTD_PATROL_STATE_DIR || path.resolve(__dirname, "../.patrol-state");
const DEMO_ASSETS = path.join(INPUT_DIR, "demo-assets.json");
const IMAGE_INDEX = path.join(INPUT_DIR, "image-index.jsonl");
const MONITORED_SOURCES = path.join(INPUT_DIR, "monitored-sources.json");
const PATROL_SEEDS = process.env.TTD_PATROL_SEEDS || path.join(INPUT_DIR, "patrol-seeds.json");
const VISION_CACHE = process.env.TTD_VISION_CACHE || path.join(PATROL_STATE_DIR, "vision-web-detection-cache.json");
const VISION_COST_LOG = process.env.TTD_VISION_COST_LOG || path.join(PATROL_STATE_DIR, "vision-cost-log.json");
const FETCH_TIMEOUT_MS = Number(process.env.TTD_PATROL_TIMEOUT_MS || 15000);
const MAX_IMAGE_BYTES = Number(process.env.TTD_PATROL_MAX_IMAGE_BYTES || 2_000_000);
const MATCH_THRESHOLD = Number(process.env.TTD_PATROL_MATCH_THRESHOLD || DEFAULT_MATCH_THRESHOLD);
const EXPECTED_FILTER = process.env.TTD_PATROL_EXPECTED || "all";
const PATROL_ADAPTER = process.env.TTD_PATROL_ADAPTER || "seedUrls";
const PROTECTED_ASSET_LIMIT = Number(process.env.TTD_PATROL_PROTECTED_ASSET_LIMIT || (PATROL_ADAPTER === "seedUrls" ? 0 : 1));
const STRICT_MODE = process.env.TTD_PATROL_STRICT === "1" || process.env.TTD_PATROL_STRICT === "true";
const USER_AGENT = "Numbers-TTD-MVP-patrol/1.0";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(fileName, data) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function compactId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function buildQueryTerms(asset) {
  return [
    asset.display_title,
    asset.creator_name,
    asset.caption,
    asset.asset_id?.slice(0, 16),
  ].filter((value) => typeof value === "string" && value.trim().length > 0);
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function validationPassForExpected(candidate, verdict) {
  if (candidate.expected === "match") return verdict === "match";
  if (candidate.expected === "no_match") return verdict === "no_match";
  return true;
}

function validationPassForCandidateError(candidate) {
  return candidate.expected === "unknown" || !candidate.expected;
}

function selectProtectedAssetIds({ adapter, seedDocument, demoAssets, indexedEntries }) {
  if (adapter.id === "seedUrls") {
    return [...new Set((seedDocument.seeds || []).map((seed) => seed.protected_asset_id))];
  }

  const explicitAssetIds = parseCsv(process.env.TTD_PATROL_ASSET_IDS);
  const indexedAssetIds = new Set(indexedEntries.map((entry) => entry.asset_id));
  const candidateAssetIds = explicitAssetIds.length > 0 ? explicitAssetIds : demoAssets.map((asset) => asset.asset_id);
  const selected = candidateAssetIds.filter((assetId) => indexedAssetIds.has(assetId));
  return PROTECTED_ASSET_LIMIT > 0 ? selected.slice(0, PROTECTED_ASSET_LIMIT) : selected;
}

function createPatrolAdapter({ demoAssets }) {
  const createVision = () =>
    createVisionWebDetectionAdapter({
      cachePath: VISION_CACHE,
      costLogPath: VISION_COST_LOG,
      budgetGuard: createBudgetGuard({ costLogPath: VISION_COST_LOG }),
    });
  const createChannels = () =>
    createNamedChannelCrawlerAdapter({
      monitoredSourcesPath: MONITORED_SOURCES,
    });

  if (PATROL_ADAPTER === "seedUrls") {
    return createSeedUrlsAdapter({
      seedFilePath: PATROL_SEEDS,
      demoAssets,
      expectedFilter: EXPECTED_FILTER,
    });
  }

  if (PATROL_ADAPTER === "vision") {
    return createVision();
  }

  if (PATROL_ADAPTER === "channels") {
    return createChannels();
  }

  if (PATROL_ADAPTER === "vision+channels") {
    return combineAdapters([createVision(), createChannels()], {
      mode: "vision_web_detection_plus_public_channel_crawl",
    });
  }

  throw new Error(`Unsupported TTD_PATROL_ADAPTER=${PATROL_ADAPTER}. Expected "seedUrls", "vision", "channels", or "vision+channels".`);
}

async function fetchImageBuffer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${redactUrl(url)}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`non-image response content-type=${contentType || "blank"} for ${redactUrl(url)}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`image exceeds max bytes (${buffer.length} > ${MAX_IMAGE_BYTES}) for ${redactUrl(url)}`);
    }
    return {
      buffer,
      contentType,
      contentLength: Number(response.headers.get("content-length") || buffer.length),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function applyCandidateTransform(candidate, fetched, tempDir) {
  if (candidate.transform !== "reencode_jpeg_160") {
    return {
      buffer: fetched.buffer,
      contentType: fetched.contentType,
      transformNotes: "Fetched candidate image was fingerprinted without transformation.",
    };
  }

  const buffer = reencodeImageBuffer(fetched.buffer, {
    tempDir,
    prefix: compactId(candidate.candidate_id),
    inputExtension: inferImageExtension(fetched.contentType),
    maxImageBytes: MAX_IMAGE_BYTES,
  });

  return {
    buffer,
    contentType: "image/jpeg",
    transformNotes: "Fetched candidate image was re-encoded locally to 160px JPEG via ffmpeg before fingerprinting.",
  };
}

async function inspectCandidate({ candidate, protectedAsset, protectedIndexEntry, indexedEntries, runId, tempDir }) {
  const startedAt = new Date().toISOString();
  const sourceRunBase = {
    run_id: `${runId}-${compactId(candidate.candidate_id)}`,
    source_id: candidate.source_id,
    source_name: candidate.source_name,
    source_url: candidate.source_url,
    run_mode: candidate.run_mode || `automated_${candidate.retrieved_via || "source_adapter"}_fetch`,
    started_at: startedAt,
    completed_at: "",
    query_terms: buildQueryTerms(protectedAsset),
    protected_asset_id: protectedAsset.asset_id,
    candidate_id: candidate.candidate_id,
    candidate_image_ref: candidate.image_ref,
    screenshot_path_or_status: candidate.screenshot_path_or_status || "not_captured_current_phase",
    review_status: "not_reviewed",
    public_claim_status: "internal_only",
  };

  if (!candidate.image_url) {
    return {
      sourceRun: {
        ...sourceRunBase,
        completed_at: new Date().toISOString(),
        status: "fetch_failed",
        notes: "Seed candidate did not resolve to an image URL.",
      },
      alert: null,
      caseRecord: null,
      validation: { candidate_id: candidate.candidate_id, expected: candidate.expected, pass: false, error: "missing_image_url" },
    };
  }

  try {
    const fetched = await fetchImageBuffer(candidate.image_url);
    const transformed = applyCandidateTransform(candidate, fetched, tempDir);
    const fingerprint = fingerprintBuffer(transformed.buffer, {
      tempDir,
      prefix: `${compactId(candidate.candidate_id)}-fingerprint`,
      extension: inferImageExtension(transformed.contentType),
    });
    const targetMatch = matchCandidateToProtectedAsset(fingerprint, protectedIndexEntry, { threshold: MATCH_THRESHOLD });
    const fullIndexQuery = queryIndex(
      {
        asset_id: candidate.candidate_id,
        display_title: candidate.source_name,
        ahash64: fingerprint.ahash64,
        dhash64: fingerprint.dhash64,
      },
      indexedEntries,
    );
    const completedAt = new Date().toISOString();
    const sourceRun = {
      ...sourceRunBase,
      completed_at: completedAt,
      status: targetMatch.pass ? "match_alert_created" : "no_match",
      notes: targetMatch.pass
        ? "Real fetched candidate matched the protected asset within the configured perceptual-hash threshold."
        : "Real fetched candidate did not match the protected asset; no alert was created.",
      fetched_content_type: fetched.contentType,
      fetched_bytes: fetched.buffer.length,
      transformed_bytes: transformed.buffer.length,
      candidate_sha256: sha256Buffer(transformed.buffer),
      candidate_fingerprint: `ahash:${fingerprint.ahash64};dhash:${fingerprint.dhash64}`,
      top_index_match_asset_id: fullIndexQuery.top_match?.asset_id || null,
      top_index_match_distance: fullIndexQuery.top_match?.combined_distance ?? null,
      protected_asset_distance: targetMatch.combined_distance,
      protected_asset_similarity_score: targetMatch.similarity_score,
      threshold: MATCH_THRESHOLD,
    };

    if (!targetMatch.pass) {
      return {
        sourceRun,
        alert: null,
        caseRecord: null,
        validation: {
          candidate_id: candidate.candidate_id,
          expected: candidate.expected,
          verdict: targetMatch.verdict,
          protected_asset_distance: targetMatch.combined_distance,
          top_index_match_asset_id: fullIndexQuery.top_match?.asset_id || null,
          pass: validationPassForExpected(candidate, targetMatch.verdict),
        },
      };
    }

    const caseId = `case_patrol_${compactId(candidate.candidate_id).toLowerCase()}`;
    const alertId = `ALERT-${caseId.toUpperCase()}`;
    const isVisionCandidate = candidate.retrieved_via === "visionWebDetection";
    const isNamedChannelCandidate = candidate.retrieved_via === "namedChannelCrawler";
    const alert = {
      alert_id: alertId,
      alert_status: "pending_human_review",
      protected_asset_id: protectedAsset.asset_id,
      source_id: candidate.source_id,
      source_name: candidate.source_name,
      source_url: candidate.source_url,
      retrieved_at: completedAt,
      query_terms: buildQueryTerms(protectedAsset),
      match_basis: targetMatch.match_basis,
      similarity_score: targetMatch.similarity_score,
      similarity_distance: targetMatch.combined_distance,
      similarity_threshold: MATCH_THRESHOLD,
      distance_scale:
        "0 to 128 combined Hamming distance across aHash64 and dHash64; lower is more similar",
      transformation_notes: transformed.transformNotes,
      review_status: "pending_human_review",
      public_claim_status: "internal_only",
      evidence_label: "actual",
      case_id: caseId,
      candidate_item_id: candidate.candidate_id,
      source_fixture_label: isVisionCandidate
        ? "vision_web_detection_real_candidate"
        : isNamedChannelCandidate
        ? "named_channel_real_candidate"
        : "seed_urls_real_fetched_candidate",
      candidate_image_ref: candidate.image_ref,
      display_copy: {
        badge: "real_patrol_match",
        case_label: isVisionCandidate
          ? "Real hash match from Vision web detection"
          : isNamedChannelCandidate
          ? "Real hash match from public channel crawl"
          : "Real hash match from seed adapter",
        public_use_notice:
          isVisionCandidate
            ? "This alert was created from a real Vision-discovered web candidate and a real perceptual-hash match. Human review must verify source context before any public infringement claim."
            : isNamedChannelCandidate
            ? "This alert was created from a real public-channel crawl candidate and a real perceptual-hash match. Human review must verify source context before any public infringement claim."
            : "This alert was created from a real fetched candidate image and a real perceptual-hash match. The seed source is a controlled patrol input, so it is not an external infringement claim.",
        reviewer_prompt:
          "Human review must verify source context and authorization before any external claim or takedown action.",
      },
      dashboard_metric_effect: {
        suspected_events_actual: 0,
        real_patrol_matches: 1,
        simulated_cases: 0,
        counts_toward_market_validation: false,
      },
    };
    const caseRecord = {
      case_id: caseId,
      case_type: isVisionCandidate
        ? "real_vision_patrol_match_pending_external_review"
        : isNamedChannelCandidate
        ? "real_channel_patrol_match_pending_external_review"
        : "real_seed_patrol_match_pending_external_review",
      original_asset_id: protectedAsset.asset_id,
      source_name: candidate.source_name,
      source_type: candidate.source_type,
      captured_at: completedAt,
      evidence_label: "actual",
      report_ready: false,
      alert_id: alert.alert_id,
      source_id: alert.source_id,
      source_url: alert.source_url,
      protected_asset_title: protectedAsset.display_title || protectedAsset.headline || "",
      protected_asset_creator: protectedAsset.creator_name || "",
      review_status: "pending_human_review",
      public_claim_status: "internal_only",
      actuality_label: isVisionCandidate
        ? "real_vision_fetched_hash_match_pending_external_review"
        : isNamedChannelCandidate
        ? "real_channel_fetched_hash_match_pending_external_review"
        : "real_fetched_hash_match_not_external_infringement_claim",
      market_validation_label: "not_market_validation",
      report_status: isVisionCandidate
        ? "phase_2_vision_patrol_match"
        : isNamedChannelCandidate
        ? "mvp_channel_patrol_match"
        : "phase_1_seed_patrol_match",
      recommended_next_step:
        isVisionCandidate
          ? "Verify page context, authorization, and screenshot evidence before any takedown or external claim."
          : isNamedChannelCandidate
          ? "Verify page context, channel terms, authorization, and screenshot evidence before any takedown or external claim."
          : "Use this seed match to verify the patrol pipeline. Replace seed adapter candidates with Vision or authorized channel candidates before making external infringement claims.",
    };

    return {
      sourceRun,
      alert,
      caseRecord,
      validation: {
        candidate_id: candidate.candidate_id,
        expected: candidate.expected,
        verdict: targetMatch.verdict,
        protected_asset_distance: targetMatch.combined_distance,
        top_index_match_asset_id: fullIndexQuery.top_match?.asset_id || null,
        pass: validationPassForExpected(candidate, targetMatch.verdict),
      },
    };
  } catch (error) {
    return {
      sourceRun: {
        ...sourceRunBase,
        completed_at: new Date().toISOString(),
        status: "fetch_or_match_failed",
        notes: redactSignedQueryInText(error.message),
      },
      alert: null,
      caseRecord: null,
      validation: {
        candidate_id: candidate.candidate_id,
        expected: candidate.expected,
        pass: validationPassForCandidateError(candidate),
        warning: validationPassForCandidateError(candidate),
        error: redactSignedQueryInText(error.message),
      },
    };
  }
}

function containsSignedQuery(value) {
  const text = JSON.stringify(value);
  return containsSignedQueryMaterial(text);
}

function buildPatrolLimitations(adapterId) {
  const limitations = [];
  if (adapterId.includes("seedUrls")) {
    limitations.push("SeedUrls candidates prove the patrol pipeline without paid reverse-image search.");
    limitations.push("A seed match is a real fetched-image hash match, but it is not an external infringement claim.");
  }
  if (adapterId.includes("visionWebDetection")) {
    limitations.push("Vision WEB_DETECTION is budget-guarded; dry-run returns zero Vision candidates unless TTD_VISION_BILLABLE=1 is explicitly set.");
    limitations.push("Vision candidates must still pass local perceptual-hash matching and human review before any external claim.");
  }
  if (adapterId.includes("namedChannelCrawler")) {
    limitations.push("Named-channel patrol fetches only configured public pages; it does not log in, bypass paywalls, bypass age gates, bypass anti-bot controls, or override robots/terms restrictions.");
    limitations.push("Named-channel candidates must still pass local perceptual-hash matching and human source-context review before any external claim.");
  }
  limitations.push("Screenshot capture and external source context require human review before takedown or public infringement claims.");
  limitations.push("Google Cloud Vision WEB_DETECTION spend is recorded in vision-cost-log.json and blocked before the 90% monthly cap whenever Vision is enabled.");
  return limitations;
}

async function main() {
  const startedAt = new Date().toISOString();
  const runId = `ttd-patrol-${startedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
  const demoAssets = readJson(DEMO_ASSETS);
  const indexedEntries = loadIndexedEntries(IMAGE_INDEX);
  const indexByAssetId = buildIndexByAssetId(indexedEntries);
  const assetById = new Map(demoAssets.map((asset) => [asset.asset_id, asset]));
  const adapter = createPatrolAdapter({ demoAssets });
  const seedDoc = adapter.seedDocument || { seeds: [] };
  const protectedAssetIds = selectProtectedAssetIds({
    adapter,
    seedDocument: seedDoc,
    demoAssets,
    indexedEntries,
  });
  const sourceRuns = [];
  const alerts = [];
  const cases = [];
  const validations = [];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ttd-patrol-"));

  const isSeedUrls = PATROL_ADAPTER === "seedUrls";
  const isVision = PATROL_ADAPTER === "vision";
  const isChannels = PATROL_ADAPTER === "channels";
  const isCombined = PATROL_ADAPTER === "vision+channels";

  let candidateFingerprintsComputedGlobal = 0;

  const runPerAssetAdapter = async (currentAdapter) => {
    for (const protectedAssetId of protectedAssetIds) {
      const protectedAsset = assetById.get(protectedAssetId);
      const protectedIndexEntry = indexByAssetId.get(protectedAssetId);
      if (!protectedAsset || !protectedIndexEntry) {
        validations.push({
          protected_asset_id: protectedAssetId,
          pass: false,
          error: !protectedAsset ? "missing_protected_asset" : "missing_index_entry",
        });
        continue;
      }

      const candidates = await getCandidatesForAsset(currentAdapter, protectedAsset);
      for (const candidate of candidates) {
        const result = await inspectCandidate({
          candidate,
          protectedAsset,
          protectedIndexEntry,
          indexedEntries,
          runId,
          tempDir,
        });
        sourceRuns.push(result.sourceRun);
        validations.push(result.validation);
        if (result.alert) alerts.push(result.alert);
        if (result.caseRecord) cases.push(result.caseRecord);
      }
    }
  };

  const runCandidateCentricChannels = async (channelsAdapter) => {
    const candidates = await getCandidatesForAsset(channelsAdapter, { asset_id: "any" });

    for (const candidate of candidates) {
      try {
        const fetched = await fetchImageBuffer(candidate.image_url);
        const transformed = applyCandidateTransform(candidate, fetched, tempDir);
        const fingerprint = fingerprintBuffer(transformed.buffer, {
          tempDir,
          prefix: `${compactId(candidate.candidate_id)}-fingerprint`,
          extension: inferImageExtension(transformed.contentType),
        });
        candidateFingerprintsComputedGlobal += 1;

        const fullIndexQuery = queryIndex(
          {
            asset_id: candidate.candidate_id,
            display_title: candidate.source_name,
            ahash64: fingerprint.ahash64,
            dhash64: fingerprint.dhash64,
          },
          indexedEntries,
        );

        const topMatch = fullIndexQuery.top_match;
        const isMatch = topMatch && topMatch.combined_distance <= MATCH_THRESHOLD;

        if (isMatch) {
          const matchedAssetId = topMatch.asset_id;
          const protectedAsset = assetById.get(matchedAssetId);
          const protectedIndexEntry = indexByAssetId.get(matchedAssetId);

          const matchedCandidate = {
            ...candidate,
            protected_asset_id: matchedAssetId,
            candidate_id: candidate.candidate_id.replaceAll("any", compactId(matchedAssetId)),
          };

          const result = await inspectCandidate({
            candidate: matchedCandidate,
            protectedAsset,
            protectedIndexEntry,
            indexedEntries,
            runId,
            tempDir,
          });

          sourceRuns.push(result.sourceRun);
          validations.push(result.validation);
          if (result.alert) alerts.push(result.alert);
          if (result.caseRecord) cases.push(result.caseRecord);
        } else {
          const completedAt = new Date().toISOString();
          const closestAssetId = topMatch?.asset_id || protectedAssetIds[0] || demoAssets[0]?.asset_id;
          const closestAsset = assetById.get(closestAssetId) || demoAssets[0];

          candidate.protected_asset_id = closestAssetId;
          candidate.candidate_id = candidate.candidate_id.replaceAll("any", compactId(closestAssetId));

          const sourceRun = {
            run_id: `${runId}-${compactId(candidate.candidate_id)}`,
            source_id: candidate.source_id,
            source_name: candidate.source_name,
            source_url: candidate.source_url,
            run_mode: candidate.run_mode || "automated_public_channel_crawl",
            started_at: startedAt,
            completed_at: completedAt,
            query_terms: buildQueryTerms(closestAsset),
            protected_asset_id: closestAssetId,
            candidate_id: candidate.candidate_id,
            candidate_image_ref: candidate.image_ref,
            screenshot_path_or_status: candidate.screenshot_path_or_status || "not_captured_current_phase",
            review_status: "not_reviewed",
            public_claim_status: "internal_only",
            status: "no_match",
            notes: "Real fetched candidate did not match the protected asset; no alert was created.",
            fetched_content_type: fetched.contentType,
            fetched_bytes: fetched.buffer.length,
            transformed_bytes: transformed.buffer.length,
            candidate_sha256: sha256Buffer(transformed.buffer),
            candidate_fingerprint: `ahash:${fingerprint.ahash64};dhash:${fingerprint.dhash64}`,
            top_index_match_asset_id: topMatch?.asset_id || null,
            top_index_match_distance: topMatch?.combined_distance ?? null,
            protected_asset_distance: topMatch?.combined_distance ?? null,
            protected_asset_similarity_score: topMatch?.similarity_score ?? null,
            threshold: MATCH_THRESHOLD,
          };

          const validation = {
            candidate_id: candidate.candidate_id,
            expected: candidate.expected,
            verdict: "no_match",
            protected_asset_distance: topMatch?.combined_distance ?? null,
            top_index_match_asset_id: topMatch?.asset_id || null,
            pass: true,
          };

          sourceRuns.push(sourceRun);
          validations.push(validation);
        }
      } catch (error) {
        const completedAt = new Date().toISOString();
        const closestAssetId = protectedAssetIds[0] || demoAssets[0]?.asset_id;
        const closestAsset = assetById.get(closestAssetId) || demoAssets[0];

        candidate.protected_asset_id = closestAssetId;
        candidate.candidate_id = candidate.candidate_id.replaceAll("any", compactId(closestAssetId));

        const sourceRun = {
          run_id: `${runId}-${compactId(candidate.candidate_id)}`,
          source_id: candidate.source_id,
          source_name: candidate.source_name,
          source_url: candidate.source_url,
          run_mode: candidate.run_mode || "automated_public_channel_crawl",
          started_at: startedAt,
          completed_at: completedAt,
          query_terms: buildQueryTerms(closestAsset),
          protected_asset_id: closestAssetId,
          candidate_id: candidate.candidate_id,
          candidate_image_ref: candidate.image_ref,
          screenshot_path_or_status: candidate.screenshot_path_or_status || "not_captured_current_phase",
          review_status: "not_reviewed",
          public_claim_status: "internal_only",
          status: "fetch_or_match_failed",
          notes: redactSignedQueryInText(error.message),
        };

        const validation = {
          candidate_id: candidate.candidate_id,
          expected: candidate.expected,
          pass: true,
          warning: true,
          error: redactSignedQueryInText(error.message),
        };

        sourceRuns.push(sourceRun);
        validations.push(validation);
      }
    }
  };

  try {
    if (isSeedUrls) {
      await runPerAssetAdapter(adapter);
    } else if (isVision) {
      await runPerAssetAdapter(adapter);
    } else if (isChannels) {
      await runCandidateCentricChannels(adapter);
    } else if (isCombined) {
      const createVision = () =>
        createVisionWebDetectionAdapter({
          cachePath: VISION_CACHE,
          costLogPath: VISION_COST_LOG,
          budgetGuard: createBudgetGuard({ costLogPath: VISION_COST_LOG }),
        });
      const createChannels = () =>
        createNamedChannelCrawlerAdapter({
          monitoredSourcesPath: MONITORED_SOURCES,
        });

      const visionAdapter = createVision();
      const channelsAdapter = createChannels();

      await runPerAssetAdapter(visionAdapter);
      await runCandidateCentricChannels(channelsAdapter);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const completedAt = new Date().toISOString();
  const adapterSummary = typeof adapter.getRunSummary === "function"
    ? adapter.getRunSummary()
    : {
        dry_run: false,
        billable_enabled: false,
        paid_api_used: false,
        budget_guard_respected: true,
      };
  const monitoringRun = {
    generated_at: completedAt,
    run_id: runId,
    monitoring_label: "source-agnostic automated patrol",
    adapter: {
      id: adapter.id,
      mode: adapter.mode || (adapter.id === "seedUrls" ? "zero_cost_seed_urls" : "source_adapter"),
      expected_filter: EXPECTED_FILTER,
      paid_api_used: adapterSummary.paid_api_used === true,
      billable_enabled: adapterSummary.billable_enabled === true,
      dry_run: adapterSummary.dry_run === true,
      budget_guard_respected: adapterSummary.budget_guard_respected !== false,
      details: adapterSummary,
    },
    run_scope: {
      protected_assets_considered: protectedAssetIds.length,
      candidates_attempted: sourceRuns.length,
      candidates_matched: alerts.length,
      alerts_created: alerts.length,
      phase2_index_rows: indexedEntries.length,
      match_threshold: MATCH_THRESHOLD,
      ...(isChannels || isCombined ? {
        source_pages_fetched: isCombined 
          ? (adapterSummary.per_adapter?.find(item => item.id === "namedChannelCrawler")?.summary?.pages_fetched || 0)
          : (adapterSummary.pages_fetched || 0),
        candidate_inventory_count: isCombined
          ? (adapterSummary.per_adapter?.find(item => item.id === "namedChannelCrawler")?.summary?.images_discovered || 0)
          : (adapterSummary.images_discovered || 0),
        candidate_fingerprints_computed: candidateFingerprintsComputedGlobal,
      } : {})
    },
    started_at: startedAt,
    completed_at: completedAt,
    status: sourceRuns.some((run) => run.status.endsWith("failed")) ? "completed_with_candidate_errors" : "completed",
    source_runs: sourceRuns,
    limitations: buildPatrolLimitations(adapter.id),
  };
  const reviewStates = alerts.map((alert) => ({
    alert_id: alert.alert_id,
    review_status: "pending_human_review",
    reviewed_by: "unassigned_human_reviewer",
    reviewed_at: null,
    review_note: "Real patrol match awaits human review before any public claim.",
    next_action: "Verify source context, authorization, and screenshot evidence before any external claim.",
    is_current: true,
    public_claim_status: "internal_only",
  }));
  const validation = {
    generated_at: completedAt,
    run_id: runId,
    adapter: adapter.id,
    expected_filter: EXPECTED_FILTER,
    threshold: MATCH_THRESHOLD,
    validations,
    pass: {
      reencoded_seed_match_alert_created:
        adapter.id !== "seedUrls" || EXPECTED_FILTER === "no_match"
          ? true
          : validations.some((item) => item.expected === "match" && item.pass === true),
      unrelated_seed_no_alert:
        adapter.id !== "seedUrls" || EXPECTED_FILTER === "match"
          ? true
          : validations.some((item) => item.expected === "no_match" && item.pass === true),
      source_adapter_completed: validations.every((item) => item.pass !== false),
      budget_guard_respected: adapterSummary.budget_guard_respected !== false,
      paid_api_policy_respected: adapterSummary.paid_api_used !== true || adapterSummary.billable_enabled === true,
      signed_query_strings_written_to_artifacts: containsSignedQuery({ alerts, cases, monitoringRun, reviewStates }),
    },
  };
  validation.pass.all = Object.entries(validation.pass)
    .filter(([key]) => key !== "signed_query_strings_written_to_artifacts")
    .every(([, value]) => value === true) && validation.pass.signed_query_strings_written_to_artifacts === false;

  const alertValidation = {
    generated_at: completedAt,
    run_id: runId,
    source: "runPatrol.js",
    alert_count: alerts.length,
    case_count: cases.length,
    alerts_are_real_fetched_hash_matches: alerts.every((alert) => alert.evidence_label === "actual"),
    suspected_events_actual: alerts.reduce((sum, alert) => sum + (alert.dashboard_metric_effect?.suspected_events_actual || 0), 0),
    simulated_cases: alerts.reduce((sum, alert) => sum + (alert.dashboard_metric_effect?.simulated_cases || 0), 0),
    public_claim_statuses: [...new Set(alerts.map((alert) => alert.public_claim_status))],
    pass: validation.pass.all,
    limitations: buildPatrolLimitations(adapter.id),
  };

  writeJson("alerts.json", alerts);
  writeJson("cases.json", cases);
  writeJson("review-states.json", reviewStates);
  writeJson("monitoring-run.json", monitoringRun);
  writeJson("patrol-validation.json", validation);
  writeJson("alert-validation.json", alertValidation);

  console.log(
    JSON.stringify(
      {
        output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
        run_id: runId,
        candidates_attempted: sourceRuns.length,
        alerts_created: alerts.length,
        validation_pass: validation.pass.all,
        adapter: adapter.id,
        paid_api_used: adapterSummary.paid_api_used === true,
      },
      null,
      2,
    ),
  );

  if (STRICT_MODE && validation.pass.all !== true) {
    throw new Error(`TTD patrol validation failed in strict mode: ${JSON.stringify(validation.pass)}`);
  }
}

main().catch((error) => {
  console.error(redactSignedQueryInText(error.stack || error.message));
  process.exit(1);
});
