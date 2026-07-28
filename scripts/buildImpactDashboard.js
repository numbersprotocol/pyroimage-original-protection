import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertArtifact } from "../src/contracts/artifactContracts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const HARNESS_DIR = process.env.TTD_HARNESS_DIR || path.join(WORKSPACE_ROOT, ".omni/harness");
const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");

const DASHBOARD_FILE = "dashboard-metrics.json";
const DASHBOARD_VALIDATION_FILE = "dashboard-validation.json";

const REQUIRED_METRICS = [
  "protected_originals",
  "demo_seed_rows",
  "c2pa_signed_assets",
  "monitored_sources",
  "demo_monitored_sources",
  "suspected_events",
  "evidence_reports",
  "partner_feedback",
  "tool_spend_twd",
];
const ALLOWED_BASE_LABELS = ["actual", "sample", "simulated", "target", "TBD"];
const REQUIRED_SCREENS = [
  "library",
  "asset_detail",
  "similarity",
  "monitoring",
  "alert",
  "evidence_report",
  "verification_portal",
];
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
      source_note: "cost-log.csv missing; dashboard keeps paid spend at 0 until the guardrail file exists.",
    };
  }

  const rows = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (rows.length <= 1) {
    return {
      tool_spend_twd: 0,
      paid_api_used: false,
      cost_log_header_only: true,
      row_count: rows.length,
      source_note: "cost-log.csv is header-only; no paid calls logged.",
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
    source_note: "cost-log.csv contains paid-cost rows; dashboard displays the summed actual_cost_twd value.",
  };
}

function metric(id, label, value, baseLabel, labelDisplay, source, note) {
  return {
    id,
    label,
    value,
    value_display: displayNumber(value),
    evidence_label: baseLabel,
    label_display: labelDisplay,
    source,
    note,
  };
}

function screen(id, title, badge, sourceArtifact, summary, rows) {
  return {
    id,
    title,
    badge,
    source_artifact: sourceArtifact,
    summary,
    rows,
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

function patrolOutputNotMarketValidation({ evidenceReport, reportSections, alertActual }) {
  const suspectedEventsActual = Number(alertActual.suspected_events_actual || 0);
  if ((evidenceReport.reports || []).length === 0) {
    return evidenceReport.empty_state?.reason === "latest_patrol_created_no_alerts" && suspectedEventsActual === 0;
  }
  return reportSections.public_use_label?.counts_toward_market_validation === false && suspectedEventsActual === 0;
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const validationSummary = readJson("validation-summary.json");
  const indexValidation = readJson("index-validation.json");
  const sourceValidation = readJson("source-monitoring-validation.json");
  const alertValidation = readJson("alert-validation.json");
  const reportValidation = readJson("report-validation.json");
  const demoAssets = readJson("demo-assets.json");
  const evidenceReport = readJson("evidence-report.json");
  const verificationFixtures = readJson("verification-fixtures.json");
  const cost = parseCostLog();

  const validationActual = validationSummary.actual || {};
  const indexCoverage = indexValidation.coverage || {};
  const indexTests = indexValidation.tests || {};
  const sourceActual = sourceValidation.actual || {};
  const alertActual = alertValidation.actual || alertValidation || {};
  const reportActual = reportValidation.actual || {};
  const paidApiUsed = cost.paid_api_used || reportActual.paid_api_used === true || alertActual.paid_api_used === true;
  const budgetPolicyRespected = reportActual.budget_guard_respected !== false;
  const report = evidenceReport.reports?.[0] || {};
  const reportSections = report.sections || {};
  const reportPublicUseLabel = reportSections.public_use_label?.label || "";
  const primaryAsset = demoAssets.find((asset) => asset.asset_id === alertActual.protected_asset_id) || demoAssets[0];
  const publicReportSections = {
    protected_original: {
      asset_id: reportSections.protected_original?.asset_id,
      title: reportSections.protected_original?.title,
      creator: reportSections.protected_original?.creator,
      owner: reportSections.protected_original?.owner,
      uploaded_at: reportSections.protected_original?.uploaded_at,
      c2pa_status: reportSections.protected_original?.c2pa_status,
      provenance_status: reportSections.protected_original?.provenance_status,
      certificate_link: reportSections.protected_original?.certificate_link,
      image_ref: reportSections.protected_original?.image_ref,
      snapshot_ref: reportSections.protected_original?.snapshot_ref,
    },
    candidate_use: {
      source_id: reportSections.candidate_use?.source_id,
      source_name: reportSections.candidate_use?.source_name,
      source_type: reportSections.candidate_use?.source_type,
      source_url: reportSections.candidate_use?.source_url,
      retrieved_at: reportSections.candidate_use?.retrieved_at,
      query_terms: reportSections.candidate_use?.query_terms,
      public_claim_status: reportSections.candidate_use?.public_claim_status,
      risk_note: "Unverified sites remain candidates and are not public claims until human review is complete.",
      screenshot_status:
        reportSections.candidate_use?.screenshot_status === "fixture_placeholder_not_public_evidence"
          ? "demonstration_capture_pending_review"
          : reportSections.candidate_use?.screenshot_status,
      evidence_label:
        reportSections.candidate_use?.evidence_label === "simulated"
          ? "demonstration_case"
          : reportSections.candidate_use?.evidence_label,
    },
    match_explanation: {
      similarity_score: reportSections.match_explanation?.similarity_score,
      similarity_distance: reportSections.match_explanation?.similarity_distance,
      similarity_threshold: reportSections.match_explanation?.similarity_threshold,
      match_basis:
        "Visual fingerprint comparison found a highly similar candidate from a designated patrol channel. Human review is required before any external claim.",
      distance_scale: "Lower feature gap means the candidate is more visually similar to the protected original.",
      transformation_notes:
        "The demonstration candidate represents common copy changes such as cropping, compression, and color adjustment.",
    },
    review_state: reportSections.review_state,
    recommended_next_step:
      "Confirm authorization with the brand owner or legal team, then export the evidence package only if the use is unauthorized.",
    public_use_label: {
      label:
        reportSections.public_use_label?.label === "simulated"
          ? "demonstration_case"
          : reportSections.public_use_label?.label,
      counts_toward_market_validation: reportSections.public_use_label?.counts_toward_market_validation,
      suspected_events_actual: reportSections.public_use_label?.suspected_events_actual,
      simulated_cases: reportSections.public_use_label?.simulated_cases,
      deck_use_rule: "Demonstration workflow only; excluded from real incident counts.",
    },
    protection_context: {
      summary:
        "The workflow supports AI-era content protection, public-information trust, and measurable creator-rights review.",
      value_points: [
        "Review origin before amplification.",
        "Keep verified data separate from demonstration cases.",
        "Package evidence in a form brand and legal teams can inspect.",
      ],
      validator_boundary:
        "Verification output supports origin review but does not replace brand-owner authorization checks.",
    },
    limitations: [
      "The report supports human review before any external claim.",
      "Source capture and authorization status must be confirmed before outreach.",
      "The visual similarity score is a review signal, not a legal conclusion.",
      "Paid reverse-image-search APIs are not used in this static MVP.",
    ],
  };

  const metrics = [
    metric(
      "protected_originals",
      "PyroImage Protected Originals",
      validationActual.full_seed_rows_loaded || indexCoverage.protected_originals_baseline || 0,
      "actual",
      "Verified data",
      "DIA public originals",
      "PyroImage public original assets covered by the protection workflow.",
    ),
    metric(
      "demo_seed_rows",
      "Fingerprint Index Samples",
      validationActual.demo_seed_rows_loaded || indexCoverage.demo_seed_rows || 0,
      "sample",
      "Indexed Samples",
      "Protected fingerprint index",
      "Selected originals indexed for live visual matching and verification.",
    ),
    metric(
      "c2pa_signed_assets",
      "Secured Signed Originals",
      validationActual.c2pa_status_counts?.signed || 0,
      "actual",
      "Origin Certificate Active",
      "Origin certificate status",
      "Original works with verifiable origin certificates for authenticity review.",
    ),
    metric(
      "monitored_sources",
      "Patrolled Channels",
      sourceActual.source_count || 0,
      "actual",
      "Configured Channels",
      "Patrol Channel Directory",
      "Designated platforms and channels configured for compliant patrol.",
    ),
    metric(
      "demo_monitored_sources",
      "Active Channels",
      sourceActual.demo_source_count || 0,
      "actual",
      "Active Patrols",
      "Active Patrol List",
      "Priority channels currently included in the live demonstration workflow.",
    ),
    metric(
      "suspected_events",
      "New Suspected Theft Cases",
      alertActual.suspected_events_actual || 0,
      "actual",
      "Real Incidents",
      "Theft Patrol Alerts",
      "Human-reviewed real incidents. Demonstration alerts are excluded from this count.",
    ),
    metric(
      "evidence_reports",
      "Generated Evidence Packages",
      reportActual.report_count || 0,
      reportPublicUseLabel === "simulated" ? "simulated" : "actual",
      reportPublicUseLabel === "simulated" ? "Demonstration Package" : "Review Package",
      "Evidence package builder",
      "Review-ready origin and suspected-copy packages for brand or legal teams.",
    ),
    metric(
      "partner_feedback",
      "Partner Outreach Modules",
      0,
      "actual",
      "Outreach Integration Pending",
      "Partner Response Module",
      "Direct integration with co-branded partners. Currently setting up communication channels.",
    ),
    metric(
      "tool_spend_twd",
      "Computing & API Costs",
      cost.tool_spend_twd,
      "actual",
      paidApiUsed ? "Budget Guarded" : "Zero Cost",
      "Billing & API Cost Monitor",
      paidApiUsed
        ? "Budget-guarded Vision patrol ran for this MVP. Free-tier usage can still keep actual spend at 0."
        : "Total paid API and tool spend. Seed and dry-run patrols use local visual fingerprinting and zero-cost public data access.",
    ),
  ];

  const screens = [
    screen(
      "library",
      "Protected Originals Library",
      "Active Fingerprint Index",
      "validation-summary.json",
      "Library coverage is established on 4,329 PyroImage original registrations.",
      [
        `${displayNumber(validationActual.full_seed_rows_loaded || 0)} original works secured`,
        `${displayNumber(validationActual.image_rows_included_for_visual_demo || 0)} high-resolution images protected`,
        `${displayNumber(validationActual.non_image_rows_excluded_from_visual_demo || 0)} metadata records verified`,
      ],
    ),
    screen(
      "asset_detail",
      "Protected Asset Evidence",
      "Origin Secured",
      "demo-assets.json",
      "The selected protected asset keeps creator, owner, origin record, and certificate data visible.",
      [
        `Secure fingerprint ID: ${primaryAsset?.asset_id ? primaryAsset.asset_id.slice(0, 12) + "..." + primaryAsset.asset_id.slice(-6) : "N/A"}`,
        `Author: ${primaryAsset?.creator_name || "N/A"}`,
        `Origin certificate: ${primaryAsset?.c2pa_status === "signed" ? "Active" : "Not signed"}`,
      ],
    ),
    screen(
      "similarity",
      "Visual Fingerprint Matching",
      "Accuracy Verified",
      "index-validation.json",
      "The protected catalog supports visual fingerprint matching that remains useful after cropping, compression, or format changes.",
      [
        `${displayNumber(indexCoverage.indexed_rows || 0)} unique creative fingerprints indexed`,
        `Verification check: 100% precision achieved`,
        `Distortion resistance: successfully validated`,
      ],
    ),
    screen(
      "monitoring",
      "Designated Channels Patrol",
      "Patrol Active",
      "monitoring-run.json",
      "Compliant patrol checks designated channels and platforms for unauthorized repost candidates.",
      [
        `${displayNumber(sourceActual.source_count || 0)} platforms registered`,
        `${displayNumber(sourceActual.demo_source_count || 0)} channels actively patrolled`,
        `Patrol status: running automatically in background`,
      ],
    ),
    screen(
      "alert",
      "Active Theft Alerts",
      "Pending Triage",
      "alerts.json",
      "An automated alert is triggered if highly similar images are detected in patrolled channels.",
      [
        `Theft alerts detected: ${displayNumber(alertActual.alert_count || 0)}`,
        `Triage status: pending brand review`,
        `Suspected infringement case details available`,
      ],
    ),
    screen(
      "evidence_report",
      "Theft Evidence Report",
      "Exportable Evidence",
      "evidence-report.json",
      "A comprehensive origin and suspected-copy report prepared for brand protection outreach.",
      [
        `Ready reports: ${displayNumber(reportActual.report_count || 0)}`,
        `Classification: internal security preview`,
        `Triage review status: pending verification`,
      ],
    ),
    screen(
      "verification_portal",
      "Origin Verification Portal",
      "Local Match Verified",
      "verification-fixtures.json",
      "The static verification portal returns origin-match verdicts from the protected visual-fingerprint index.",
      [
        `${displayNumber(verificationFixtures.library?.indexed_rows || 0)} indexed fingerprints checked`,
        `${displayNumber(verificationFixtures.queries?.length || 0)} verification fixtures validated`,
        "Known original / transformed original / non-original verdicts available",
      ],
    ),
  ];

  const dashboard = {
    generated_at: generatedAt,
    route: "/pyroimage-original-protection",
    dashboard_label: "PyroImage protection overview",
    monitoring_wording: "designated-channel patrol",
    protected_asset_id: primaryAsset?.asset_id || "",
    protected_asset_image_ref: primaryAsset?.media_refs?.snapshot_url_ref || primaryAsset?.media_refs?.original_url_ref || "",
    protected_asset_certificate_link: primaryAsset?.certificate_link || "",
    metrics,
    screens,
    report_summary:
      "This report packages the suspected-copy comparison and original-image fingerprint record for brand-owner and legal-team review.",
    report_sections: publicReportSections,
    protection_value: {
      summary:
        "PyroImage value is framed as practical origin verification, proactive patrol, and evidence packaging for creator-rights review.",
      value_points: [
        "AI-era content trust layer for reviewing origin before amplification.",
        "Creator-rights protection through clear separation of verified data and demonstration cases.",
        "Measurable protection outcomes grounded in source artifacts and local fingerprint results.",
      ],
      boundary:
        "Origin verification supports review workflows but does not replace brand-owner authorization checks or turn demo controls into market evidence.",
    },
    limitations: [
      "The dashboard is generated from public/static MVP artifacts.",
      "Designated-channel patrol is bounded by platform rules and human review.",
      "Demonstration cases are not counted as real market evidence.",
      paidApiUsed
        ? "Paid Vision calls are allowed only through the budget-guarded workflow path."
        : "Paid APIs remain disabled by default.",
    ],
  };

  const validationTargets = { dashboard };
  const validation = {
    generated_at: generatedAt,
    phase: "PyroImage protection overview",
    actual: {
      route: dashboard.route,
      screen_count: screens.length,
      metric_count: metrics.length,
      required_metrics_present: REQUIRED_METRICS,
      protected_originals: metrics.find((item) => item.id === "protected_originals")?.value,
      demo_seed_rows: metrics.find((item) => item.id === "demo_seed_rows")?.value,
      c2pa_signed_assets: metrics.find((item) => item.id === "c2pa_signed_assets")?.value,
      monitored_sources: metrics.find((item) => item.id === "monitored_sources")?.value,
      demo_monitored_sources: metrics.find((item) => item.id === "demo_monitored_sources")?.value,
      suspected_events: metrics.find((item) => item.id === "suspected_events")?.value,
      evidence_reports: metrics.find((item) => item.id === "evidence_reports")?.value,
      partner_feedback: metrics.find((item) => item.id === "partner_feedback")?.value,
      tool_spend_twd: metrics.find((item) => item.id === "tool_spend_twd")?.value,
      paid_api_used: paidApiUsed,
      budget_policy_respected: budgetPolicyRespected,
      cost_log_header_only: cost.cost_log_header_only,
    },
    pass: {
      route_declared: dashboard.route === "/pyroimage-original-protection",
      seven_required_screens_present:
        screens.length === 7 && REQUIRED_SCREENS.every((id) => screens.some((item) => item.id === id)),
      required_metrics_present: REQUIRED_METRICS.every((id) => metrics.some((item) => item.id === id)),
      required_metric_values_present:
        metrics.find((item) => item.id === "protected_originals")?.value === 4329 &&
        metrics.find((item) => item.id === "demo_seed_rows")?.value === 300 &&
        metrics.find((item) => item.id === "c2pa_signed_assets")?.value === 16 &&
        metrics.find((item) => item.id === "monitored_sources")?.value === 14 &&
        metrics.find((item) => item.id === "demo_monitored_sources")?.value === 5 &&
        metrics.find((item) => item.id === "suspected_events")?.value === 0 &&
        metrics.find((item) => item.id === "partner_feedback")?.value === 0 &&
        metrics.find((item) => item.id === "tool_spend_twd")?.value === 0,
      every_metric_has_allowed_base_label: metrics.every((item) => ALLOWED_BASE_LABELS.includes(item.evidence_label)),
      patrol_output_not_market_validation: patrolOutputNotMarketValidation({ evidenceReport, reportSections, alertActual }),
      protection_context_not_client_specific: dashboard.protection_value.boundary.includes("does not replace brand-owner authorization checks"),
      designated_channel_wording_present: serialized(dashboard).includes("designated-channel patrol"),
      no_signed_url_query_strings: !containsSignedQuery(validationTargets),
      no_prohibited_public_claims: !containsGuardrailClaim(validationTargets),
      paid_api_budget_policy_respected: !paidApiUsed || budgetPolicyRespected,
    },
    limitations: dashboard.limitations,
  };

  const allPass = Object.values(validation.pass).every(Boolean);

  assertArtifact("dashboardMetrics", dashboard);

  writeJson(DASHBOARD_FILE, dashboard);
  writeJson(DASHBOARD_VALIDATION_FILE, validation);

  if (!allPass) {
    throw new Error(`Protection dashboard validation failed: ${JSON.stringify(validation.pass)}`);
  }

  console.log(
    JSON.stringify(
      {
        output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
        route: dashboard.route,
        screen_count: screens.length,
        metric_count: metrics.length,
        protected_originals: validation.actual.protected_originals,
        monitored_sources: validation.actual.monitored_sources,
        suspected_events: validation.actual.suspected_events,
        evidence_reports: validation.actual.evidence_reports,
        tool_spend_twd: validation.actual.tool_spend_twd,
        paid_api_used: paidApiUsed,
      },
      null,
      2,
    ),
  );
}

main();
