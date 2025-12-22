import { performance } from "node:perf_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChartEngine } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COUNT = 200_000;
const VISIBLE = 2_000;
const WIDTH = 1200;
const HEIGHT = 600;

const timeMs = new Float64Array(COUNT);
const value = new Float64Array(COUNT);
let t = 0;
let v = 100;
for (let i = 0; i < COUNT; i += 1) {
  t += 60_000;
  v += Math.sin(i / 500) * 0.05;
  timeMs[i] = t;
  value[i] = v;
}

const engine = new ChartEngine({ width: WIDTH, height: HEIGHT });
const info = engine.getEngineInfo();
engine.defineSeries({ id: "line", type: "line", paneId: "price", scaleId: "price" });
engine.setSeriesData("line", { timeMs, value });

const endIndex = COUNT - 1;
const startIndex = Math.max(0, endIndex - VISIBLE + 1);
engine.setVisibleRange({ startMs: timeMs[startIndex], endMs: timeMs[endIndex] });
engine.flush();

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

function sample(action, iterations = 80) {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    action(i);
    engine.flush();
    samples.push(performance.now() - start);
  }
  return { p50: percentile(samples, 50), p95: percentile(samples, 95) };
}

const midTime = timeMs[startIndex + Math.floor(VISIBLE / 2)];
const x = engine.timeToX("price", midTime) ?? WIDTH / 2;
const y = engine.priceToY("price", "price", value[startIndex + 10]) ?? HEIGHT / 2;

const crosshair = sample(() => {
  engine.handlePointerMove("price", x, y);
});

const pan = sample((i) => {
  const dx = (i % 5) * 2;
  engine.beginPan("price", x);
  engine.updatePan("price", x + dx);
  engine.endPan();
});

const zoom = sample((i) => {
  const delta = i % 2 === 0 ? -120 : 120;
  engine.handleWheelZoom("price", x, delta);
});

const replay = sample((i) => {
  const cutoff = timeMs[startIndex + i % VISIBLE];
  engine.setReplayState({ mode: "paused", cutoffTimeMs: cutoff, paddingBars: 2 });
});

const report = {
  runId: new Date().toISOString().replace(/[:.]/g, "-"),
  scenarioId: "interaction-latency",
  engineVersion: info.engineVersion,
  engineContractVersion: info.engineContractVersion,
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
    crosshairLatencyMs: crosshair,
    panLatencyMs: pan,
    zoomLatencyMs: zoom,
    replayScrubLatencyMs: replay
  },
  assertions: {
    panP95TargetMs: 16.6,
    zoomP95TargetMs: 16.6,
    replayP95TargetMs: 100,
    panPass: pan.p95 <= 16.6,
    zoomPass: zoom.p95 <= 16.6,
    replayPass: replay.p95 <= 100
  },
  timestamp: new Date().toISOString(),
  renderer: "null",
  notes: "Headless Node measurements; latency approximated by action+flush time."
};

const reportDir = path.join(__dirname, "reports");
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, "interaction-latency.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`interaction latency report: ${reportPath}`);
console.log(`crosshair p50=${crosshair.p50.toFixed(2)}ms p95=${crosshair.p95.toFixed(2)}ms`);
console.log(`pan p50=${pan.p50.toFixed(2)}ms p95=${pan.p95.toFixed(2)}ms`);
console.log(`zoom p50=${zoom.p50.toFixed(2)}ms p95=${zoom.p95.toFixed(2)}ms`);
console.log(`replay p50=${replay.p50.toFixed(2)}ms p95=${replay.p95.toFixed(2)}ms`);
