import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const PUBLIC_DIR = process.env.TTD_OUTPUT_DIR || path.join(REPO_ROOT, "public/ttd-mvp");
const DIST_DIR = process.env.TTD_DIST_DIR || path.join(REPO_ROOT, "dist/ttd-mvp");
const WRITE_PUBLIC = process.env.TTD_FRESHNESS_WRITE_PUBLIC !== "0";
const WRITE_DIST = process.env.TTD_FRESHNESS_WRITE_DIST !== "0";
const FRESHNESS_FILE = "deploy-freshness.json";
const DEFAULT_PAGE_URL = "https://upgraded-adventure-r2go1ky.pages.github.io/";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, "/");
}

function githubRunUrl() {
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const repository = process.env.GITHUB_REPOSITORY || "numbersprotocol/pyroimage-original-protection";
  const runId = process.env.GITHUB_RUN_ID;
  return runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : null;
}

function readOptionalJson(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

const publicMonitoringPath = path.join(PUBLIC_DIR, "monitoring-run.json");
const distMonitoringPath = path.join(DIST_DIR, "monitoring-run.json");
const patrolValidationPath = path.join(PUBLIC_DIR, "patrol-validation.json");
const publicMonitoring = readJson(publicMonitoringPath);
const distMonitoring = readJson(distMonitoringPath);
const patrolValidation = readOptionalJson(patrolValidationPath);
const publicHash = sha256File(publicMonitoringPath);
const distHash = sha256File(distMonitoringPath);
const runUrl = githubRunUrl();
const ref = process.env.GITHUB_REF || null;
const deployEnabled =
  process.env.TTD_PAGES_DEPLOY_ENABLED === "1" ||
  (ref === "refs/heads/main" && process.env.TTD_PAGES_DEPLOY_ENABLED !== "0");

const parity = {
  public_monitoring_run_path: rel(publicMonitoringPath),
  dist_monitoring_run_path: rel(distMonitoringPath),
  public_monitoring_run_sha256: publicHash,
  dist_monitoring_run_sha256: distHash,
  monitoring_run_hash_match: publicHash === distHash,
  monitoring_run_id_match: publicMonitoring.run_id === distMonitoring.run_id,
  monitoring_generated_at_match: publicMonitoring.generated_at === distMonitoring.generated_at,
  patrol_validation_pass: patrolValidation?.pass?.all === true,
};

parity.dist_contains_latest_monitoring_run =
  parity.monitoring_run_hash_match &&
  parity.monitoring_run_id_match &&
  parity.monitoring_generated_at_match;
parity.all = parity.dist_contains_latest_monitoring_run && parity.patrol_validation_pass;

const freshness = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  artifact: "originradar-pages-freshness",
  patrol: {
    run_id: publicMonitoring.run_id,
    generated_at: publicMonitoring.generated_at,
    status: publicMonitoring.status,
    adapter_id: publicMonitoring.adapter?.id || null,
    adapter_mode: publicMonitoring.adapter?.mode || null,
    paid_api_used: publicMonitoring.adapter?.paid_api_used === true,
    billable_enabled: publicMonitoring.adapter?.billable_enabled === true,
    budget_guard_respected: publicMonitoring.adapter?.budget_guard_respected !== false,
    protected_assets_considered: publicMonitoring.run_scope?.protected_assets_considered ?? null,
    candidates_attempted: publicMonitoring.run_scope?.candidates_attempted ?? null,
    candidates_matched: publicMonitoring.run_scope?.candidates_matched ?? null,
    alerts_created: publicMonitoring.run_scope?.alerts_created ?? null,
    validation_pass: patrolValidation?.pass?.all === true,
  },
  source: {
    sha: process.env.GITHUB_SHA || null,
    ref,
    ref_name: process.env.GITHUB_REF_NAME || null,
    event_name: process.env.GITHUB_EVENT_NAME || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
    repository: process.env.GITHUB_REPOSITORY || "numbersprotocol/pyroimage-original-protection",
  },
  pages_deploy: {
    strategy: process.env.TTD_PAGES_DEPLOY_STRATEGY || "same_workflow_pages_deploy",
    enabled: deployEnabled,
    expected_environment: "github-pages",
    page_url: process.env.TTD_PAGES_URL || DEFAULT_PAGE_URL,
    workflow_run_id: process.env.GITHUB_RUN_ID || null,
    workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    workflow_run_url: runUrl,
    note: deployEnabled
      ? "The Pages artifact is uploaded from the same dist directory validated by this file."
      : "Pages deploy is skipped for non-main refs; parity still proves the local dist contains the latest patrol artifacts.",
  },
  parity,
  limitations: [
    "This artifact proves build-time parity between public patrol JSON and the Pages dist artifact.",
    "It does not claim a real infringement; alerts still require source-context human review.",
    "Vision budget guard fields are reported from monitoring-run.json and are not modified by this deploy freshness check.",
  ],
};

if (WRITE_PUBLIC) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, FRESHNESS_FILE), `${JSON.stringify(freshness, null, 2)}\n`);
}

if (WRITE_DIST) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, FRESHNESS_FILE), `${JSON.stringify(freshness, null, 2)}\n`);
}

console.log(JSON.stringify({
  freshness_file: FRESHNESS_FILE,
  patrol_run_id: freshness.patrol.run_id,
  patrol_generated_at: freshness.patrol.generated_at,
  dist_contains_latest_monitoring_run: freshness.parity.dist_contains_latest_monitoring_run,
  validation_pass: freshness.parity.all,
  pages_deploy_enabled: freshness.pages_deploy.enabled,
}, null, 2));

if (freshness.parity.all !== true) {
  throw new Error(`Deploy freshness parity failed: ${JSON.stringify(freshness.parity)}`);
}
