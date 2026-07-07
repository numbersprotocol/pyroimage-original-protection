import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const HARNESS_DIR = process.env.TTD_HARNESS_DIR || path.join(WORKSPACE_ROOT, ".omni/harness");
const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");

const DEMO_ASSETS = path.join(OUTPUT_DIR, "demo-assets.json");
const SIMILARITY_RESULTS = path.join(OUTPUT_DIR, "similarity-query-results.json");
const MONITORED_SOURCES = path.join(OUTPUT_DIR, "monitored-sources.json");
const MONITORING_RUN = path.join(OUTPUT_DIR, "monitoring-run.json");
const CANDIDATE_SOURCE_ITEMS = path.join(OUTPUT_DIR, "candidate-source-items.json");
const COST_LOG = path.join(HARNESS_DIR, "cost-log.csv");
const DEMO_MINIMUM_DATA = path.join(HARNESS_DIR, "demo-minimum-data.md");

const DEFAULT_REVIEW_STATUS = "pending_human_review";
const SAFE_PUBLIC_CLAIM_STATUS = "internal_only";
const REVIEW_STATUS_OPTIONS = [
  DEFAULT_REVIEW_STATUS,
  "false_positive",
  "authorized_use",
  "confirmed_by_partner",
];

const REQUIRED_ALERT_FIELDS = [
  "alert_id",
  "alert_status",
  "protected_asset_id",
  "source_id",
  "source_url",
  "retrieved_at",
  "query_terms",
  "match_basis",
  "similarity_score",
  "transformation_notes",
  "review_status",
  "public_claim_status",
];
const REQUIRED_CASE_FIELDS = [
  "case_id",
  "case_type",
  "original_asset_id",
  "source_name",
  "source_type",
  "captured_at",
  "evidence_label",
  "report_ready",
];
const REQUIRED_REVIEW_STATE_FIELDS = [
  "alert_id",
  "review_status",
  "reviewed_by",
  "reviewed_at",
  "review_note",
  "next_action",
];

const SIGNED_QUERY_PATTERN = /(?:Expires=|Signature=|Key-Pair-Id|X-Amz-|Policy=)/i;
const PROHIBITED_CLAIM_PATTERNS = [
  /confirmed infringement/i,
  /confirmed unauthorized use/i,
  /legal proof/i,
  /automatic takedown/i,
  /auto takedown/i,
  /全網即時監測/,
  /已確認盜用/,
  /確認侵權/,
  /法律證明/,
  /自動下架/,
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function hasOwnField(row, field) {
  return Object.prototype.hasOwnProperty.call(row, field);
}

function requiredFieldsPresent(rows, fields) {
  return rows.every((row) => fields.every((field) => hasOwnField(row, field)));
}

function containsPattern(value, patterns) {
  const serialized = JSON.stringify(value);
  return patterns.some((pattern) => pattern.test(serialized));
}

function countNonEmptyLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
}

function buildCaseId(assetId) {
  return `case_demo_${assetId.slice(0, 12)}`;
}

function buildQueryTerms(asset, candidate) {
  if (Array.isArray(candidate?.query_terms) && candidate.query_terms.length > 0) {
    return candidate.query_terms;
  }

  return [
    asset.display_title,
    asset.creator_name,
    asset.caption,
    asset.asset_id.slice(0, 16),
  ].filter((term) => typeof term === "string" && term.trim().length > 0);
}

function selectProtectedAsset(demoAssets, similarityResults) {
  const sourceAssetId =
    similarityResults.transformed_fixture?.source_asset_id ||
    similarityResults.transformed_query_result?.query_asset_id ||
    demoAssets[0]?.asset_id;

  return (
    demoAssets.find((asset) => asset.asset_id === sourceAssetId) ||
    demoAssets.find((asset) => asset.labels?.p0_candidate_needs_visual_review) ||
    demoAssets[0]
  );
}

function selectSimulatedCandidate(candidateItems, protectedAsset) {
  return (
    candidateItems.find(
      (item) =>
        item.protected_asset_id === protectedAsset.asset_id &&
        item.evidence_label === "simulated_fixture" &&
        item.source_id === "SRC-14",
    ) ||
    candidateItems.find((item) => item.evidence_label === "simulated_fixture") ||
    null
  );
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const demoAssets = readJson(DEMO_ASSETS);
  const similarityResults = readJson(SIMILARITY_RESULTS);
  const monitoredSourcesDocument = readJson(MONITORED_SOURCES);
  const monitoringRun = readJson(MONITORING_RUN);
  const candidateItems = readJson(CANDIDATE_SOURCE_ITEMS);

  const protectedAsset = selectProtectedAsset(demoAssets, similarityResults);
  const simulatedCandidate = selectSimulatedCandidate(candidateItems, protectedAsset);
  const monitoredSources = monitoredSourcesDocument.monitored_sources || [];
  const source = monitoredSources.find((item) => item.source_id === simulatedCandidate?.source_id);
  const transformedResult = similarityResults.transformed_query_result || {};
  const topMatch = transformedResult.top_match || {};
  const queryTerms = buildQueryTerms(protectedAsset, simulatedCandidate);
  const caseId = buildCaseId(protectedAsset.asset_id);
  const alertId = `ALERT-${caseId.toUpperCase()}`;

  if (!protectedAsset?.asset_id) {
    throw new Error("Phase 4 requires a protected PyroImage asset from demo-assets.json.");
  }

  if (!simulatedCandidate) {
    throw new Error("Phase 4 requires a simulated fixture candidate from candidate-source-items.json.");
  }

  const alert = {
    alert_id: alertId,
    alert_status: DEFAULT_REVIEW_STATUS,
    protected_asset_id: protectedAsset.asset_id,
    source_id: simulatedCandidate.source_id,
    source_url: simulatedCandidate.source_url,
    retrieved_at: simulatedCandidate.retrieved_at,
    query_terms: queryTerms,
    match_basis:
      "suspected match from controlled local similarity fixture; this is a workflow smoke test, not an external source-use finding",
    similarity_score: topMatch.similarity_score ?? null,
    similarity_distance: topMatch.combined_distance ?? null,
    similarity_threshold:
      transformedResult.threshold?.likely_same_or_controlled_transform_max_combined_distance ?? null,
    distance_scale: transformedResult.threshold?.distance_scale || "",
    transformation_notes:
      transformedResult.transformation_notes ||
      similarityResults.transformed_fixture?.transformation_notes ||
      "Controlled simulated fixture; no external source claim.",
    review_status: DEFAULT_REVIEW_STATUS,
    public_claim_status: SAFE_PUBLIC_CLAIM_STATUS,
    evidence_label: "simulated",
    case_id: caseId,
    candidate_item_id: simulatedCandidate.candidate_item_id,
    source_fixture_label: "simulated_fixture",
    display_copy: {
      badge: "suspected match",
      case_label: "Controlled simulated case",
      public_use_notice:
        "Internal demo fixture only; not market validation and not a public claim about the source.",
      reviewer_prompt:
        "Human reviewer must decide whether this is false positive, authorized use, or confirmed_by_partner before any external claim.",
    },
    dashboard_metric_effect: {
      suspected_events_actual: 0,
      simulated_cases: 1,
      counts_toward_market_validation: false,
    },
  };

  const caseRecord = {
    case_id: caseId,
    case_type: "controlled_simulated_match",
    original_asset_id: protectedAsset.asset_id,
    source_name: source?.source_name || "Repost candidate query pool",
    source_type: source?.source_type || "simulated_fixture",
    captured_at: generatedAt,
    evidence_label: "simulated",
    report_ready: false,
    alert_id: alert.alert_id,
    source_id: alert.source_id,
    source_url: alert.source_url,
    protected_asset_title: protectedAsset.display_title,
    protected_asset_creator: protectedAsset.creator_name,
    review_status: DEFAULT_REVIEW_STATUS,
    public_claim_status: SAFE_PUBLIC_CLAIM_STATUS,
    actuality_label: "simulated_case_not_actual_source_event",
    market_validation_label: "not_market_validation",
    report_status: "phase_5_pending",
    recommended_next_step: "Use this fixture to test report generation, then replace with actual reviewed source evidence if available.",
  };

  const reviewStates = REVIEW_STATUS_OPTIONS.map((reviewStatus) => ({
    alert_id: alert.alert_id,
    review_status: reviewStatus,
    reviewed_by: reviewStatus === DEFAULT_REVIEW_STATUS ? "unassigned_human_reviewer" : "requires_human_reviewer",
    reviewed_at: reviewStatus === DEFAULT_REVIEW_STATUS ? null : "not_applied_fixture_state",
    review_note:
      reviewStatus === DEFAULT_REVIEW_STATUS
        ? "Default state; no human review has been completed."
        : `Available workflow state for ${reviewStatus}; not applied to the current simulated case.`,
    next_action:
      reviewStatus === DEFAULT_REVIEW_STATUS
        ? "Human reviewer checks source context, authorization, and similarity evidence."
        : "Keep audit trail before changing public claim status or report language.",
    is_current: reviewStatus === DEFAULT_REVIEW_STATUS,
    public_claim_status:
      reviewStatus === "confirmed_by_partner" ? "partner_approved_required_before_public_use" : SAFE_PUBLIC_CLAIM_STATUS,
  }));

  const alerts = [alert];
  const cases = [caseRecord];
  const costLogHeaderOnly = countNonEmptyLines(COST_LOG) === 1;
  const serializedOutputs = { alerts, cases, reviewStates };
  const sourceIds = new Set(monitoredSources.map((item) => item.source_id));
  const existingAssetIds = new Set(demoAssets.map((asset) => asset.asset_id));

  const validation = {
    generated_at: generatedAt,
    phase: "Phase 4: Suspected-Match Alert Workflow",
    reference_inputs: {
      demo_minimum_data_present: fs.existsSync(DEMO_MINIMUM_DATA),
      demo_assets: "public/ttd-mvp/demo-assets.json",
      similarity_results: "public/ttd-mvp/similarity-query-results.json",
      monitored_sources: "public/ttd-mvp/monitored-sources.json",
      monitoring_run: "public/ttd-mvp/monitoring-run.json",
      candidate_source_items: "public/ttd-mvp/candidate-source-items.json",
    },
    expected: {
      minimum_alerts: 1,
      default_review_status: DEFAULT_REVIEW_STATUS,
      required_review_states: REVIEW_STATUS_OPTIONS,
      required_wording: "suspected match",
      prohibited_claim_guardrails: [
        "final-violation-claim",
        "legal-certainty-claim",
        "automatic-enforcement-claim",
        "broad-web-realtime-claim",
      ],
    },
    actual: {
      alert_count: alerts.length,
      case_count: cases.length,
      review_state_count: reviewStates.length,
      protected_asset_id: protectedAsset.asset_id,
      source_id: alert.source_id,
      source_exists_in_monitored_sources: sourceIds.has(alert.source_id),
      case_type: caseRecord.case_type,
      evidence_label: caseRecord.evidence_label,
      default_review_status: alert.review_status,
      suspected_events_actual: alert.dashboard_metric_effect.suspected_events_actual,
      simulated_cases: alert.dashboard_metric_effect.simulated_cases,
      paid_api_used: false,
      cost_log_header_only: costLogHeaderOnly,
      phase3_monitoring_run_id: monitoringRun.run_id,
    },
    pass: {
      at_least_one_alert_created_or_loaded: alerts.length >= 1,
      protected_asset_exists_in_demo_seed: existingAssetIds.has(alert.protected_asset_id),
      alert_references_monitored_source_or_simulated_fixture:
        sourceIds.has(alert.source_id) || alert.source_fixture_label === "simulated_fixture",
      default_status_is_pending_human_review:
        alert.alert_status === DEFAULT_REVIEW_STATUS && alert.review_status === DEFAULT_REVIEW_STATUS,
      uses_suspected_match_wording: JSON.stringify(serializedOutputs).includes("suspected match"),
      no_confirmed_infringement_claims: !containsPattern(serializedOutputs, PROHIBITED_CLAIM_PATTERNS),
      actual_and_simulated_cases_distinguishable:
        caseRecord.case_type === "controlled_simulated_match" &&
        caseRecord.evidence_label === "simulated" &&
        caseRecord.actuality_label.includes("not_actual_source_event"),
      simulated_case_not_market_validation:
        alert.dashboard_metric_effect.counts_toward_market_validation === false &&
        alert.dashboard_metric_effect.suspected_events_actual === 0,
      required_alert_fields_present: requiredFieldsPresent(alerts, REQUIRED_ALERT_FIELDS),
      required_case_fields_present: requiredFieldsPresent(cases, REQUIRED_CASE_FIELDS),
      required_review_state_fields_present: requiredFieldsPresent(reviewStates, REQUIRED_REVIEW_STATE_FIELDS),
      review_states_cover_required_paths: REVIEW_STATUS_OPTIONS.every((status) =>
        reviewStates.some((state) => state.review_status === status),
      ),
      no_signed_url_query_strings: !containsPattern(serializedOutputs, [SIGNED_QUERY_PATTERN]),
      paid_api_disabled_and_unused: costLogHeaderOnly,
    },
    limitations: [
      "This phase creates a controlled simulated match because no real source candidate has completed human review.",
      "The alert is a suspected match workflow fixture, not a final source-use claim.",
      "The simulated case is internal-only, not market validation, and leaves suspected_events at 0 actual.",
      "Report generation is intentionally deferred to Phase 5.",
      "The referenced demo minimum data markdown is absent in this workspace; Phase 4 uses the dev plan, technical phase map, evidence tracker, and Phase 1-3 artifacts as the verifiable contract.",
    ],
  };

  const allPass = Object.values(validation.pass).every(Boolean);
  if (!allPass) {
    writeJson("alerts.json", alerts);
    writeJson("cases.json", cases);
    writeJson("review-states.json", reviewStates);
    writeJson("alert-validation.json", validation);
    throw new Error(`Phase 4 alert validation failed: ${JSON.stringify(validation.pass)}`);
  }

  writeJson("alerts.json", alerts);
  writeJson("cases.json", cases);
  writeJson("review-states.json", reviewStates);
  writeJson("alert-validation.json", validation);

  console.log(
    JSON.stringify(
      {
        output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
        alert_count: alerts.length,
        case_count: cases.length,
        review_state_count: reviewStates.length,
        default_review_status: DEFAULT_REVIEW_STATUS,
        case_type: caseRecord.case_type,
        evidence_label: caseRecord.evidence_label,
        suspected_events_actual: alert.dashboard_metric_effect.suspected_events_actual,
        paid_api_used: false,
      },
      null,
      2,
    ),
  );
}

main();
