import { performance } from "node:perf_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChartEngine } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

const COUNT = 1_000_000;
const VISIBLE = 2_000;
const WIDTH = 1200;
const HEIGHT = 600;

const timeMs = new Float64Array(COUNT);
const open = new Float64Array(COUNT);
const high = new Float64Array(COUNT);
const low = new Float64Array(COUNT);
const close = new Float64Array(COUNT);

let t = 0;
let value = 100;
for (let i = 0; i < COUNT; i += 1) {
  t += 60_000;
  value += (Math.sin(i / 1000) + Math.cos(i / 700)) * 0.01;
  timeMs[i] = t;
  open[i] = value;
  high[i] = value + 1.5;
  low[i] = value - 1.2;
  close[i] = value + 0.4;
}

const engine = new ChartEngine({ width: WIDTH, height: HEIGHT });
engine.defineSeries({ id: "candles", type: "candles", paneId: "price", scaleId: "price" });
engine.setSeriesData("candles", { timeMs, open, high, low, close });

const endIndex = COUNT - 1;
const startIndex = Math.max(0, endIndex - VISIBLE + 1);
engine.setVisibleRange({ startMs: timeMs[startIndex], endMs: timeMs[endIndex] });
engine.flush();

const warmupFrames = 20;
for (let i = 0; i < warmupFrames; i += 1) {
  engine.flush();
}

const memBefore = process.memoryUsage().heapUsed;
const samples = [];
const frames = 120;
for (let i = 0; i < frames; i += 1) {
  const start = performance.now();
  engine.flush();
  const end = performance.now();
  samples.push(end - start);
}
const memAfter = process.memoryUsage().heapUsed;

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

const p50 = percentile(samples, 50);
const p95 = percentile(samples, 95);
const p99 = percentile(samples, 99);

const report = {
  runId: new Date().toISOString().replace(/[:.]/g, "-"),
  scenarioId: "baseline-1m",
  seed: 0,
  engineVersion: pkg.version,
  engineContractVersion: pkg.version,
  runnerVersion: "bench-0.1",
  hardwareProfile: {
    cpu: os.cpus()[0]?.model ?? "unknown",
    gpu: "unknown",
    browser: "node",
    os: `${os.platform()} ${os.release()}`
  },
  datasetSpec: {
    barCount: COUNT,
    visibleTarget: VISIBLE,
    overlayCounts: { markers: 0, labels: 0, zones: 0 },
    timeDomain: "utc-ms"
  },
  metrics: {
    frameTimeMs: { p50, p95, p99 },
    inputLatencyMs: { p50, p95 },
    memoryDeltaMB: { cpu: (memAfter - memBefore) / (1024 * 1024), gpu: 0 },
    drawCalls: 0,
    stateChanges: 0
  },
  assertions: {
    p50TargetMs: 8,
    p95TargetMs: 16,
    p50Pass: p50 <= 8,
    p95Pass: p95 <= 16
  },
  artifacts: { traceIds: [] },
  timestamp: new Date().toISOString(),
  renderer: "null",
  notes: "Headless Node run using NullRenderer; input latency is proxied by frame time."
};

const reportDir = path.join(__dirname, "reports");
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, "baseline-1m.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`baseline-1m report: ${reportPath}`);
console.log(`p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms p99=${p99.toFixed(2)}ms`);
console.log(`p50 pass=${report.assertions.p50Pass} p95 pass=${report.assertions.p95Pass}`);
