import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactSignedQueryInText } from "./lib/perceptualHash.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");

const DEMO_ASSETS = path.join(OUTPUT_DIR, "demo-assets.json");
const ALERTS = path.join(OUTPUT_DIR, "alerts.json");
const CASES = path.join(OUTPUT_DIR, "cases.json");
const REVIEW_STATES = path.join(OUTPUT_DIR, "review-states.json");
const MONITORED_SOURCES = path.join(OUTPUT_DIR, "monitored-sources.json");
const MONITORING_RUN = path.join(OUTPUT_DIR, "monitoring-run.json");

const REPORT_FILE = "evidence-report.json";
const REPORT_MARKDOWN_FILE = "evidence-report.md";
const REPORT_VALIDATION_FILE = "report-validation.json";
const REPORT_ARTIFACT_PATH = `ttd-mvp/${REPORT_MARKDOWN_FILE}`;

const REQUIRED_SECTIONS = [
  "protected_original",
  "candidate_use",
  "match_explanation",
  "run_metadata",
  "review_state",
  "recommended_next_step",
  "public_use_label",
  "limitations",
];
const ALLOWED_REVIEW_STATUSES = [
  "pending_human_review",
  "false_positive",
  "authorized_use",
  "confirmed_by_partner",
  "not_reviewed",
];
const PUBLIC_USE_LABELS = ["actual_pending_review", "simulated", "internal_only"];
const SIGNED_QUERY_TOKEN_PARTS = [
  ["Ex", "pires"],
  ["Sign", "ature"],
  ["Key", "Pair", "Id"],
  ["X", "Amz"],
  ["Pol", "icy"],
];
const CLAIM_GUARDRAILS = [
  ["confirmed", "infringement"],
  ["confirmed", "unauthorized", "use"],
  ["legal", "proof"],
  ["legal", "certainty"],
  ["automatic", "takedown"],
  ["auto", "takedown"],
  ["all-web", "realtime", "monitoring"],
  ["已", "確認", "盜", "用"],
  ["確", "認", "侵", "權"],
  ["法", "律", "證", "明"],
  ["自", "動", "下", "架"],
  ["全", "網", "即", "時", "監", "測"],
];

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeText(fileName, value) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), `${value.trimEnd()}\n`);
}

function writeJson(fileName, data) {
  writeText(fileName, JSON.stringify(data, null, 2));
}

function serialized(value) {
  return JSON.stringify(value);
}

function containsSignedQuery(value) {
  const text = serialized(value);
  return SIGNED_QUERY_TOKEN_PARTS.some((parts) => {
    const token = parts.length === 3 ? parts.join("-") : parts.join("");
    return text.includes(`${token}=`) || text.includes(`${token}-`);
  });
}

function containsProhibitedClaim(value) {
  const text = serialized(value).toLowerCase();
  return CLAIM_GUARDRAILS.some((parts) => text.includes(parts.join(" ").toLowerCase()) || text.includes(parts.join("")));
}

function containsRemovedClientName(value) {
  return /Taiwan Mobile|台灣大哥大|台哥大/i.test(serialized(value));
}

function sectionHasContent(report, sectionName) {
  const value = report.sections[sectionName];
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== undefined && value !== null && value !== "";
}

function findById(rows, field, id) {
  return rows.find((row) => row?.[field] === id);
}

function cleanList(values) {
  return (values || []).filter((value) => typeof value === "string" && value.trim().length > 0);
}

function compactId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

function safeText(value) {
  return redactSignedQueryInText(String(value || ""));
}

function publicUseLabelFor(alert, caseRecord) {
  if (alert.evidence_label === "simulated" || caseRecord?.evidence_label === "simulated") return "simulated";
  if (alert.evidence_label === "actual") return "actual_pending_review";
  return "internal_only";
}

function reportLabelFor(alert) {
  if (alert.evidence_label !== "actual") return "controlled simulated evidence report";
  if (alert.source_fixture_label === "vision_web_detection_real_candidate") {
    return "actual Vision web-detection hash-match report pending human review";
  }
  return "actual patrol hash-match report pending human review";
}

function markdownList(values) {
  return values.map((value) => `- ${safeText(value)}`).join("\n");
}

function buildReportMarkdown(reportDocument) {
  if (reportDocument.report_count === 0) {
    return `# PyroImage Patrol Evidence Reports

Generated at: ${reportDocument.generated_at}

No evidence reports were generated for the latest patrol run.

Reason: ${reportDocument.empty_state.reason}
Run ID: ${reportDocument.empty_state.run_id || "unknown"}
Adapter: ${reportDocument.empty_state.adapter_id || "unknown"}
`;
  }

  return [
    `# PyroImage Patrol Evidence Reports`,
    "",
    `Generated at: ${reportDocument.generated_at}`,
    `Report count: ${reportDocument.report_count}`,
    "",
    ...reportDocument.reports.map((report) => {
      const sections = report.sections;
      const original = sections.protected_original;
      const candidate = sections.candidate_use;
      const match = sections.match_explanation;
      const run = sections.run_metadata;
      const review = sections.review_state;
      const publicUse = sections.public_use_label;

      return `## ${report.report_id}

Alert ID: ${report.alert_id}
Case ID: ${report.case_id}
Report label: ${report.report_label}
Generated at: ${report.generated_at}

### Summary

${report.summary}

### Protected Original

- Asset ID: ${safeText(original.asset_id)}
- Title: ${safeText(original.title)}
- Creator: ${safeText(original.creator)}
- Owner: ${safeText(original.owner)}
- Uploaded at: ${safeText(original.uploaded_at)}
- C2PA status: ${safeText(original.c2pa_status)}
- Provenance status: ${safeText(original.provenance_status)}
- Certificate link: ${safeText(original.certificate_link)}
- Image reference: ${safeText(original.image_ref)}
- Snapshot reference: ${safeText(original.snapshot_ref)}

### Candidate Use

- Source ID: ${safeText(candidate.source_id)}
- Source name: ${safeText(candidate.source_name)}
- Source type: ${safeText(candidate.source_type)}
- Source URL: ${safeText(candidate.source_url)}
- Candidate image reference: ${safeText(candidate.candidate_image_ref)}
- Retrieved at: ${safeText(candidate.retrieved_at)}
- Screenshot status: ${safeText(candidate.screenshot_status)}
- Query terms: ${cleanList(candidate.query_terms).map(safeText).join(", ")}
- Evidence label: ${safeText(candidate.evidence_label)}
- Public claim status: ${safeText(candidate.public_claim_status)}

### Match Explanation

- Basis: ${safeText(match.match_basis)}
- Similarity score: ${match.similarity_score}
- Similarity distance: ${match.similarity_distance}
- Threshold: ${match.similarity_threshold}
- Distance scale: ${safeText(match.distance_scale)}
- Transformation notes: ${safeText(match.transformation_notes)}

### Patrol Run Metadata

- Run ID: ${safeText(run.run_id)}
- Adapter: ${safeText(run.adapter_id)}
- Source run status: ${safeText(run.source_run_status)}
- Candidates attempted: ${run.candidates_attempted}
- Alerts created: ${run.alerts_created}
- Paid API used: ${run.paid_api_used}
- Budget guard respected: ${run.budget_guard_respected}

### Review State

- Current state: ${safeText(review.current_status)}
- Available paths: ${review.available_statuses.map(safeText).join(", ")}
- Reviewer instruction: ${safeText(review.reviewer_instruction)}

### Recommended Next Step

${safeText(sections.recommended_next_step)}

### Public-Use Label

- Label: ${safeText(publicUse.label)}
- Counts toward market validation: ${publicUse.counts_toward_market_validation}
- Suspected events actual: ${publicUse.suspected_events_actual}
- Simulated cases: ${publicUse.simulated_cases}
- Deck/report use: ${safeText(publicUse.deck_use_rule)}

### Limitations

${markdownList(sections.limitations)}
`;
    }),
  ].join("\n");
}

function buildReport({ alert, caseRecord, protectedAsset, source, sourceRun, currentReviewState, monitoringRun, generatedAt }) {
  const publicUseLabel = publicUseLabelFor(alert, caseRecord);
  const sourceUrl = alert.source_url || sourceRun?.source_url || "";
  const candidateImageRef = alert.candidate_image_ref || sourceRun?.candidate_image_ref || "";
  const isActual = alert.evidence_label === "actual";
  const report = {
    report_id: `REPORT-${compactId(caseRecord?.case_id || alert.case_id || alert.alert_id).toUpperCase()}`,
    alert_id: alert.alert_id,
    case_id: caseRecord?.case_id || alert.case_id || "",
    generated_at: generatedAt,
    report_label: reportLabelFor(alert),
    report_artifact_path: REPORT_ARTIFACT_PATH,
    can_open_from_alert: true,
    summary: isActual
      ? "This report packages a real fetched-candidate perceptual-hash match for internal human review. It is not a public source-use claim until a reviewer verifies source context and authorization."
      : "This report packages a clearly labelled demonstration case for workflow review.",
    sections: {
      protected_original: {
        asset_id: protectedAsset?.asset_id || alert.protected_asset_id,
        title: protectedAsset?.display_title || protectedAsset?.headline || "",
        creator: protectedAsset?.creator_name || "",
        owner: protectedAsset?.rights_holder_owner_name || "",
        uploaded_at: protectedAsset?.uploaded_at || "",
        c2pa_status: protectedAsset?.c2pa_status || "unknown",
        provenance_status: protectedAsset?.provenance_status || "unknown",
        certificate_link: protectedAsset?.certificate_link || "",
        image_ref: protectedAsset?.media_refs?.original_url_ref || "",
        snapshot_ref: protectedAsset?.media_refs?.snapshot_url_ref || "",
        rights_status: protectedAsset?.rights_status || "",
      },
      candidate_use: {
        source_id: alert.source_id || sourceRun?.source_id || "",
        source_name: caseRecord?.source_name || alert.source_name || source?.source_name || sourceRun?.source_name || "",
        source_type: caseRecord?.source_type || source?.source_type || "",
        source_url: safeText(sourceUrl),
        source_page: safeText(sourceRun?.source_url || sourceUrl),
        candidate_image_ref: safeText(candidateImageRef),
        retrieved_at: alert.retrieved_at || sourceRun?.completed_at || "",
        screenshot_status: sourceRun?.screenshot_path_or_status || "not_captured_current_phase",
        query_terms: cleanList(alert.query_terms || sourceRun?.query_terms || []),
        evidence_label: alert.evidence_label,
        public_claim_status: alert.public_claim_status,
        source_fixture_label: alert.source_fixture_label || "",
        risk_note: source?.risk_note || "",
      },
      match_explanation: {
        match_basis: alert.match_basis,
        similarity_score: alert.similarity_score,
        similarity_distance: alert.similarity_distance,
        similarity_threshold: alert.similarity_threshold,
        distance_scale: alert.distance_scale,
        transformation_notes: alert.transformation_notes,
        candidate_sha256: sourceRun?.candidate_sha256 || "",
        candidate_fingerprint: sourceRun?.candidate_fingerprint || "",
        protected_asset_distance: sourceRun?.protected_asset_distance ?? alert.similarity_distance,
      },
      run_metadata: {
        run_id: monitoringRun?.run_id || "",
        adapter_id: monitoringRun?.adapter?.id || "",
        adapter_mode: monitoringRun?.adapter?.mode || "",
        source_run_id: sourceRun?.run_id || "",
        source_run_status: sourceRun?.status || "",
        candidates_attempted: monitoringRun?.run_scope?.candidates_attempted ?? 0,
        candidates_matched: monitoringRun?.run_scope?.candidates_matched ?? 0,
        alerts_created: monitoringRun?.run_scope?.alerts_created ?? 0,
        protected_assets_considered: monitoringRun?.run_scope?.protected_assets_considered ?? 0,
        paid_api_used: monitoringRun?.adapter?.paid_api_used === true,
        budget_guard_respected: monitoringRun?.adapter?.budget_guard_respected !== false,
      },
      review_state: {
        current_status: alert.review_status,
        alert_status: alert.alert_status,
        current_state_note: currentReviewState?.review_note || "",
        available_statuses: [
          ...new Set([
            alert.review_status,
            ...ALLOWED_REVIEW_STATUSES.filter((status) => status !== "not_reviewed"),
            ...(currentReviewState ? [currentReviewState.review_status] : []),
          ]),
        ],
        reviewer_instruction:
          "Keep the report internal until a human reviewer checks source context, rights-owner status, and authorization.",
      },
      recommended_next_step:
        caseRecord?.recommended_next_step ||
        "Review source context and authorization before any external claim, partner contact, or takedown workflow.",
      public_use_label: {
        label: publicUseLabel,
        public_claim_status: alert.public_claim_status,
        counts_toward_market_validation: alert.dashboard_metric_effect?.counts_toward_market_validation === true,
        suspected_events_actual: alert.dashboard_metric_effect?.suspected_events_actual ?? 0,
        simulated_cases: alert.dashboard_metric_effect?.simulated_cases ?? (publicUseLabel === "simulated" ? 1 : 0),
        deck_use_rule:
          publicUseLabel === "actual_pending_review"
            ? "Internal review package only; do not count as a confirmed external infringement."
            : "Demo workflow only; do not count as market evidence.",
      },
      limitations: [
        "The local similarity score is a workflow signal, not a final source-use decision.",
        "The case remains pending human review and internal-only.",
        "Screenshot capture is best-effort; not_captured status means the report relies on URL and hash evidence only.",
        "Public infringement or takedown claims require separate source-context and authorization review.",
      ],
    },
  };

  return JSON.parse(redactSignedQueryInText(JSON.stringify(report)));
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const assets = readJson(DEMO_ASSETS, []);
  const alerts = readJson(ALERTS, []);
  const cases = readJson(CASES, []);
  const reviewStates = readJson(REVIEW_STATES, []);
  const monitoredSourcesDocument = readJson(MONITORED_SOURCES, { monitored_sources: [] });
  const monitoringRun = readJson(MONITORING_RUN, {});

  const reports = alerts.map((alert) => {
    const caseRecord = findById(cases, "case_id", alert.case_id) || {};
    const protectedAsset = findById(assets, "asset_id", alert.protected_asset_id);
    const source = findById(monitoredSourcesDocument.monitored_sources || [], "source_id", alert.source_id);
    const sourceRuns = monitoringRun.source_runs || [];
    const sourceRun =
      sourceRuns.find((run) => run.candidate_id === alert.candidate_item_id) ||
      sourceRuns.find((run) => run.source_id === alert.source_id);
    const currentReviewState =
      reviewStates.find((state) => state.alert_id === alert.alert_id && state.is_current) ||
      reviewStates.find((state) => state.alert_id === alert.alert_id && state.review_status === alert.review_status);

    return buildReport({
      alert,
      caseRecord,
      protectedAsset,
      source,
      sourceRun,
      currentReviewState,
      monitoringRun,
      generatedAt,
    });
  });

  const reportDocument = {
    generated_at: generatedAt,
    report_count: reports.length,
    source: "runPatrol.js artifacts",
    monitoring_run_id: monitoringRun.run_id || "",
    empty_state:
      reports.length === 0
        ? {
            reason: "latest_patrol_created_no_alerts",
            run_id: monitoringRun.run_id || "",
            adapter_id: monitoringRun.adapter?.id || "",
            completed_at: monitoringRun.completed_at || monitoringRun.generated_at || "",
          }
        : null,
    reports,
  };
  const reportMarkdown = buildReportMarkdown(reportDocument);
  const validationTargets = { reportDocument, reportMarkdown };
  const validation = {
    generated_at: generatedAt,
    phase: "Phase 3: Scheduler + evidence hardening",
    expected: {
      report_count_source: "alerts.json",
      required_sections: REQUIRED_SECTIONS,
      allowed_review_statuses: ALLOWED_REVIEW_STATUSES,
      public_use_labels: PUBLIC_USE_LABELS,
      prohibited_claim_guardrails: [
        "final-violation-claim",
        "source-use-certainty-claim",
        "automatic-enforcement-claim",
        "broad-web-realtime-claim",
      ],
    },
    actual: {
      report_count: reportDocument.report_count,
      alert_count: alerts.length,
      monitoring_run_id: monitoringRun.run_id || "",
      adapter_id: monitoringRun.adapter?.id || "",
      candidates_attempted: monitoringRun.run_scope?.candidates_attempted ?? 0,
      alerts_created: monitoringRun.run_scope?.alerts_created ?? 0,
      paid_api_used: monitoringRun.adapter?.paid_api_used === true,
      budget_guard_respected: monitoringRun.adapter?.budget_guard_respected !== false,
      empty_state_reason: reportDocument.empty_state?.reason || "",
    },
    pass: {
      report_count_matches_alerts: reportDocument.report_count === alerts.length,
      all_reports_from_alerts: reports.every((report) => alerts.some((alert) => alert.alert_id === report.alert_id)),
      empty_state_when_no_alerts:
        alerts.length > 0 || reportDocument.empty_state?.reason === "latest_patrol_created_no_alerts",
      all_required_sections_present:
        reports.length === 0 || reports.every((report) => REQUIRED_SECTIONS.every((section) => sectionHasContent(report, section))),
      protected_original_metadata_present:
        reports.length === 0 ||
        reports.every(
          (report) =>
            Boolean(report.sections.protected_original.asset_id) &&
            Boolean(report.sections.protected_original.certificate_link),
        ),
      candidate_source_details_present:
        reports.length === 0 ||
        reports.every(
          (report) =>
            Boolean(report.sections.candidate_use.source_name) &&
            Boolean(report.sections.candidate_use.source_url) &&
            Boolean(report.sections.candidate_use.candidate_image_ref) &&
            Boolean(report.sections.candidate_use.retrieved_at),
        ),
      match_explanation_complete:
        reports.length === 0 ||
        reports.every(
          (report) =>
            Boolean(report.sections.match_explanation.match_basis) &&
            report.sections.match_explanation.similarity_score !== null &&
            Boolean(report.sections.match_explanation.transformation_notes),
        ),
      run_metadata_present:
        reports.length === 0 ||
        reports.every(
          (report) =>
            Boolean(report.sections.run_metadata.run_id) &&
            Boolean(report.sections.run_metadata.adapter_id) &&
            Number.isFinite(Number(report.sections.run_metadata.candidates_attempted)),
        ),
      review_state_supported:
        reports.length === 0 ||
        reports.every((report) => ALLOWED_REVIEW_STATUSES.includes(report.sections.review_state.current_status)),
      actual_reports_labelled_pending_review:
        reports.length === 0 ||
        reports.every((report) => {
          const isActual = report.sections.candidate_use.evidence_label === "actual";
          return !isActual || report.sections.public_use_label.label === "actual_pending_review";
        }),
      reports_not_market_validation:
        reports.length === 0 ||
        reports.every(
          (report) =>
            report.sections.public_use_label.counts_toward_market_validation === false &&
            report.sections.public_use_label.suspected_events_actual === 0,
        ),
      no_signed_url_query_strings: !containsSignedQuery(validationTargets),
      no_prohibited_public_claims: !containsProhibitedClaim(validationTargets),
      removed_client_name_not_present: !containsRemovedClientName(validationTargets),
      paid_api_policy_respected:
        monitoringRun.adapter?.paid_api_used !== true || monitoringRun.adapter?.billable_enabled === true,
    },
    limitations: [
      "Reports are generated from local patrol artifacts.",
      "Reports are internal-only until a human reviewer verifies source context and authorization.",
      "Zero-alert patrols intentionally produce zero evidence reports.",
    ],
  };

  const allPass = Object.values(validation.pass).every(Boolean);

  writeJson(REPORT_FILE, reportDocument);
  writeText(REPORT_MARKDOWN_FILE, reportMarkdown);
  writeJson(REPORT_VALIDATION_FILE, validation);

  if (!allPass) {
    throw new Error(`Phase 3 report validation failed: ${JSON.stringify(validation.pass)}`);
  }

  console.log(
    JSON.stringify(
      {
        output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
        report_count: reportDocument.report_count,
        alert_count: alerts.length,
        monitoring_run_id: monitoringRun.run_id || "",
        adapter_id: monitoringRun.adapter?.id || "",
        validation_pass: allPass,
      },
      null,
      2,
    ),
  );
}

main();
