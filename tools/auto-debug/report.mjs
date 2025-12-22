import fs from "node:fs";
import path from "node:path";
import { writeJson, writeText } from "./utils.mjs";

export function writeReport(artifactDir, report) {
  const reportPath = path.join(artifactDir, "report.json");
  writeJson(reportPath, report);
  writeText(path.join(artifactDir, "report.md"), renderMarkdown(report));
  return reportPath;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Auto Debug Report`);
  lines.push("");
  lines.push(`RunId: ${report.runId}`);
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push("");
  lines.push("## Command summary");
  for (const cmd of report.commands) {
    lines.push(`- ${cmd.id}: exit=${cmd.exitCode} durationMs=${cmd.durationMs}`);
  }
  if (report.failures.length > 0) {
    lines.push("");
    lines.push("## Failures");
    for (const failure of report.failures) {
      lines.push(`- ${failure.commandId}: ${failure.summary}`);
    }
  }
  lines.push("");
  lines.push("## Targets");
  for (const target of report.targets) {
    lines.push(`- ${target.name} (${target.file}:${target.startLine})`);
  }
  if (report.probeSummary) {
    lines.push("");
    lines.push("## Probe summary");
    lines.push(`- events=${report.probeSummary.totalEvents} dropped=${report.probeSummary.dropped} errors=${report.probeSummary.errors}`);
    for (const entry of report.probeSummary.top) {
      lines.push(`- ${entry.name}: count=${entry.count} avgMs=${entry.avgMs.toFixed(3)} maxMs=${entry.maxMs.toFixed(3)}`);
    }
  }
  lines.push("");
  lines.push("## Artifacts");
  for (const artifact of report.artifacts) {
    lines.push(`- ${artifact}`);
  }
  return lines.join("\n");
}
