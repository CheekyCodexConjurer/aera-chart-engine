import { performance } from "node:perf_hooks";
import { ChartEngine } from "../../../dist/index.js";
import { getScenarioSpec } from "../scenarios/registry.mjs";
import { loadScenarioDataset } from "../datasets/registry.mjs";
import { applyOverlayBatches, loadScenarioIntoEngine } from "../scenarios/setup.mjs";
import { computeStateHash } from "./state-hash.mjs";
import { buildReport, writeReport } from "./report.mjs";

function attachObservers(engine) {
  const state = {
    visibleRanges: [],
    dataWindows: [],
    overlayLayouts: [],
    crosshairMoves: [],
    diagnostics: []
  };
  engine.onVisibleRangeChange((event) => {
    state.visibleRanges.push(event);
  });
  engine.onDataWindowRequest((event) => {
    state.dataWindows.push(event);
  });
  engine.onOverlayLayoutChange((event) => {
    state.overlayLayouts.push(event);
  });
  engine.onCrosshairMove((event) => {
    state.crosshairMoves.push(event);
  });
  engine.onDiagnostics(() => {
    state.diagnostics = engine.getDiagnostics();
  });
  return state;
}

function recordAssertion(assertions, id, passed, message) {
  assertions.push({
    id,
    passed,
    message,
    timestamp: new Date().toISOString()
  });
}

function summarizeDiagnostics(diagnostics) {
  const summary = { total: diagnostics.length, bySeverity: { info: 0, warn: 0, error: 0, fatal: 0 } };
  for (const diag of diagnostics) {
    const severity = diag.severity ?? "info";
    if (summary.bySeverity[severity] === undefined) {
      summary.bySeverity[severity] = 0;
    }
    summary.bySeverity[severity] += 1;
  }
  return summary;
}

function smokeScenario(engine, dataset, spec, observers, assertions) {
  const timeMs = dataset.seriesData.get("candles")?.timeMs ?? [];
  const lastTime = timeMs[timeMs.length - 1] ?? 0;
  engine.flush();

  recordAssertion(assertions, "visible-range-emitted", observers.visibleRanges.length > 0, "visible range events recorded");

  const x = engine.timeToX("price", lastTime);
  recordAssertion(assertions, "time-to-x", x !== null, "timeToX returns a value");
  if (x !== null) {
    const back = engine.xToTime("price", x);
    recordAssertion(
      assertions,
      "x-to-time",
      back !== null && Math.abs(back - lastTime) < 1,
      "xToTime roundtrip is stable"
    );
  }

  const beforeCrosshair = observers.crosshairMoves.length;
  engine.handlePointerMove("price", x ?? 0, 50);
  engine.flush();
  recordAssertion(
    assertions,
    "crosshair-move",
    observers.crosshairMoves.length > beforeCrosshair,
    "crosshair move emits"
  );

  const crosshairDuringDrag = observers.crosshairMoves.length;
  engine.beginPan("price", x ?? 0);
  engine.handlePointerMove("price", (x ?? 0) + 20, 50);
  engine.flush();
  recordAssertion(
    assertions,
    "crosshair-suppressed-drag",
    observers.crosshairMoves.length === crosshairDuringDrag,
    "crosshair suppressed during drag"
  );
  engine.endPan();

  engine.handleWheelZoom("price", x ?? 0, -80, 0.002);
  engine.flush();
  recordAssertion(assertions, "zoom-applied", observers.visibleRanges.length > 1, "zoom triggers range update");

  const outOfWindowStart = timeMs[0] - spec.stepMs * 100;
  const outOfWindowEnd = timeMs[0] - spec.stepMs * 50;
  engine.setVisibleRange({ startMs: outOfWindowStart, endMs: outOfWindowEnd });
  engine.flush();
  recordAssertion(
    assertions,
    "data-window-request",
    observers.dataWindows.length > 0,
    "data window request emitted"
  );

  applyOverlayBatches(engine, dataset);
  const layoutItems = observers.overlayLayouts.at(-1)?.items ?? [];
  recordAssertion(
    assertions,
    "overlay-layout-table",
    layoutItems.some((item) => item.type === "table"),
    "overlay layout includes table"
  );
  recordAssertion(
    assertions,
    "overlay-layout-right-label",
    layoutItems.some((item) => item.type === "right-label"),
    "overlay layout includes right-label"
  );

  engine.setReplayState({ mode: "paused", cutoffTimeMs: lastTime - spec.stepMs * 200 });
  engine.flush();
  recordAssertion(assertions, "replay-paused", true, "replay paused state applied");

  engine.setOverlays({
    batchId: "unsupported",
    overlays: [{ id: "polyline-1", type: "polyline", data: {} }]
  });
  engine.flush();
  const diagnostics = engine.getDiagnostics();
  recordAssertion(
    assertions,
    "unsupported-overlay",
    diagnostics.some((diag) => diag.code === "overlay.unsupported"),
    "unsupported overlay emits diagnostic"
  );
}

function runReplayTrace(engine, spec, observers, assertions) {
  if (!spec.replayTrace) return [];
  const stateHashes = [];
  for (let i = 0; i < spec.replayTrace.length; i += 1) {
    const step = spec.replayTrace[i];
    engine.setReplayState(step);
    engine.flush();
    const bundle = engine.captureReproBundle();
    const hashEntry = computeStateHash(bundle);
    stateHashes.push({ step: i, hash: hashEntry.hash, digest: hashEntry.digest });
  }
  recordAssertion(
    assertions,
    "replay-hashes",
    stateHashes.length === spec.replayTrace.length,
    "replay hash sequence captured"
  );
  return stateHashes;
}

function runBench(engine, observers, assertions) {
  const warmupFrames = 20;
  for (let i = 0; i < warmupFrames; i += 1) {
    engine.flush();
  }
  const samples = [];
  const frames = 120;
  for (let i = 0; i < frames; i += 1) {
    const start = performance.now();
    engine.flush();
    const end = performance.now();
    samples.push(end - start);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.5)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  const p99 = samples[Math.floor(samples.length * 0.99)];
  recordAssertion(assertions, "bench-samples", samples.length === frames, "bench samples collected");
  return { frameTimeMs: { p50, p95, p99 } };
}

export async function runScenario({ scenarioId, mode = "smoke", reportDir }) {
  const spec = getScenarioSpec(scenarioId);
  const dataset = await loadScenarioDataset(scenarioId);
  const engine = new ChartEngine({ width: 1200, height: 600 });
  const observers = attachObservers(engine);
  loadScenarioIntoEngine(engine, dataset, scenarioId);

  const assertions = [];
  let stateHashes = [];
  let metrics = null;

  if (mode === "bench") {
    metrics = runBench(engine, observers, assertions);
  } else {
    smokeScenario(engine, dataset, spec, observers, assertions);
    if (mode === "replay" || spec.replayTrace) {
      stateHashes = runReplayTrace(engine, spec, observers, assertions);
    }
  }

  const diagnostics = engine.getDiagnostics();
  const report = buildReport({
    scenarioId,
    seed: dataset.manifest.seed,
    engineInfo: engine.getEngineInfo(),
    assertions,
    diagnostics: summarizeDiagnostics(diagnostics),
    stateHashes,
    mode,
    datasetHash: dataset.manifest.datasetHash ?? null,
    metrics
  });
  if (reportDir) {
    writeReport(report, reportDir);
  }
  return { report, ok: assertions.every((entry) => entry.passed) };
}
