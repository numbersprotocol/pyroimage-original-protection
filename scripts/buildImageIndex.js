import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  fingerprintFile,
  hammingDistance,
  inferImageExtension,
  redactSignedQueryInText,
  redactUrl,
  reencodeImageBuffer,
  sha256Buffer,
} from "./lib/perceptualHash.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");
const INPUT_DIR = process.env.TTD_INPUT_DIR || OUTPUT_DIR;
const API_ENDPOINT = "https://dia-backend.numbersprotocol.io/api/v3/assets/";
const OWNER_SERVICE_NAME = "Pyro Image";

const DEMO_ASSETS = path.join(INPUT_DIR, "demo-assets.json");
const NORMALIZED_ASSETS = path.join(INPUT_DIR, "assets-normalized.jsonl");
const VALIDATION_SUMMARY = path.join(INPUT_DIR, "validation-summary.json");

const INDEX_LIMIT = Number(process.env.TTD_INDEX_LIMIT || 300);
const INDEX_SCOPE = process.env.TTD_INDEX_SCOPE || "demo";
const PAGE_SIZE = Number(process.env.TTD_INDEX_PAGE_SIZE || 500);
const MAX_API_PAGES = Number(process.env.TTD_INDEX_MAX_API_PAGES || 50);
const CONCURRENCY = Number(process.env.TTD_INDEX_CONCURRENCY || 6);
const FETCH_TIMEOUT_MS = Number(process.env.TTD_INDEX_TIMEOUT_MS || 15000);
const MAX_IMAGE_BYTES = Number(process.env.TTD_INDEX_MAX_IMAGE_BYTES || 2_000_000);
const REFRESH_API = process.env.TTD_INDEX_REFRESH_API !== "0";
const USER_AGENT = "Numbers-TTD-MVP-local-index/1.0";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
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

function isImageAsset(asset) {
  return (
    asset?.labels?.visual_demo_eligible === true &&
    typeof asset.mime_type === "string" &&
    asset.mime_type.startsWith("image/")
  );
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`DIA API HTTP ${response.status} for ${redactUrl(url)}`);
  }
  return response.json();
}

async function fetchAssetMediaMap(wantedAssetIds) {
  const mediaByAssetId = new Map();
  if (!REFRESH_API) {
    return { mediaByAssetId, pagesFetched: 0 };
  }

  let url = `${API_ENDPOINT}?owner_service_name=${encodeURIComponent(OWNER_SERVICE_NAME)}&page_size=${PAGE_SIZE}`;
  let pagesFetched = 0;

  while (url && pagesFetched < MAX_API_PAGES && mediaByAssetId.size < wantedAssetIds.size) {
    pagesFetched += 1;
    const data = await fetchJson(url);
    (data.results || []).forEach((row) => {
      const assetId = row.cid || row.asset_id || "";
      if (!wantedAssetIds.has(assetId)) return;
      const thumbnailUrl = row.asset_file_thumbnail || row.image_file_thumbnail || "";
      const originalUrl = row.asset_file_url || row.image_file_url || "";
      const snapshotUrl = row.asset_file_snapshot_url || "";
      mediaByAssetId.set(assetId, {
        transient_thumbnail_url: thumbnailUrl,
        transient_original_url: originalUrl,
        transient_snapshot_url: snapshotUrl,
        redacted_thumbnail_ref: redactUrl(thumbnailUrl),
        redacted_original_ref: redactUrl(originalUrl),
        redacted_snapshot_ref: redactUrl(snapshotUrl),
      });
    });
    url = data.next || "";
  }

  return { mediaByAssetId, pagesFetched };
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
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`non-image response content-type=${contentType || "blank"}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`image exceeds max bytes (${buffer.length} > ${MAX_IMAGE_BYTES})`);
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

function chooseTransientFetchUrl(asset, media) {
  if (media?.transient_thumbnail_url) {
    return {
      url: media.transient_thumbnail_url,
      redacted_ref: media.redacted_thumbnail_ref,
      source: "dia_api_thumbnail_transient",
      signed_query_redacted: media.transient_thumbnail_url.includes("?"),
    };
  }

  const fallback =
    asset.media_refs?.snapshot_url_ref ||
    asset.media_refs?.original_url_ref ||
    media?.transient_snapshot_url ||
    media?.transient_original_url ||
    "";
  return {
    url: fallback,
    redacted_ref: redactUrl(fallback),
    source: "phase1_redacted_public_ref",
    signed_query_redacted: fallback.includes("?"),
  };
}

function baseIndexEntry(asset, fetchChoice, now) {
  return {
    asset_id: asset.asset_id,
    fingerprint_type: "local_ahash64_dhash64_from_thumbnail",
    fingerprint_value: "",
    indexed_at: now,
    index_status: "not_indexed",
    image_width_px: null,
    image_height_px: null,
    fetch_status: "not_fetched",
    fetch_source: fetchChoice?.source || "none",
    media_ref: fetchChoice?.redacted_ref || "",
    signed_query_written_to_artifact: false,
    source_type: asset.source_type,
    mime_type: asset.mime_type,
    display_title: asset.display_title,
    labels: {
      metric_label: asset.labels?.metric_label || "actual",
      index_coverage_label: "actual indexed sample / target full baseline",
      visual_review_status: asset.labels?.visual_review_status || "",
    },
  };
}

async function indexAsset(asset, mediaByAssetId, tempDir, indexedAt) {
  const fetchChoice = chooseTransientFetchUrl(asset, mediaByAssetId.get(asset.asset_id));
  const entry = baseIndexEntry(asset, fetchChoice, indexedAt);

  if (!isImageAsset(asset)) {
    return {
      ...entry,
      index_status: "excluded",
      fetch_status: "skipped",
      error_reason: "non_image_or_not_visual_demo_eligible",
    };
  }

  if (!fetchChoice.url) {
    return {
      ...entry,
      index_status: "failed",
      fetch_status: "failed",
      error_reason: "missing_fetch_url",
    };
  }

  let tempFile = "";
  try {
    const fetched = await fetchImageBuffer(fetchChoice.url);
    const extension = inferImageExtension(fetched.contentType);
    tempFile = path.join(tempDir, `${asset.asset_id}.${extension}`);
    fs.writeFileSync(tempFile, fetched.buffer);
    const fingerprint = fingerprintFile(tempFile);

    return {
      ...entry,
      fingerprint_value: `ahash:${fingerprint.ahash64};dhash:${fingerprint.dhash64}`,
      ahash64: fingerprint.ahash64,
      dhash64: fingerprint.dhash64,
      index_status: "indexed",
      image_width_px: fingerprint.image_width_px,
      image_height_px: fingerprint.image_height_px,
      fetch_status: "fetched",
      content_type: fetched.contentType,
      bytes_fetched: fetched.buffer.length,
      content_length_header: fetched.contentLength,
      codec_name: fingerprint.codec_name,
      media_ref_query_redacted: fetchChoice.signed_query_redacted,
      source_buffer_sha256: sha256Buffer(fetched.buffer),
    };
  } catch (error) {
    return {
      ...entry,
      index_status: "failed",
      fetch_status: "failed",
      error_reason: redactSignedQueryInText(error.message),
      media_ref_query_redacted: fetchChoice.signed_query_redacted,
    };
  } finally {
    if (tempFile) {
      fs.rmSync(tempFile, { force: true });
    }
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function distanceBetween(query, candidate) {
  const ahash_distance = hammingDistance(query.ahash64, candidate.ahash64);
  const dhash_distance = hammingDistance(query.dhash64, candidate.dhash64);
  const combined_distance = ahash_distance + dhash_distance;
  return {
    ahash_distance,
    dhash_distance,
    combined_distance,
    similarity_score: Number((1 - combined_distance / 128).toFixed(4)),
  };
}

function queryIndex(query, indexedEntries) {
  const started = performance.now();
  const matches = indexedEntries
    .map((candidate) => ({
      asset_id: candidate.asset_id,
      display_title: candidate.display_title,
      ...distanceBetween(query, candidate),
      match_basis: "local aHash64+dHash64 hamming distance; lower distance is more similar",
    }))
    .sort((a, b) => {
      if (a.combined_distance !== b.combined_distance) return a.combined_distance - b.combined_distance;
      if (a.asset_id === query.asset_id) return -1;
      if (b.asset_id === query.asset_id) return 1;
      return a.asset_id.localeCompare(b.asset_id);
    });
  const queryTimeMs = Number((performance.now() - started).toFixed(3));

  return {
    query_asset_id: query.asset_id,
    query_title: query.display_title || "",
    query_time_ms: queryTimeMs,
    threshold: {
      exact_match_distance: 0,
      likely_same_or_controlled_transform_max_combined_distance: 16,
      distance_scale: "0 to 128 combined Hamming distance across aHash64 and dHash64; lower is more similar",
    },
    top_match: matches[0] || null,
    top_matches: matches.slice(0, 5),
  };
}

async function buildTransformFixture(firstIndexed, mediaByAssetId, tempDir) {
  const fetchChoice = chooseTransientFetchUrl(firstIndexed, mediaByAssetId.get(firstIndexed.asset_id));
  const source = await fetchImageBuffer(fetchChoice.url);
  const transformedFile = path.join(tempDir, `${firstIndexed.asset_id}-resize-fixture.jpg`);
  const transformedBuffer = reencodeImageBuffer(source.buffer, {
    tempDir,
    prefix: `${firstIndexed.asset_id}-source`,
    inputExtension: inferImageExtension(source.contentType),
    maxImageBytes: MAX_IMAGE_BYTES,
  });
  fs.writeFileSync(transformedFile, transformedBuffer);
  const fingerprint = fingerprintFile(transformedFile);
  fs.rmSync(transformedFile, { force: true });

  return {
    fixture_id: "controlled_resize_reencode_fixture_001",
    source_asset_id: firstIndexed.asset_id,
    transformation_notes: "Controlled local resize to 160px width and JPEG re-encode via ffmpeg; no external source claim.",
    fingerprint_type: "local_ahash64_dhash64_from_controlled_resize",
    fingerprint_value: `ahash:${fingerprint.ahash64};dhash:${fingerprint.dhash64}`,
    ahash64: fingerprint.ahash64,
    dhash64: fingerprint.dhash64,
    image_width_px: fingerprint.image_width_px,
    image_height_px: fingerprint.image_height_px,
    bytes_generated: transformedBuffer.length,
    signed_query_written_to_artifact: false,
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const indexedAt = new Date().toISOString();
  const demoAssets = readJson(DEMO_ASSETS);
  const normalizedAssets = readJsonl(NORMALIZED_ASSETS);
  const validation = readJson(VALIDATION_SUMMARY);
  const visualDemoAssets = demoAssets.filter(isImageAsset);
  const sourceAssets = INDEX_SCOPE === "full" ? normalizedAssets : demoAssets;
  const visualSourceAssets = sourceAssets.filter(isImageAsset);
  const assetsToAttempt = visualSourceAssets.slice(0, INDEX_LIMIT);
  const wantedAssetIds = new Set(assetsToAttempt.map((asset) => asset.asset_id));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ttd-image-index-"));

  const { mediaByAssetId, pagesFetched } = await fetchAssetMediaMap(wantedAssetIds);
  let indexRows = [];
  try {
    indexRows = await mapWithConcurrency(assetsToAttempt, CONCURRENCY, (asset) =>
      indexAsset(asset, mediaByAssetId, tempDir, indexedAt),
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const indexedRows = indexRows.filter((row) => row.index_status === "indexed");
  const failedRows = indexRows.filter((row) => row.index_status === "failed");
  const excludedRows = indexRows.filter((row) => row.index_status === "excluded");
  const selfMatchQueries = indexedRows.slice(0, 10).map((row) => {
    const result = queryIndex(row, indexedRows);
    return {
      ...result,
      pass: result.top_match?.asset_id === row.asset_id && result.top_match?.combined_distance === 0,
    };
  });

  let transformFixture = null;
  let transformedQueryResult = null;
  if (indexedRows.length > 0) {
    const transformTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ttd-transform-fixture-"));
    try {
      transformFixture = await buildTransformFixture(indexedRows[0], mediaByAssetId, transformTempDir);
      transformedQueryResult = queryIndex(
        {
          asset_id: transformFixture.source_asset_id,
          display_title: "Controlled resize/re-encode fixture",
          ahash64: transformFixture.ahash64,
          dhash64: transformFixture.dhash64,
        },
        indexedRows,
      );
      transformedQueryResult.pass = transformedQueryResult.top_match?.asset_id === transformFixture.source_asset_id;
      transformedQueryResult.transformation_notes = transformFixture.transformation_notes;
    } finally {
      fs.rmSync(transformTempDir, { recursive: true, force: true });
    }
  }

  const averageSelfMatchQueryMs =
    selfMatchQueries.length === 0
      ? null
      : Number(
          (
            selfMatchQueries.reduce((sum, query) => sum + query.query_time_ms, 0) / selfMatchQueries.length
          ).toFixed(3),
        );
  const totalBytesFetched = indexedRows.reduce((sum, row) => sum + (row.bytes_fetched || 0), 0);

  const indexValidation = {
    generated_at: indexedAt,
    source: {
      phase1_demo_assets: "public/ttd-mvp/demo-assets.json",
      phase1_normalized_assets: "public/ttd-mvp/assets-normalized.jsonl",
      phase1_input_dir: path.relative(WORKSPACE_ROOT, INPUT_DIR),
      phase2_output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
      dia_api_refresh_enabled: REFRESH_API,
      dia_api_endpoint: API_ENDPOINT,
      dia_api_filter: { owner_service_name: OWNER_SERVICE_NAME },
      dia_api_pages_fetched: pagesFetched,
      dia_api_max_pages: MAX_API_PAGES,
      index_scope: INDEX_SCOPE,
      media_source: "refreshed DIA thumbnail URLs used transiently; signed query strings are not written to artifacts",
    },
    coverage: {
      protected_originals_baseline: validation.actual?.full_seed_rows_loaded || normalizedAssets.length,
      full_image_rows_target: validation.actual?.image_rows_included_for_visual_demo || null,
      demo_seed_rows: demoAssets.length,
      demo_visual_eligible_rows: visualDemoAssets.length,
      source_rows: sourceAssets.length,
      source_visual_eligible_rows: visualSourceAssets.length,
      attempted_rows: assetsToAttempt.length,
      indexed_rows: indexedRows.length,
      failed_fetches: failedRows.length,
      non_image_exclusions_in_full_seed: validation.actual?.non_image_rows_excluded_from_visual_demo || null,
      excluded_attempt_rows: excludedRows.length,
      index_coverage_label: "actual indexed sample / target full baseline",
    },
    fingerprint: {
      type: "local_ahash64_dhash64_from_thumbnail",
      implementation: "ffmpeg grayscale 9x8 resize; aHash64 over first 8x8 pixels; dHash64 over adjacent 9x8 pixels",
      distance_scale: "0 to 128 combined Hamming distance across aHash64 and dHash64; lower is more similar",
      threshold: {
        exact_match_distance: 0,
        likely_same_or_controlled_transform_max_combined_distance: 16,
      },
    },
    performance: {
      total_bytes_fetched: totalBytesFetched,
      average_self_match_query_ms: averageSelfMatchQueryMs,
      concurrency: CONCURRENCY,
      fetch_timeout_ms: FETCH_TIMEOUT_MS,
    },
    tests: {
      self_match_sample_size: selfMatchQueries.length,
      self_match_pass_count: selfMatchQueries.filter((query) => query.pass).length,
      transformed_fixture_pass: Boolean(transformedQueryResult?.pass),
      transformed_fixture_id: transformFixture?.fixture_id || null,
    },
    pass: {
      indexed_documented_subset_or_demo_seed:
        indexedRows.length > 0 && assetsToAttempt.length === Math.min(INDEX_LIMIT, visualSourceAssets.length),
      full_scope_path_supported: INDEX_SCOPE === "full" || visualSourceAssets.length === visualDemoAssets.length,
      ten_self_matches_pass: selfMatchQueries.length >= 10 && selfMatchQueries.every((query) => query.pass),
      transformed_fixture_pass: Boolean(transformedQueryResult?.pass),
      no_paid_api_used: true,
      signed_query_strings_written_to_artifacts: false,
    },
    limitations: [
      "Phase 2 indexes refreshed thumbnails, not full-resolution originals, to keep the MVP local-first and bounded.",
      "Default scope is the 300-row demo seed. Set TTD_INDEX_SCOPE=full and raise TTD_INDEX_LIMIT to scale toward all reachable image rows from the 4,329-row baseline.",
      "Phase 1 redacted CDN URLs return 403 without signed query strings; this script refreshes public DIA thumbnail URLs transiently and never writes signed query strings to public artifacts.",
      "The local hash is a smoke-test similarity adapter, not a production infringement detector.",
      "The transformed fixture is controlled resize/re-encode evidence for workflow readiness, not an external suspected match.",
      "Paid reverse image search remains disabled and unneeded for this phase.",
    ],
  };

  const similarityResults = {
    generated_at: indexedAt,
    match_basis: "local aHash64+dHash64 hamming distance; lower distance is more similar",
    self_match_queries: selfMatchQueries,
    transformed_fixture: transformFixture,
    transformed_query_result: transformedQueryResult,
  };

  const failures = {
    generated_at: indexedAt,
    failed_fetches: failedRows.map((row) => ({
      asset_id: row.asset_id,
      display_title: row.display_title,
      fetch_source: row.fetch_source,
      media_ref: row.media_ref,
      fetch_status: row.fetch_status,
      index_status: row.index_status,
      error_reason: row.error_reason,
    })),
    excluded_rows: excludedRows.map((row) => ({
      asset_id: row.asset_id,
      display_title: row.display_title,
      mime_type: row.mime_type,
      error_reason: row.error_reason,
    })),
  };

  writeJsonl("image-index.jsonl", indexRows);
  writeJson("index-validation.json", indexValidation);
  writeJson("similarity-query-results.json", similarityResults);
  writeJson("image-index-failures.json", failures);

  console.log(
    JSON.stringify(
      {
        output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
        attempted_rows: assetsToAttempt.length,
        indexed_rows: indexedRows.length,
        failed_fetches: failedRows.length,
        self_match_pass_count: indexValidation.tests.self_match_pass_count,
        transformed_fixture_pass: indexValidation.tests.transformed_fixture_pass,
        paid_api_used: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(redactSignedQueryInText(error.stack || error.message));
  process.exit(1);
});
