import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(".");
const artifactsRoot = path.join(repoRoot, "artifacts", "auto-debug");

const result = spawnSync("node tools/auto-debug/run.mjs --mode=analyze --probe=off", {
  cwd: repoRoot,
  shell: true,
  encoding: "utf8"
});

assert.equal(result.status, 0, "auto-debug analyze run should succeed");

const runs = fs.existsSync(artifactsRoot)
  ? fs.readdirSync(artifactsRoot).map((name) => ({
      name,
      path: path.join(artifactsRoot, name),
      mtime: fs.statSync(path.join(artifactsRoot, name)).mtimeMs
    }))
  : [];

assert.ok(runs.length > 0, "auto-debug should produce artifact directory");
const latest = runs.sort((a, b) => b.mtime - a.mtime)[0];
const reportPath = path.join(latest.path, "report.json");
assert.ok(fs.existsSync(reportPath), "auto-debug report should exist");

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
assert.equal(report.mode, "analyze", "report should reflect analyze mode");
assert.ok(Array.isArray(report.targets), "report should include targets array");

console.log("auto-debug smoke test passed");
