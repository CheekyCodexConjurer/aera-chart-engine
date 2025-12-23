import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const coverageDir = path.join(repoRoot, "docs", "pinescript", "coverage");

function parseEntry(line) {
  const parts = line.replace(/^- /, "").split("|").map((part) => part.trim());
  if (parts.length < 3) return null;
  return {
    name: parts[0],
    owner: parts[1],
    status: parts[2],
    notes: parts.slice(3).join(" | ")
  };
}

function loadCoverageFiles() {
  const files = fs.readdirSync(coverageDir).filter((file) => file.endsWith(".md"));
  return files.filter((file) => file !== "INDEX.md" && file !== "summary.md");
}

function supportsEntry(name) {
  const patterns = [
    /^box\./,
    /^label\./,
    /^line\./,
    /^linefill\./,
    /^hline\./,
    /^polyline\./,
    /^plot/,
    /^table\./,
    /^shape\./,
    /^text\./,
    /^color\./,
    /^display\./,
    /^extend\./,
    /^font\./,
    /^format\./,
    /^location\./,
    /^size\./,
    /^scale\./,
    /^xloc\./,
    /^yloc\./
  ];
  return patterns.some((pattern) => pattern.test(name));
}

export function runCoverageChecks() {
  const errors = [];
  for (const file of loadCoverageFiles()) {
    const content = fs.readFileSync(path.join(coverageDir, file), "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith("- ") || !line.includes("|")) continue;
      const entry = parseEntry(line);
      if (!entry) continue;
      if (!["covered", "exempt"].includes(entry.status)) {
        errors.push(`status ${entry.status} not allowed for ${entry.name} in ${file}`);
      }
      if (entry.owner.includes("engine") && !supportsEntry(entry.name)) {
        errors.push(`missing adapter mapping for ${entry.name} in ${file}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runCoverageChecks();
  if (!result.ok) {
    console.error("PineScript coverage checks failed:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  console.log("PineScript coverage checks passed");
}
