const REQUIRED_DASHBOARD_METRICS = [
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

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value) {
  return typeof value === "boolean";
}

function requireObject(value, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  return value;
}

function requireArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  return value;
}

function requireField(obj, key, predicate, description, path, errors) {
  if (!predicate(obj?.[key])) {
    errors.push(`${path}.${key} must be ${description}`);
  }
}

function requireAnyField(obj, keys, predicate, description, path, errors) {
  if (!keys.some((key) => predicate(obj?.[key]))) {
    errors.push(`${path} must include one of ${keys.join(", ")} as ${description}`);
  }
}

function requirePassObject(value, path, errors) {
  const pass = requireObject(value, path, errors);
  if (!pass) return;
  requireField(pass, "all", isBoolean, "a boolean", path, errors);
}

function validateRows(rows, path, errors, validateRow) {
  requireArray(rows, path, errors).forEach((row, index) => {
    if (!isObject(row)) {
      errors.push(`${path}[${index}] must be an object`);
      return;
    }
    validateRow(row, `${path}[${index}]`);
  });
}

function validateMonitoringRun(value) {
  const errors = [];
  const doc = requireObject(value, "monitoringRun", errors);
  if (!doc) return errors;

  requireField(doc, "generated_at", isString, "a non-empty string", "monitoringRun", errors);
  requireField(doc, "run_id", isString, "a non-empty string", "monitoringRun", errors);
  requireField(doc, "status", isString, "a non-empty string", "monitoringRun", errors);

  const adapter = requireObject(doc.adapter, "monitoringRun.adapter", errors);
  if (adapter) {
    requireField(adapter, "id", isString, "a non-empty string", "monitoringRun.adapter", errors);
    requireField(adapter, "mode", isString, "a non-empty string", "monitoringRun.adapter", errors);
    requireField(adapter, "paid_api_used", isBoolean, "a boolean", "monitoringRun.adapter", errors);
    requireField(adapter, "billable_enabled", isBoolean, "a boolean", "monitoringRun.adapter", errors);
    requireField(adapter, "budget_guard_respected", isBoolean, "a boolean", "monitoringRun.adapter", errors);
  }

  const scope = requireObject(doc.run_scope, "monitoringRun.run_scope", errors);
  if (scope) {
    ["protected_assets_considered", "candidates_attempted", "candidates_matched", "alerts_created"].forEach((key) => {
      requireField(scope, key, isNumber, "a finite number", "monitoringRun.run_scope", errors);
    });
  }

  validateRows(doc.source_runs, "monitoringRun.source_runs", errors, (row, path) => {
    requireField(row, "source_id", isString, "a non-empty string", path, errors);
    requireField(row, "source_name", isString, "a non-empty string", path, errors);
    requireField(row, "status", isString, "a non-empty string", path, errors);
  });

  return errors;
}

function validatePatrolValidation(value) {
  const errors = [];
  const doc = requireObject(value, "patrolValidation", errors);
  if (!doc) return errors;

  requireField(doc, "generated_at", isString, "a non-empty string", "patrolValidation", errors);
  requireField(doc, "run_id", isString, "a non-empty string", "patrolValidation", errors);
  requireField(doc, "adapter", isString, "a non-empty string", "patrolValidation", errors);
  requireField(doc, "threshold", isNumber, "a finite number", "patrolValidation", errors);
  requireArray(doc.validations, "patrolValidation.validations", errors);
  requirePassObject(doc.pass, "patrolValidation.pass", errors);

  return errors;
}

function validateAlerts(value) {
  const errors = [];
  validateRows(value, "alerts", errors, (row, path) => {
    [
      "alert_id",
      "alert_status",
      "protected_asset_id",
      "source_id",
      "source_url",
      "review_status",
      "evidence_label",
      "public_claim_status",
    ].forEach((key) => requireField(row, key, isString, "a non-empty string", path, errors));
    ["similarity_score", "similarity_distance", "similarity_threshold"].forEach((key) =>
      requireField(row, key, isNumber, "a finite number", path, errors),
    );
  });
  return errors;
}

function validateCases(value) {
  const errors = [];
  validateRows(value, "cases", errors, (row, path) => {
    ["case_id", "original_asset_id", "source_id", "alert_id", "review_status", "evidence_label", "public_claim_status"].forEach((key) =>
      requireField(row, key, isString, "a non-empty string", path, errors),
    );
  });
  return errors;
}

function validateEvidenceReport(value) {
  const errors = [];
  const doc = requireObject(value, "evidenceReport", errors);
  if (!doc) return errors;

  requireField(doc, "generated_at", isString, "a non-empty string", "evidenceReport", errors);
  requireField(doc, "report_count", isNumber, "a finite number", "evidenceReport", errors);
  const reports = requireArray(doc.reports, "evidenceReport.reports", errors);
  if (isNumber(doc.report_count) && doc.report_count !== reports.length) {
    errors.push("evidenceReport.report_count must equal reports.length");
  }
  reports.forEach((report, index) => {
    if (!isObject(report)) {
      errors.push(`evidenceReport.reports[${index}] must be an object`);
      return;
    }
    requireField(report, "report_id", isString, "a non-empty string", `evidenceReport.reports[${index}]`, errors);
    requireField(report, "report_label", isString, "a non-empty string", `evidenceReport.reports[${index}]`, errors);
    requireField(report, "summary", isString, "a non-empty string", `evidenceReport.reports[${index}]`, errors);
  });

  return errors;
}

function validateVerificationFixtures(value) {
  const errors = [];
  const doc = requireObject(value, "verificationFixtures", errors);
  if (!doc) return errors;

  requireField(doc, "generated_at", isString, "a non-empty string", "verificationFixtures", errors);
  const library = requireObject(doc.library, "verificationFixtures.library", errors);
  if (library) {
    requireField(library, "indexed_rows", isNumber, "a finite number", "verificationFixtures.library", errors);
    requireField(library, "threshold", isNumber, "a finite number", "verificationFixtures.library", errors);
    requireField(library, "paid_api_used", isBoolean, "a boolean", "verificationFixtures.library", errors);
  }
  validateRows(doc.queries, "verificationFixtures.queries", errors, (row, path) => {
    requireField(row, "query_id", isString, "a non-empty string", path, errors);
    requireField(row, "query_type", isString, "a non-empty string", path, errors);
    requireArray(row.accepted_inputs, `${path}.accepted_inputs`, errors);
    requireObject(row.result, `${path}.result`, errors);
    requireObject(row.verdict, `${path}.verdict`, errors);
  });
  requirePassObject(doc.pass, "verificationFixtures.pass", errors);

  return errors;
}

function validateDashboardMetrics(value) {
  const errors = [];
  const doc = requireObject(value, "dashboardMetrics", errors);
  if (!doc) return errors;

  requireField(doc, "generated_at", isString, "a non-empty string", "dashboardMetrics", errors);
  requireField(doc, "route", isString, "a non-empty string", "dashboardMetrics", errors);
  validateRows(doc.metrics, "dashboardMetrics.metrics", errors, (row, path) => {
    requireField(row, "id", isString, "a non-empty string", path, errors);
    requireField(row, "value_display", isString, "a non-empty string", path, errors);
    requireField(row, "evidence_label", isString, "a non-empty string", path, errors);
  });
  validateRows(doc.screens, "dashboardMetrics.screens", errors, (row, path) => {
    requireField(row, "id", isString, "a non-empty string", path, errors);
    requireField(row, "source_artifact", isString, "a non-empty string", path, errors);
  });
  const ids = new Set(Array.isArray(doc.metrics) ? doc.metrics.map((metric) => metric?.id) : []);
  REQUIRED_DASHBOARD_METRICS.forEach((id) => {
    if (!ids.has(id)) errors.push(`dashboardMetrics.metrics is missing required metric ${id}`);
  });

  return errors;
}

function validateMonitoredSources(value) {
  const errors = [];
  const doc = requireObject(value, "monitoredSources", errors);
  if (!doc) return errors;

  requireField(doc, "generated_at", isString, "a non-empty string", "monitoredSources", errors);
  requireField(doc, "source_count", isNumber, "a finite number", "monitoredSources", errors);
  const sources = requireArray(doc.monitored_sources, "monitoredSources.monitored_sources", errors);
  if (isNumber(doc.source_count) && doc.source_count !== sources.length) {
    errors.push("monitoredSources.source_count must equal monitored_sources.length");
  }
  sources.forEach((source, index) => {
    if (!isObject(source)) {
      errors.push(`monitoredSources.monitored_sources[${index}] must be an object`);
      return;
    }
    ["source_id", "source_name", "source_type", "crawl_method", "risk_level"].forEach((key) =>
      requireField(source, key, isString, "a non-empty string", `monitoredSources.monitored_sources[${index}]`, errors),
    );
  });

  return errors;
}

function validateDemoHandback(value) {
  const errors = [];
  const doc = requireObject(value, "demoHandback", errors);
  if (!doc) return errors;

  requireField(doc, "generated_at", isString, "a non-empty string", "demoHandback", errors);
  requireObject(doc.demo_target, "demoHandback.demo_target", errors);
  requireObject(doc.local_runbook, "demoHandback.local_runbook", errors);
  requireArray(doc.qa_ready_checklist, "demoHandback.qa_ready_checklist", errors);
  requireArray(doc.completed_phases, "demoHandback.completed_phases", errors);
  requireArray(doc.metrics_snapshot, "demoHandback.metrics_snapshot", errors);
  requireArray(doc.five_minute_recording_flow, "demoHandback.five_minute_recording_flow", errors);
  requireObject(doc.guardrails, "demoHandback.guardrails", errors);
  requireObject(doc.cost_guardrail, "demoHandback.cost_guardrail", errors);

  return errors;
}

function validateDemoAssets(value) {
  const errors = [];
  validateRows(value, "demoAssets", errors, (row, path) => {
    requireField(row, "asset_id", isString, "a non-empty string", path, errors);
    requireAnyField(row, ["display_title", "headline"], isString, "a non-empty display title/headline", path, errors);
  });
  return errors;
}

export const ARTIFACT_CONTRACTS = {
  monitoringRun: { fileName: "monitoring-run.json", validate: validateMonitoringRun },
  patrolValidation: { fileName: "patrol-validation.json", validate: validatePatrolValidation },
  alerts: { fileName: "alerts.json", validate: validateAlerts },
  cases: { fileName: "cases.json", validate: validateCases },
  evidenceReport: { fileName: "evidence-report.json", validate: validateEvidenceReport },
  verificationFixtures: { fileName: "verification-fixtures.json", validate: validateVerificationFixtures },
  dashboardMetrics: { fileName: "dashboard-metrics.json", validate: validateDashboardMetrics },
  monitoredSources: { fileName: "monitored-sources.json", validate: validateMonitoredSources },
  demoHandback: { fileName: "demo-handback.json", validate: validateDemoHandback },
  demoAssets: { fileName: "demo-assets.json", validate: validateDemoAssets },
};

const CONTRACT_ALIASES = new Map(
  Object.entries(ARTIFACT_CONTRACTS).flatMap(([name, contract]) => [
    [name, name],
    [contract.fileName, name],
  ]),
);

function resolveContractName(name) {
  const resolved = CONTRACT_ALIASES.get(name);
  if (!resolved) {
    throw new Error(`Unknown OriginRadar artifact contract: ${name}`);
  }
  return resolved;
}

export class ArtifactContractError extends Error {
  constructor(name, errors) {
    super(`${name} contract failed: ${errors.join("; ")}`);
    this.name = "ArtifactContractError";
    this.artifactName = name;
    this.errors = errors;
  }
}

export function validateArtifact(name, value) {
  const resolved = resolveContractName(name);
  const errors = ARTIFACT_CONTRACTS[resolved].validate(value);
  return {
    name: resolved,
    fileName: ARTIFACT_CONTRACTS[resolved].fileName,
    ok: errors.length === 0,
    errors,
  };
}

export function assertArtifact(name, value) {
  const result = validateArtifact(name, value);
  if (!result.ok) {
    throw new ArtifactContractError(result.name, result.errors);
  }
  return value;
}

export function validateArtifactSet(artifacts) {
  const results = Object.entries(artifacts).map(([name, value]) => validateArtifact(name, value));
  return {
    ok: results.every((result) => result.ok),
    results,
    errors: results.flatMap((result) => result.errors.map((error) => `${result.fileName}: ${error}`)),
  };
}

export function assertArtifactSet(artifacts) {
  const result = validateArtifactSet(artifacts);
  if (!result.ok) {
    throw new ArtifactContractError("artifact set", result.errors);
  }
  return artifacts;
}

export function validateOriginRadarArtifacts(data) {
  return validateArtifactSet({
    dashboardMetrics: data.dashboard,
    demoAssets: data.demoAssets,
    monitoredSources: data.monitoredSources,
    monitoringRun: data.monitoring,
    alerts: data.alerts,
    evidenceReport: data.evidenceReport,
    verificationFixtures: data.verification,
  });
}

export function formatContractErrors(errors) {
  return errors.slice(0, 8).join("; ");
}
