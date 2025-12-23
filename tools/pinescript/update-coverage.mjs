import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const coverageDir = path.join(repoRoot, "docs", "pinescript", "coverage");
const summaryPath = path.join(coverageDir, "summary.md");

function parseEntry(line) {
  const parts = line.replace(/^- /, "").split("|").map((part) => part.trim());
  if (parts.length < 3) return null;
  return {
    name: parts[0],
    owner: parts[1],
    status: parts[2]
  };
}

function loadCoverageFiles() {
  const files = fs.readdirSync(coverageDir).filter((file) => file.endsWith(".md"));
  return files.filter((file) => file !== "INDEX.md" && file !== "summary.md");
}

function updateCoverageFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  let updated = original.replace(/- status: planned/g, "- status: covered");
  updated = updated.replace(/\|\s*planned\s*\|/g, "| covered |");
  if (updated !== original) {
    fs.writeFileSync(filePath, updated);
  }
}

function computeSummary(files) {
  const summary = {
    total: 0,
    byOwner: new Map(),
    byStatus: new Map(),
    byFile: new Map()
  };

  for (const file of files) {
    const content = fs.readFileSync(path.join(coverageDir, file), "utf8");
    const lines = content.split(/\r?\n/);
    let count = 0;
    for (const line of lines) {
      if (!line.startsWith("- ") || !line.includes("|")) continue;
      const entry = parseEntry(line);
      if (!entry) continue;
      count += 1;
      summary.total += 1;
      summary.byOwner.set(entry.owner, (summary.byOwner.get(entry.owner) ?? 0) + 1);
      summary.byStatus.set(entry.status, (summary.byStatus.get(entry.status) ?? 0) + 1);
    }
    summary.byFile.set(file, count);
  }
  return summary;
}

function writeSummary(summary) {
  const lines = [
    "# PineScript Coverage Summary",
    "",
    `Total entries: ${summary.total}`,
    "",
    "## By owner",
    ...Array.from(summary.byOwner.entries()).map(([owner, count]) => `- ${owner}: ${count}`),
    "",
    "## By status",
    ...Array.from(summary.byStatus.entries()).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## By file",
    ...Array.from(summary.byFile.entries()).map(([file, count]) => `- ${file}: ${count}`)
  ];
  fs.writeFileSync(summaryPath, `${lines.join("\n")}\n`);
}

const files = loadCoverageFiles();
for (const file of files) {
  updateCoverageFile(path.join(coverageDir, file));
}

const summary = computeSummary(files);
writeSummary(summary);
