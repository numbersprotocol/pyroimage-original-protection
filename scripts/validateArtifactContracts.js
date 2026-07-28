import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARTIFACT_CONTRACTS, validateArtifact, validateArtifactSet } from "../src/contracts/artifactContracts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const ARTIFACT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");

function readArtifact(fileName) {
  return JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, fileName), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const artifacts = Object.fromEntries(
  Object.entries(ARTIFACT_CONTRACTS)
    .map(([name, contract]) => [name, readArtifact(contract.fileName)]),
);

const committedResult = validateArtifactSet(artifacts);
if (!committedResult.ok) {
  throw new Error(`Committed artifact contract validation failed: ${committedResult.errors.join("; ")}`);
}

const malformedMonitoringRun = clone(artifacts.monitoringRun);
delete malformedMonitoringRun.run_id;
const malformedResult = validateArtifact("monitoringRun", malformedMonitoringRun);
if (malformedResult.ok) {
  throw new Error("Malformed monitoring-run fixture unexpectedly passed contract validation");
}

console.log(
  JSON.stringify(
    {
      artifact_dir: path.relative(WORKSPACE_ROOT, ARTIFACT_DIR),
      committed_artifacts_validated: committedResult.results.length,
      malformed_fixture_rejected: true,
      malformed_fixture_errors: malformedResult.errors,
    },
    null,
    2,
  ),
);
