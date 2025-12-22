import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

class CaptureRenderer {
  frame = null;
  render(frame) {
    this.frame = frame;
  }
}

const renderer = new CaptureRenderer();
const engine = new ChartEngine({ width: 600, height: 300, renderer });
engine.defineSeries({ id: "line", type: "line", paneId: "price", scaleId: "price" });
engine.setSeriesData("line", {
  timeMs: [1000, 2000, 3000],
  value: [10, 11, 12]
});

const points = [];
for (let i = 0; i < 200_005; i += 1) {
  points.push({ timeMs: 1000 + i * 60_000, value: 100 + (i % 10) });
}

engine.setOverlays({
  batchId: "indicator-caps",
  overlays: [
    {
      id: "line-cap",
      type: "line",
      data: { points }
    }
  ]
});
engine.flush();

const diagnostics = engine.getDiagnostics();
assert.ok(
  diagnostics.some((diag) => diag.code === "overlay.points.capped"),
  "overlay caps should emit diagnostic"
);

const overlayFrame = renderer.frame.overlays[0];
const clipped = overlayFrame.clippedData;
assert.ok(clipped && Array.isArray(clipped.points), "overlay points should be present");
assert.equal(clipped.points.length, 200_000, "overlay points should be capped to limit");

console.log("overlay caps tests passed");
