import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChartEngine } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const docPath = path.join(repoRoot, "docs", "roadmap", "contracts-and-compat.md");
const doc = fs.readFileSync(docPath, "utf8");
const match = doc.match(/Canonical engineContractVersion:\s*`?([0-9A-Za-z.+-]+)`?/);
assert.ok(match, "canonical engineContractVersion not found in docs/roadmap/contracts-and-compat.md");
const canonicalVersion = match[1];

const engine = new ChartEngine();
const info = engine.getEngineInfo();
assert.equal(info.engineContractVersion, canonicalVersion, "engineContractVersion matches canonical docs value");

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
assert.equal(info.engineVersion, pkg.version, "engineVersion matches package.json version");

console.log("contract version tests passed");
