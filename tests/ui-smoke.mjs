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
engine.flush();
assert.ok(crosshairEvent, "crosshair move should emit");
assert.equal(crosshairEvent.nearestTimeMs, 10000);

let overlayLayout = null;
engine.onOverlayLayoutChange((event) => {
  overlayLayout = event;
});

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
      data: {
        position: "top-right",
        anchorTimeMs: 4000,
        rows: [{ cells: [{ text: "Status" }, { text: "OK" }] }]
      }
    },
    {
      id: "right-label-1",
      type: "right-label",
      data: { labels: [{ price: 12, text: "R1", timeMs: 4000 }] }
    }
  ]
});
engine.flush();

assert.ok(overlayLayout, "overlay layout event should fire");
assert.ok(
  overlayLayout.items.some((item) => item.type === "table"),
  "overlay layout should include table"
);
assert.ok(
  overlayLayout.items.some((item) => item.type === "right-label"),
  "overlay layout should include right-label"
);

engine.setOverlays({
  batchId: "indicator-unsupported",
  overlays: [
    {
      id: "polyline-1",
      type: "polyline",
      data: {}
    }
  ]
});
engine.flush();

const diagnostics = engine.getDiagnostics();
assert.ok(diagnostics.some((diag) => diag.code === "overlay.unsupported"), "unsupported overlay should warn");

console.log("ui smoke test passed");
