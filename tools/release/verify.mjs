import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const engineVersion = pkg.version;

const versionSource = fs.readFileSync(path.join(repoRoot, "src", "core", "version.ts"), "utf8");
const engineMatch = versionSource.match(/ENGINE_VERSION\s*=\s*"([^"]+)"/);
const contractMatch = versionSource.match(/ENGINE_CONTRACT_VERSION\s*=\s*"([^"]+)"/);
assert.ok(engineMatch, "ENGINE_VERSION not found in src/core/version.ts");
assert.ok(contractMatch, "ENGINE_CONTRACT_VERSION not found in src/core/version.ts");
assert.equal(engineMatch[1], engineVersion, "ENGINE_VERSION matches package.json version");
const contractVersion = contractMatch[1];

const changelogPath = path.join(repoRoot, "CHANGELOG.md");
assert.ok(fs.existsSync(changelogPath), "CHANGELOG.md must exist");
const changelog = fs.readFileSync(changelogPath, "utf8");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const headerRegex = new RegExp(`^##\\s+${escapeRegExp(engineVersion)}\\s*$`, "m");
assert.ok(headerRegex.test(changelog), `CHANGELOG.md must include a section for ${engineVersion}`);

const headerMatch = changelog.match(headerRegex);
assert.ok(headerMatch, `CHANGELOG.md section for ${engineVersion} not found`);
const headerIndex = changelog.search(headerRegex);
const afterHeader = changelog.slice(headerIndex + headerMatch[0].length);
const nextHeaderMatch = afterHeader.match(/^##\\s+/m);
const sectionBody = nextHeaderMatch ? afterHeader.slice(0, nextHeaderMatch.index) : afterHeader;
assert.ok(
  sectionBody.includes(`Contract: ${contractVersion}`),
  `CHANGELOG.md section for ${engineVersion} must include Contract: ${contractVersion}`
);

const matrixPath = path.join(repoRoot, "docs", "compatibility-matrix.md");
assert.ok(fs.existsSync(matrixPath), "docs/compatibility-matrix.md must exist");
const matrix = fs.readFileSync(matrixPath, "utf8");
const rowRegex = new RegExp(
  `\\|[^\\n]*\\|\\s*${escapeRegExp(engineVersion)}\\s*\\|\\s*${escapeRegExp(contractVersion)}\\s*\\|`,
  "m"
);
assert.ok(
  rowRegex.test(matrix),
  `compatibility matrix must include engine version ${engineVersion} and contract ${contractVersion}`
);

console.log("release checks passed");
