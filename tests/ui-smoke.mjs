import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

const engine = new ChartEngine({ width: 800, height: 400 });

let visibleRange = null;
let dataWindow = null;
engine.onVisibleRangeChange((event) => {
  visibleRange = event.range;
});
engine.onDataWindowRequest((event) => {
  dataWindow = event.range;
});

engine.defineSeries({ id: "candles", type: "candles", paneId: "price", scaleId: "price" });

const timeMs = [
  1000, 2000, 3000, 4000, 5000,
  6000, 7000, 8000, 9000, 10000
];
const base = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
engine.setSeriesData("candles", {
  timeMs,
  open: base,
  high: base.map((v) => v + 1),
  low: base.map((v) => v - 1),
  close: base.map((v) => v + 0.5)
});

engine.resetToLatest();
engine.flush();

assert.ok(visibleRange, "visible range event should fire");
assert.ok(dataWindow, "data window request should fire");
assert.equal(visibleRange.startMs, 1000);
assert.equal(visibleRange.endMs, 10000);

const x = engine.timeToX("price", 10000);
assert.ok(x !== null, "timeToX should return a value");
const back = engine.xToTime("price", x ?? 0);
assert.ok(back !== null, "xToTime should return a value");
assert.ok(Math.abs((back ?? 0) - 10000) < 1, "conversion roundtrip is stable");

let crosshairEvent = null;
engine.onCrosshairMove((event) => {
  crosshairEvent = event;
});
engine.handlePointerMove("price", x ?? 0, 50);
assert.ok(crosshairEvent, "crosshair move should emit");
assert.equal(crosshairEvent.nearestTimeMs, 10000);

engine.setReplayState({ mode: "paused", cutoffTimeMs: 5000 });
engine.setOverlays({
  batchId: "indicator-1",
  overlays: [
    {
      id: "line-1",
      type: "line",
      data: { points: [
        { timeMs: 1000, value: 10 },
        { timeMs: 6000, value: 12 }
      ] }
    },
    {
      id: "table-1",
      type: "table",
      data: { rows: [] }
    }
  ]
});
engine.flush();

const diagnostics = engine.getDiagnostics();
assert.ok(diagnostics.some((diag) => diag.code === "overlay.unsupported"), "unsupported overlay should warn");

console.log("ui smoke test passed");
