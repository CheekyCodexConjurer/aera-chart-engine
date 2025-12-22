import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

const engine = new ChartEngine({ width: 600, height: 300 });

engine.defineSeries({ id: "line", type: "line", paneId: "price", scaleId: "price" });
const timeMs = [1000, 2000, 5000, 10000, 20000];
const value = [100, 101, 102, 101.5, 103];
engine.setSeriesData("line", { timeMs, value });
engine.setVisibleRange({ startMs: 1000, endMs: 20000 });

engine.setOverlays({
  batchId: "indicator",
  overlays: [
    {
      id: "line-overlay",
      type: "line",
      data: { points: [
        { timeMs: 5000, value: 101 },
        { timeMs: 15000, value: 104 }
      ] }
    }
  ]
});

engine.setReplayState({ mode: "paused", cutoffTimeMs: 6000 });
engine.flush();

let crosshairEvent = null;
engine.onCrosshairMove((event) => {
  crosshairEvent = event;
});
let hitEvent = null;
engine.onHitTest((event) => {
  hitEvent = event;
});

const xBeyond = engine.timeToX("price", 15000);
const y = engine.priceToY("price", "price", 101);
assert.ok(xBeyond !== null && y !== null, "coordinate conversion should succeed");
engine.handlePointerMove("price", xBeyond ?? 0, y ?? 0);
engine.flush();
await new Promise((resolve) => setTimeout(resolve, 0));

assert.ok(crosshairEvent, "crosshair should emit");
assert.ok(
  (crosshairEvent.nearestTimeMs ?? 0) <= 6000,
  "nearest time should respect replay cutoff"
);
assert.ok(hitEvent, "hit test should emit");
assert.ok(
  hitEvent.overlays.every((hit) => (hit.timeMs ?? 0) <= 6000),
  "overlay hits should respect replay cutoff"
);

crosshairEvent = null;
const xGap = engine.timeToX("price", 7500);
engine.handlePointerMove("price", xGap ?? 0, y ?? 0);
engine.flush();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(crosshairEvent, "crosshair should emit over gaps");
assert.ok(
  [5000, 10000].includes(crosshairEvent.nearestTimeMs ?? 0),
  "nearest time should snap to nearest bar"
);

crosshairEvent = null;
engine.beginPan("price", xGap ?? 0);
engine.handlePointerMove("price", (xGap ?? 0) + 10, y ?? 0);
engine.flush();
assert.equal(crosshairEvent, null, "crosshair should not emit during drag");
engine.endPan();

console.log("interaction hit-testing tests passed");
