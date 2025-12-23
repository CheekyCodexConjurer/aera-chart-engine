import path from "node:path";
import { fileURLToPath } from "node:url";
import { listScenarioIds } from "../scenarios/registry.mjs";
import { runScenario } from "./runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORT_DIR = path.resolve(__dirname, "..", "reports");

function parseArgs(argv) {
  const args = { scenarioId: "replay-scrub", reportDir: DEFAULT_REPORT_DIR, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--scenario") {
      args.scenarioId = argv[i + 1];
      i += 1;
    } else if (arg === "--report-dir") {
      args.reportDir = argv[i + 1];
      i += 1;
    } else if (arg === "--list") {
      args.list = true;
    }
  }
  return args;
}

function compareHashes(first, second) {
  if (first.length !== second.length) return false;
  for (let i = 0; i < first.length; i += 1) {
    if (first[i].hash !== second[i].hash) return false;
  }
  return true;
}

const args = parseArgs(process.argv.slice(2));
if (args.list) {
  console.log(listScenarioIds().join("\n"));
  process.exit(0);
}

const first = await runScenario({
  scenarioId: args.scenarioId,
  mode: "replay",
  reportDir: args.reportDir
});
const second = await runScenario({
  scenarioId: args.scenarioId,
  mode: "replay"
});

if (!first.ok || !second.ok) {
  console.error("replay harness assertions failed");
  process.exit(1);
}

const hashesOk = compareHashes(first.report.stateHashes, second.report.stateHashes);
if (!hashesOk) {
  console.error("replay hash mismatch between runs");
  process.exit(1);
}

console.log(`replay harness passed for ${args.scenarioId}`);
