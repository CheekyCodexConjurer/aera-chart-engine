import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pkgPath = path.join(repoRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

assert.ok(pkg.exports && pkg.exports["."], "package.json exports map must define '.'");
const rootExport = pkg.exports["."];
assert.equal(rootExport.types, "./dist/index.d.ts", "exports.types points to dist/index.d.ts");
assert.equal(rootExport.default, "./dist/index.js", "exports.default points to dist/index.js");

const extraExports = Object.keys(pkg.exports).filter((key) => key !== ".");
assert.deepEqual(extraExports, [], "exports map must not expose deep import paths");

assert.equal(pkg.main, "dist/index.js", "main points to dist/index.js");
assert.equal(pkg.types, "dist/index.d.ts", "types points to dist/index.d.ts");

const distIndex = path.join(repoRoot, "dist", "index.js");
const distTypes = path.join(repoRoot, "dist", "index.d.ts");
assert.ok(fs.existsSync(distIndex), "dist/index.js exists after build");
assert.ok(fs.existsSync(distTypes), "dist/index.d.ts exists after build");

const files = Array.isArray(pkg.files) ? pkg.files : [];
assert.ok(files.includes("dist"), "package.json files include dist");

console.log("public API surface tests passed");
