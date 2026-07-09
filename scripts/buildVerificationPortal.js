import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MATCH_THRESHOLD, loadIndexedEntries, queryIndex } from "./lib/matcher.js";
import { hashPixels, redactSignedQueryInText } from "./lib/perceptualHash.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");
const INPUT_DIR = process.env.TTD_INPUT_DIR || OUTPUT_DIR;

const IMAGE_INDEX = path.join(INPUT_DIR, "image-index.jsonl");
const DEMO_ASSETS = path.join(INPUT_DIR, "demo-assets.json");
const INDEX_VALIDATION = path.join(INPUT_DIR, "index-validation.json");
const SIMILARITY_RESULTS = path.join(INPUT_DIR, "similarity-query-results.json");

const VERIFICATION_FIXTURES_FILE = "verification-fixtures.json";
const VERIFICATION_VALIDATION_FILE = "verification-validation.json";
const SIGNED_QUERY_PATTERN = /(?:Expires|Signature|Key-Pair-Id|Policy)=|X-Amz-/i;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function containsSignedQuery(value) {
  return SIGNED_QUERY_PATTERN.test(JSON.stringify(value));
}

function assetMap(assets) {
  return new Map(assets.map((asset) => [asset.asset_id, asset]));
}

function enrichTopMatch(match, assetsById) {
  if (!match) return null;
  const asset = assetsById.get(match.asset_id) || {};
  return {
    asset_id: match.asset_id,
    display_title: asset.display_title || match.display_title || match.asset_id,
    creator_name: asset.creator_name || "",
    certificate_link: asset.certificate_link || "",
    media_ref: match.media_ref || "",
    ahash_distance: match.ahash_distance,
    dhash_distance: match.dhash_distance,
    combined_distance: match.combined_distance,
    similarity_score: match.similarity_score,
    match_basis: match.match_basis,
  };
}

function buildResult(query, indexedEntries, assetsById, threshold) {
  const result = queryIndex(query, indexedEntries, { limit: 5 });
  const topMatch = enrichTopMatch(result.top_match, assetsById);
  const topMatches = result.top_matches.map((match) => enrichTopMatch(match, assetsById));
  const isWithinThreshold = Number(topMatch?.combined_distance ?? Number.POSITIVE_INFINITY) <= threshold;

  return {
    ...result,
    top_match: topMatch,
    top_matches: topMatches,
    threshold: {
      ...result.threshold,
      likely_same_or_controlled_transform_max_combined_distance: threshold,
    },
    verdict_code: isWithinThreshold ? "registered_match" : "not_registered",
    pass_threshold: isWithinThreshold,
  };
}

function buildKnownOriginalQuery(indexedEntries, assetsById, threshold) {
  const original = indexedEntries[0];
  const asset = assetsById.get(original.asset_id) || {};
  const result = buildResult(original, indexedEntries, assetsById, threshold);
  const exactMatch = result.top_match?.asset_id === original.asset_id && result.top_match?.combined_distance === 0;

  return {
    query_id: `known-original-${original.asset_id.slice(0, 12)}`,
    query_type: "known_original_url",
    input_label: "known-original",
    accepted_inputs: [
      `asset:${original.asset_id}`,
      original.asset_id,
      asset.certificate_link || "",
      result.top_match?.media_ref || "",
    ].filter(Boolean),
    display: {
      zh: "已知原作",
      en: "Known original",
      title: asset.display_title || original.display_title || original.asset_id,
      subtitle: asset.caption || "",
    },
    query_asset_id: original.asset_id,
    query_fingerprint: {
      ahash64: original.ahash64,
      dhash64: original.dhash64,
      fingerprint_value: `ahash:${original.ahash64};dhash:${original.dhash64}`,
    },
    result,
    verdict: {
      code: exactMatch ? "registered_original" : "review_required",
      zh: exactMatch ? "與已收錄原作相符" : "需要人工複審",
      en: exactMatch ? "Registered original" : "Needs review",
      tone: exactMatch ? "match" : "review",
      public_claim_status: "origin_verification_only",
    },
    evidence_label: "actual_index_match",
    zero_external_cost: true,
    expected_pass: exactMatch,
    notes: [
      "The query fingerprint is the indexed protected original itself.",
      "This verifies the portal can return the certificate for an already registered work.",
    ],
  };
}

function buildTransformedQuery(indexedEntries, assetsById, similarityResults, threshold) {
  const fixture = similarityResults.transformed_fixture;
  if (!fixture?.ahash64 || !fixture?.dhash64 || !fixture?.source_asset_id) {
    throw new Error("Missing transformed fixture in similarity-query-results.json.");
  }

  const asset = assetsById.get(fixture.source_asset_id) || {};
  const query = {
    asset_id: fixture.source_asset_id,
    display_title: "Controlled resize/re-encode fixture",
    ahash64: fixture.ahash64,
    dhash64: fixture.dhash64,
  };
  const result = buildResult(query, indexedEntries, assetsById, threshold);
  const transformedMatch = result.top_match?.asset_id === fixture.source_asset_id && result.pass_threshold;

  return {
    query_id: `known-transform-${fixture.source_asset_id.slice(0, 12)}`,
    query_type: "controlled_transform_url",
    input_label: "controlled-transform",
    accepted_inputs: [
      "seed://ttd-mvp/reencoded-protected-thumbnail",
      `transform:${fixture.fixture_id}`,
      `asset:${fixture.source_asset_id}:transform`,
    ],
    display: {
      zh: "轉檔後原作",
      en: "Re-encoded original",
      title: asset.display_title || fixture.source_asset_id,
      subtitle: fixture.transformation_notes || "",
    },
    query_asset_id: fixture.source_asset_id,
    query_fingerprint: {
      ahash64: fixture.ahash64,
      dhash64: fixture.dhash64,
      fingerprint_value: fixture.fingerprint_value || `ahash:${fixture.ahash64};dhash:${fixture.dhash64}`,
    },
    result,
    verdict: {
      code: transformedMatch ? "registered_derivative" : "review_required",
      zh: transformedMatch ? "疑似同一原作，需複核" : "需要人工複審",
      en: transformedMatch ? "Registered derivative" : "Needs review",
      tone: transformedMatch ? "match" : "review",
      public_claim_status: "origin_verification_only",
    },
    evidence_label: "actual_controlled_transform",
    zero_external_cost: true,
    expected_pass: transformedMatch,
    notes: [
      "The query is generated by local resize/re-encode of a registered protected image.",
      "This validates that the local fingerprint matcher survives common copy transformations.",
    ],
  };
}

function buildSyntheticNonOriginal(indexedEntries, threshold) {
  for (let seed = 1; seed < 500; seed += 1) {
    const pixels = Buffer.from(
      Array.from({ length: 72 }, (_, i) => (i * seed * 37 + Math.floor(i / 9) * 19 + (i % 9) * 11) % 256),
    );
    const fingerprint = hashPixels(pixels);
    const query = {
      asset_id: `control-non-original-seed-${seed}`,
      display_title: "Controlled non-original query",
      ahash64: fingerprint.ahash64,
      dhash64: fingerprint.dhash64,
    };
    const result = queryIndex(query, indexedEntries, { limit: 5 });
    if (Number(result.top_match?.combined_distance ?? 0) > threshold) {
      return { seed, query };
    }
  }
  throw new Error("Could not construct a non-original control outside the match threshold.");
}

function buildNonOriginalQuery(indexedEntries, assetsById, threshold) {
  const control = buildSyntheticNonOriginal(indexedEntries, threshold);
  const result = buildResult(control.query, indexedEntries, assetsById, threshold);
  const rejected = !result.pass_threshold;

  return {
    query_id: control.query.asset_id,
    query_type: "controlled_non_original",
    input_label: "controlled-non-original",
    accepted_inputs: ["control://ttd-mvp/non-original-9x8-gradient", control.query.asset_id],
    display: {
      zh: "非原作控制樣本",
      en: "Non-original control",
      title: "9x8 grayscale control",
      subtitle: "Deterministic local control fingerprint; not a public source-use claim.",
    },
    query_asset_id: "",
    query_fingerprint: {
      ahash64: control.query.ahash64,
      dhash64: control.query.dhash64,
      fingerprint_value: `ahash:${control.query.ahash64};dhash:${control.query.dhash64}`,
    },
    result,
    verdict: {
      code: rejected ? "not_registered" : "review_required",
      zh: rejected ? "未找到對應原作" : "需要人工複審",
      en: rejected ? "Not registered" : "Needs review",
      tone: rejected ? "clear" : "review",
      public_claim_status: "no_origin_match_found",
    },
    evidence_label: "controlled_non_original",
    zero_external_cost: true,
    expected_pass: rejected,
    notes: [
      "The query is a deterministic non-original control, used only to verify the no-match branch.",
      "No alert, case, or evidence report is created from this control query.",
    ],
  };
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const indexedEntries = loadIndexedEntries(IMAGE_INDEX);
  const demoAssets = readJson(DEMO_ASSETS);
  const indexValidation = readJson(INDEX_VALIDATION);
  const similarityResults = readJson(SIMILARITY_RESULTS);
  const assetsById = assetMap(demoAssets);
  const threshold =
    Number(indexValidation.fingerprint?.threshold?.likely_same_or_controlled_transform_max_combined_distance) ||
    DEFAULT_MATCH_THRESHOLD;

  if (indexedEntries.length === 0) {
    throw new Error("Cannot build verification portal without indexed image fingerprints.");
  }

  const queries = [
    buildKnownOriginalQuery(indexedEntries, assetsById, threshold),
    buildTransformedQuery(indexedEntries, assetsById, similarityResults, threshold),
    buildNonOriginalQuery(indexedEntries, assetsById, threshold),
  ];

  const fixtures = {
    generated_at: generatedAt,
    phase: "Phase 4: Verification portal + UI integration",
    route: "/pyroimage-original-protection",
    verification_mode:
      "static precomputed local fingerprint verification for GitHub Pages; arbitrary uploads require a future runtime fingerprint service",
    library: {
      index_source: "image-index.jsonl",
      indexed_rows: indexedEntries.length,
      protected_originals_baseline: indexValidation.coverage?.protected_originals_baseline || null,
      full_image_rows_target: indexValidation.coverage?.full_image_rows_target || null,
      scope_label:
        indexValidation.coverage?.index_coverage_label || "actual indexed sample / target full baseline",
      match_basis: "local aHash64+dHash64 hamming distance; lower distance is more similar",
      threshold,
      distance_scale: "0 to 128 combined Hamming distance across aHash64 and dHash64",
      paid_api_used: false,
    },
    queries,
    verdicts: {
      registered_original: "Exact protected-original fingerprint match.",
      registered_derivative: "Within-threshold match to a protected original after local transform.",
      not_registered: "No indexed protected original within the configured threshold.",
      review_required: "Ambiguous result; human review is required before using the verdict.",
    },
    limitations: [
      "The static portal validates precomputed local fingerprints only.",
      "A pasted arbitrary image URL cannot be fingerprinted in the browser-only GitHub Pages runtime.",
      "A positive origin match verifies relation to a protected original; it is not a public infringement claim.",
      "The indexed MVP library currently covers the documented 300-row protection sample while preserving the 4,329-row PyroImage baseline target.",
    ],
  };

  const validation = {
    generated_at: generatedAt,
    phase: fixtures.phase,
    actual: {
      query_count: queries.length,
      indexed_rows: fixtures.library.indexed_rows,
      threshold,
      verdict_codes: queries.map((query) => query.verdict.code),
      no_paid_api_used: true,
    },
    pass: {
      known_original_verified:
        queries[0]?.verdict.code === "registered_original" &&
        queries[0]?.result.top_match?.asset_id === queries[0]?.query_asset_id &&
        queries[0]?.result.top_match?.combined_distance === 0,
      controlled_transform_verified:
        queries[1]?.verdict.code === "registered_derivative" &&
        queries[1]?.result.top_match?.asset_id === queries[1]?.query_asset_id &&
        queries[1]?.result.top_match?.combined_distance <= threshold,
      known_non_original_rejected:
        queries[2]?.verdict.code === "not_registered" &&
        queries[2]?.result.top_match?.combined_distance > threshold,
      all_queries_have_certificate_or_clear_no_match: queries.every((query) => {
        if (query.verdict.code === "not_registered") return query.result.pass_threshold === false;
        return Boolean(query.result.top_match?.certificate_link);
      }),
      no_paid_api_used: true,
      no_signed_url_query_strings: false,
      evidence_labels_honest: queries.every((query) =>
        ["actual_index_match", "actual_controlled_transform", "controlled_non_original"].includes(query.evidence_label),
      ),
    },
    limitations: fixtures.limitations,
  };
  validation.pass.no_signed_url_query_strings = !containsSignedQuery({ fixtures, validation });
  validation.pass.all = Object.values(validation.pass).every(Boolean);
  fixtures.pass = validation.pass;

  const cleanedFixtures = JSON.parse(redactSignedQueryInText(JSON.stringify(fixtures)));
  const cleanedValidation = JSON.parse(redactSignedQueryInText(JSON.stringify(validation)));

  writeJson(VERIFICATION_FIXTURES_FILE, cleanedFixtures);
  writeJson(VERIFICATION_VALIDATION_FILE, cleanedValidation);

  if (!cleanedValidation.pass.all) {
    throw new Error(`Verification portal validation failed: ${JSON.stringify(cleanedValidation.pass)}`);
  }

  console.log(
    JSON.stringify(
      {
        output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
        query_count: queries.length,
        indexed_rows: fixtures.library.indexed_rows,
        known_original: queries[0].verdict.code,
        controlled_transform: queries[1].verdict.code,
        non_original: queries[2].verdict.code,
        validation_pass: cleanedValidation.pass.all,
        paid_api_used: false,
      },
      null,
      2,
    ),
  );
}

main();
