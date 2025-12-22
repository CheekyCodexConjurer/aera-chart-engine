import path from "node:path";
import { fileURLToPath } from "node:url";
import { listScenarioIds } from "../scenarios/registry.mjs";
import { runScenario } from "./runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORT_DIR = path.resolve(__dirname, "..", "reports");

function parseArgs(argv) {
  const args = { scenarioId: "baseline-10k", mode: "smoke", reportDir: DEFAULT_REPORT_DIR, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--scenario") {
      args.scenarioId = argv[i + 1];
      i += 1;
    } else if (arg === "--mode") {
      args.mode = argv[i + 1];
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

const args = parseArgs(process.argv.slice(2));
if (args.list) {
  console.log(listScenarioIds().join("\n"));
  process.exit(0);
}

const { report, ok } = await runScenario({
  scenarioId: args.scenarioId,
  mode: args.mode,
  reportDir: args.reportDir
});

console.log(`harness ${args.mode} report: ${args.reportDir}`);
if (!ok) {
  console.error("harness assertions failed");
  process.exit(1);
}
console.log(`harness ${args.mode} passed for ${report.scenarioId}`);
