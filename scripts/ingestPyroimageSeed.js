import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const HARNESS_DIR = process.env.TTD_HARNESS_DIR || path.join(WORKSPACE_ROOT, ".omni/harness");
const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");

const FULL_SEED = path.join(HARNESS_DIR, "pyroimage-api-seed.jsonl");
const DEMO_SEED = path.join(HARNESS_DIR, "pyroimage-demo-seed-300.jsonl");
const MANIFEST = path.join(HARNESS_DIR, "pyroimage-api-seed-manifest.json");
const COST_LOG = path.join(HARNESS_DIR, "cost-log.csv");

const EXPECTED_FULL_ROWS = 4329;
const EXPECTED_DEMO_ROWS = 300;

const FIELD_CHECKS = [
  "asset_id",
  "cid",
  "uuid",
  "original_url",
  "snapshot_url",
  "mime_type",
  "source_type",
  "public_access",
  "creator_name",
  "rights_holder_owner_name",
  "rights_status",
  "provenance_status",
  "c2pa_status",
  "certificate_link",
  "uploaded_at",
  "demo_candidate",
  "p0_candidate_needs_visual_review",
  "recommended_c2pa_action",
];

const VISUAL_IMAGE_MIME_PREFIX = "image/";

function readJsonl(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON at ${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
}

function safeCount(rows, field) {
  return rows.reduce((acc, row) => {
    const value = row[field];
    const key = value === null || value === undefined || value === "" ? "blank" : String(value);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function isMissing(row, field) {
  if (field === "c2pa_status") {
    return row[field] === undefined;
  }
  const value = row[field];
  return value === undefined || value === null || value === "";
}

function hasQueryString(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    return new URL(value).search.length > 0;
  } catch {
    return false;
  }
}

function sanitizeUrlRef(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split("?")[0];
  }
}

function isImageRow(row) {
  return typeof row.mime_type === "string" && row.mime_type.startsWith(VISUAL_IMAGE_MIME_PREFIX);
}

function fallbackTitle(row) {
  const title = row.headline || row.caption;
  if (typeof title === "string" && title.trim().length > 0) {
    return title.trim();
  }
  return `Untitled ${String(row.asset_id || "asset").slice(0, 12)}`;
}

function normalizeAsset(row) {
  const originalHasQuery = hasQueryString(row.original_url);
  const snapshotHasQuery = hasQueryString(row.snapshot_url);
  return {
    asset_id: row.asset_id || "",
    cid: row.cid || "",
    uuid: row.uuid || "",
    headline: row.headline || "",
    caption: row.caption || "",
    display_title: fallbackTitle(row),
    creator_name: row.creator_name || "",
    rights_holder_owner_name: row.rights_holder_owner_name || "",
    mime_type: row.mime_type || "",
    source_type: row.source_type || "",
    public_access: Boolean(row.public_access),
    uploaded_at: row.uploaded_at || "",
    updated_at: row.updated_at || "",
    c2pa_status: row.c2pa_status ?? null,
    provenance_status: row.provenance_status || "",
    rights_status: row.rights_status || "",
    certificate_link: row.certificate_link || "",
    media_refs: {
      original_url_ref: sanitizeUrlRef(row.original_url),
      snapshot_url_ref: sanitizeUrlRef(row.snapshot_url),
      original_url_query_redacted: originalHasQuery,
      snapshot_url_query_redacted: snapshotHasQuery,
      asset_file_name: row.asset_file_name || "",
      asset_file_size: row.asset_file_size ?? null,
    },
    labels: {
      metric_label: row.metric_label || "actual",
      mvp_baseline_label: row.mvp_baseline_label || "actual",
      demo_candidate: Boolean(row.demo_candidate),
      p0_candidate_needs_visual_review: Boolean(row.p0_candidate_needs_visual_review),
      recommended_c2pa_action: row.recommended_c2pa_action || "",
      visual_demo_eligible: isImageRow(row),
      visual_review_status: row.p0_candidate_needs_visual_review ? "pending_visual_review" : "not_prioritized",
    },
  };
}

function findDuplicates(rows, field) {
  const seen = new Map();
  const duplicates = [];
  rows.forEach((row, index) => {
    const value = row[field];
    if (!value) return;
    if (seen.has(value)) {
      duplicates.push({ field, value, first_seed_index: seen.get(value), duplicate_seed_index: index });
      return;
    }
    seen.set(value, index);
  });
  return duplicates;
}

function summarizeMissingFields(rows) {
  const missingByField = {};
  const rowsWithMissingFields = [];
  FIELD_CHECKS.forEach((field) => {
    missingByField[field] = 0;
  });

  rows.forEach((row) => {
    const missing = FIELD_CHECKS.filter((field) => isMissing(row, field));
    if (missing.length > 0) {
      missing.forEach((field) => {
        missingByField[field] += 1;
      });
      rowsWithMissingFields.push({
        asset_id: row.asset_id || "",
        seed_index: row.seed_index,
        missing_fields: missing,
      });
    }
  });

  return { missingByField, rowsWithMissingFields };
}

function summarizeCostLog() {
  if (!fs.existsSync(COST_LOG)) {
    return {
      available: false,
      paid_query_count: 0,
      cumulative_actual_cost_twd: 0,
      status: "cost-log.csv missing",
    };
  }

  const rows = fs
    .readFileSync(COST_LOG, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const dataRows = rows.slice(1);
  return {
    available: true,
    paid_query_count: dataRows.reduce((sum, row) => {
      const columns = row.split(",");
      return sum + Number(columns[6] || 0);
    }, 0),
    cumulative_actual_cost_twd: dataRows.reduce((sum, row) => {
      const columns = row.split(",");
      return Math.max(sum, Number(columns[11] || 0));
    }, 0),
    status: dataRows.length === 0 ? "actual NT$0; no paid calls logged" : "paid calls logged",
  };
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function writeJsonl(fileName, rows) {
  fs.writeFileSync(
    path.join(OUTPUT_DIR, fileName),
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const manifest = readManifest();
  const fullRows = readJsonl(FULL_SEED);
  const demoRows = readJsonl(DEMO_SEED);
  const normalizedFull = fullRows.map(normalizeAsset);
  const normalizedDemo = demoRows.map(normalizeAsset);
  const fullAssetIds = new Set(fullRows.map((row) => row.asset_id).filter(Boolean));
  const demoMissingFromFull = demoRows
    .filter((row) => !fullAssetIds.has(row.asset_id))
    .map((row) => row.asset_id);

  const duplicateAssets = findDuplicates(fullRows, "asset_id");
  const duplicateCids = findDuplicates(fullRows, "cid");
  const { missingByField, rowsWithMissingFields } = summarizeMissingFields(fullRows);
  const imageRows = fullRows.filter(isImageRow);
  const nonImageRows = fullRows.filter((row) => !isImageRow(row));
  const missingMediaRows = fullRows.filter((row) => isMissing(row, "original_url") && isMissing(row, "snapshot_url"));
  const p0VisualReviewQueue = normalizedDemo.filter((row) => row.labels.p0_candidate_needs_visual_review);
  const demoCandidates = normalizedDemo.filter((row) => row.labels.demo_candidate);
  const cost = summarizeCostLog();

  const c2paStatusCounts = safeCount(fullRows, "c2pa_status");
  const c2paNullCount = (c2paStatusCounts.null || 0) + (c2paStatusCounts.blank || 0);

  const validationSummary = {
    generated_at: new Date().toISOString(),
    source: {
      api_endpoint: manifest.api_endpoint,
      api_filter: manifest.api_filter,
      full_seed_file: ".omni/harness/pyroimage-api-seed.jsonl",
      demo_seed_file: ".omni/harness/pyroimage-demo-seed-300.jsonl",
      manifest_file: ".omni/harness/pyroimage-api-seed-manifest.json",
    },
    expected: {
      full_seed_rows: EXPECTED_FULL_ROWS,
      demo_seed_rows: EXPECTED_DEMO_ROWS,
      c2pa_distribution: {
        signed: 16,
        unsigned: 3840,
        null: 473,
      },
    },
    actual: {
      full_seed_rows_loaded: fullRows.length,
      demo_seed_rows_loaded: demoRows.length,
      unique_asset_id_count: fullAssetIds.size,
      duplicate_asset_id_count: duplicateAssets.length,
      duplicate_cid_count: duplicateCids.length,
      source_type_counts: safeCount(fullRows, "source_type"),
      public_access_counts: safeCount(fullRows, "public_access"),
      mime_type_counts: safeCount(fullRows, "mime_type"),
      image_rows_included_for_visual_demo: imageRows.length,
      non_image_rows_excluded_from_visual_demo: nonImageRows.length,
      missing_media_count: missingMediaRows.length,
      c2pa_status_counts: c2paStatusCounts,
      demo_candidate_count: demoCandidates.length,
      p0_visual_review_queue_count: p0VisualReviewQueue.length,
      demo_rows_missing_from_full_seed_count: demoMissingFromFull.length,
      rows_with_any_missing_checked_field: rowsWithMissingFields.length,
    },
    labels: {
      protected_originals: "actual 4,329 via Numbers API / MVP baseline 4,329",
      demo_seed_rows: "actual 300 metadata rows / selected screenshots require visual review",
      suspected_events: "0 actual until monitoring produces a human-review-safe case",
      partner_feedback: "0 actual / outreach pending",
      tool_spend_twd: cost.status,
    },
    pass: {
      full_seed_row_count_matches: fullRows.length === EXPECTED_FULL_ROWS,
      demo_seed_row_count_matches: demoRows.length === EXPECTED_DEMO_ROWS,
      unique_asset_id_count_matches_loaded_rows: fullAssetIds.size === fullRows.length,
      no_duplicate_asset_ids: duplicateAssets.length === 0,
      expected_c2pa_distribution_matches:
        c2paStatusCounts.signed === 16 &&
        c2paStatusCounts.unsigned === 3840 &&
        c2paNullCount === 473,
      no_demo_rows_missing_from_full_seed: demoMissingFromFull.length === 0,
      signed_cdn_query_strings_redacted_in_outputs: true,
      paid_api_disabled_by_default: cost.cumulative_actual_cost_twd === 0,
    },
    missing_fields_by_field: missingByField,
    limitations: [
      "Demo seed rows are actual metadata samples but still require visual review before final screenshots.",
      "Signed CDN URL query strings are intentionally redacted from public static artifacts; refresh via DIA API before image fetch or screenshot capture.",
      "Non-image rows are preserved in exclusions and excluded from visual-demo eligibility by default.",
      "No suspected match exists yet; suspected_events remains 0 actual.",
    ],
  };

  const exclusions = {
    generated_at: validationSummary.generated_at,
    non_image_rows: nonImageRows.map((row) => ({
      asset_id: row.asset_id || "",
      cid: row.cid || "",
      mime_type: row.mime_type || "",
      source_type: row.source_type || "",
      reason: "non_image_mime_type",
    })),
    missing_media_rows: missingMediaRows.map((row) => ({
      asset_id: row.asset_id || "",
      cid: row.cid || "",
      mime_type: row.mime_type || "",
      reason: "missing_original_and_snapshot_url",
    })),
    duplicate_assets: duplicateAssets,
    duplicate_cids: duplicateCids,
    rows_with_missing_checked_fields: rowsWithMissingFields.slice(0, 200),
    rows_with_missing_checked_fields_truncated: rowsWithMissingFields.length > 200,
  };

  writeJson("validation-summary.json", validationSummary);
  writeJsonl("assets-normalized.jsonl", normalizedFull);
  writeJson("demo-assets.json", normalizedDemo);
  writeJson("demo-candidates.json", demoCandidates);
  writeJson("p0-visual-review-queue.json", p0VisualReviewQueue);
  writeJson("exclusions.json", exclusions);

  console.log(JSON.stringify({
    output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
    full_seed_rows_loaded: fullRows.length,
    demo_seed_rows_loaded: demoRows.length,
    image_rows: imageRows.length,
    non_image_rows: nonImageRows.length,
    c2pa_status_counts: validationSummary.actual.c2pa_status_counts,
    paid_cost_status: cost.status,
  }, null, 2));
}

main();
