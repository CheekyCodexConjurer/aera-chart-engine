import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(__dirname, "reports", "baseline-1m.json");

if (!fs.existsSync(reportPath)) {
  console.error(`Missing baseline report: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const p50 = report?.metrics?.frameTimeMs?.p50 ?? Infinity;
const p95 = report?.metrics?.frameTimeMs?.p95 ?? Infinity;
const p50Target = report?.assertions?.p50TargetMs ?? 8;
const p95Target = report?.assertions?.p95TargetMs ?? 16;

const p50Pass = p50 <= p50Target;
const p95Pass = p95 <= p95Target;

if (!p50Pass || !p95Pass) {
  console.error(`Baseline regression: p50=${p50} (target ${p50Target}), p95=${p95} (target ${p95Target})`);
  process.exit(1);
}

console.log("Baseline benchmark gate passed");
