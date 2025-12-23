import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";
import { normalizePineOutputs } from "../tools/pinescript/adapter/index.mjs";
import { runCoverageChecks } from "../tools/pinescript/coverage-runner.mjs";

const outputs = {
  series: [
    {
      id: "plot-line",
      kind: "plot",
      style: "line",
      data: { timeMs: [1, 2, 3], value: [10, 11, 12] }
    },
    {
      id: "plot-area",
      kind: "plot",
      style: "area",
      data: { timeMs: [1, 2, 3], value: [4, 5, 6] }
    },
    {
      id: "plot-hist",
      kind: "plot",
      style: "histogram",
      data: { timeMs: [1, 2, 3], value: [7, 6, 5] }
    },
    {
      id: "plot-candle",
      kind: "plotcandle",
      data: {
        timeMs: [1, 2, 3],
        open: [10, 11, 12],
        high: [12, 13, 14],
        low: [9, 10, 11],
        close: [11, 12, 13]
      }
    }
  ],
  overlays: [
    { id: "shape", kind: "plotshape", data: { points: [{ timeMs: 2, value: 11 }] } },
    { id: "char", kind: "plotchar", data: { points: [{ timeMs: 2, value: 11, text: "A" }] } },
    { id: "hline", kind: "hline", data: { value: 10 } },
    { id: "line", kind: "line", data: { points: [{ timeMs: 1, value: 10 }, { timeMs: 3, value: 12 }] } },
    { id: "box", kind: "box", data: { startTimeMs: 1, endTimeMs: 3, top: 12, bottom: 9 } },
    { id: "label", kind: "label", data: { point: { timeMs: 2, value: 10.5, text: "L" } } },
    { id: "poly", kind: "polyline", data: { points: [{ timeMs: 1, value: 9 }, { timeMs: 3, value: 11 }] } },
    { id: "fill", kind: "fill", data: { points: [{ timeMs: 1, top: 12, bottom: 9 }] } },
    {
      id: "table",
      kind: "table",
      data: { position: "top-right", rows: [{ cells: [{ text: "A" }, { text: "B" }] }] }
    },
    {
      id: "right-label",
      kind: "right-label",
      data: { labels: [{ price: 10.2, text: "R" }] }
    }
  ]
};

const adapter = normalizePineOutputs(outputs, { batchId: "pinescript-demo" });
assert.equal(adapter.seriesDefinitions.length, 4, "series definitions mapped");
assert.equal(adapter.overlayBatches.length, 1, "overlay batch mapped");

const limited = normalizePineOutputs(
  { series: [], overlays: [{ id: "limit", kind: "plotshape", data: { points: [{ timeMs: 1, value: 1 }, { timeMs: 2, value: 2 }] } }] },
  { limits: { markerPointsMax: 1 } }
);
assert.ok(limited.diagnostics.some((diag) => diag.code === "pinescript.limit.exceeded"), "limit diagnostic emitted");

const engine = new ChartEngine({ width: 800, height: 400 });
for (const definition of adapter.seriesDefinitions) {
  engine.defineSeries(definition);
  const data = adapter.seriesData.get(definition.id);
  engine.setSeriesData(definition.id, data, "replace");
}
engine.setVisibleRange({ startMs: 1, endMs: 3 });
for (const batch of adapter.overlayBatches) {
  engine.setOverlays(batch);
}
engine.flush();

const engineDiagnostics = engine.getDiagnostics();
assert.ok(!engineDiagnostics.some((diag) => diag.code === "overlay.unsupported"), "no unsupported overlays");

const coverage = runCoverageChecks();
assert.ok(coverage.ok, coverage.errors.join("\n"));

console.log("pinescript parity tests passed");
