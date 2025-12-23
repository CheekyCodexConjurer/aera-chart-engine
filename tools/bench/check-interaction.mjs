import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(__dirname, "reports", "interaction-latency.json");

if (!fs.existsSync(reportPath)) {
  console.error(`Missing interaction report: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const panP95 = report?.metrics?.panLatencyMs?.p95 ?? Infinity;
const zoomP95 = report?.metrics?.zoomLatencyMs?.p95 ?? Infinity;
const replayP95 = report?.metrics?.replayScrubLatencyMs?.p95 ?? Infinity;
const panTarget = report?.assertions?.panP95TargetMs ?? 16.6;
const zoomTarget = report?.assertions?.zoomP95TargetMs ?? 16.6;
const replayTarget = report?.assertions?.replayP95TargetMs ?? 100;

const panPass = panP95 <= panTarget;
const zoomPass = zoomP95 <= zoomTarget;
const replayPass = replayP95 <= replayTarget;

if (!panPass || !zoomPass || !replayPass) {
  console.error(
    `Interaction regression: pan p95=${panP95} (target ${panTarget}), zoom p95=${zoomP95} (target ${zoomTarget}), replay p95=${replayP95} (target ${replayTarget})`
  );
  process.exit(1);
}

console.log("Interaction benchmark gate passed");
