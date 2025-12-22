import fs from "node:fs";
import path from "node:path";

function sanitizeRunId(timestamp) {
  return timestamp.replace(/[:.]/g, "-");
}

export function buildReport({
  scenarioId,
  seed,
  engineInfo,
  assertions,
  diagnostics,
  stateHashes,
  mode,
  datasetHash,
  metrics
}) {
  const timestamp = new Date().toISOString();
  return {
    runId: sanitizeRunId(timestamp),
    scenarioId,
    seed,
    engineVersion: engineInfo.engineVersion,
    engineContractVersion: engineInfo.engineContractVersion,
    mode,
    assertions,
    diagnostics,
    stateHashes,
    datasetHash,
    metrics,
    timestamp
  };
}

export function writeReport(report, reportDir) {
  fs.mkdirSync(reportDir, { recursive: true });
  const filename = `${report.scenarioId}-${report.runId}.json`;
  const target = path.join(reportDir, filename);
  fs.writeFileSync(target, JSON.stringify(report, null, 2));
  return target;
}
