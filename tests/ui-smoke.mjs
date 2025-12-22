import assert from "node:assert/strict";
import { runScenario } from "../tools/harness/headless/runner.mjs";

const { ok } = await runScenario({ scenarioId: "baseline-10k", mode: "smoke" });
assert.ok(ok, "harness smoke should pass");

console.log("ui smoke test passed");
