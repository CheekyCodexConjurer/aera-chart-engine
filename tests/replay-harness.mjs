import assert from "node:assert/strict";
import { runScenario } from "../tools/harness/headless/runner.mjs";

const scenarioId = "replay-scrub";

const first = await runScenario({ scenarioId, mode: "replay" });
const second = await runScenario({ scenarioId, mode: "replay" });

assert.ok(first.ok, "first replay run should pass");
assert.ok(second.ok, "second replay run should pass");
assert.equal(first.report.stateHashes.length, second.report.stateHashes.length, "hash sequences match length");

for (let i = 0; i < first.report.stateHashes.length; i += 1) {
  assert.equal(
    first.report.stateHashes[i].hash,
    second.report.stateHashes[i].hash,
    `hash mismatch at step ${i}`
  );
}

console.log("replay harness tests passed");
