import { listScenarioIds } from "../scenarios/registry.mjs";
import { writeScenarioDataset } from "./node-io.mjs";

function parseArgs(argv) {
  const args = { scenarioId: null, all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--scenario") {
      args.scenarioId = argv[i + 1];
      i += 1;
    } else if (arg === "--all") {
      args.all = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const scenarioIds = args.all ? listScenarioIds() : [args.scenarioId ?? "baseline-10k"];
for (const id of scenarioIds) {
  writeScenarioDataset(id);
  console.log(`dataset generated: ${id}`);
}
