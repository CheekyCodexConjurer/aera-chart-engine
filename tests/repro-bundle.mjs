import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

const engine = new ChartEngine({ width: 700, height: 360 });
engine.defineSeries({ id: "line", type: "line", paneId: "price", scaleId: "price" });

const timeMs = [];
const value = [];
let t = 0;
for (let i = 0; i < 100; i += 1) {
  t += 60_000;
  timeMs.push(t);
  value.push(100 + Math.sin(i / 10));
}

engine.setSeriesData("line", { timeMs, value });
engine.setVisibleRange({ startMs: timeMs[20], endMs: timeMs[80] });
engine.setReplayState({ mode: "paused", cutoffTimeMs: timeMs[70], paddingBars: 2 });
engine.setOverlays({
  batchId: "repro-overlay",
  overlays: [
    {
      id: "label-1",
      type: "label",
      data: { points: [{ timeMs: timeMs[30], value: 101, text: "A" }] }
    }
  ]
});
engine.flush();

const bundle = engine.captureReproBundle();
assert.equal(bundle.bundleFormatVersion.length > 0, true, "bundle format version should be set");

const replay = ChartEngine.fromReproBundle(bundle);
replay.flush();
const bundle2 = replay.captureReproBundle();

assert.deepEqual(bundle2.view.panes[0].visibleRange, bundle.view.panes[0].visibleRange);
assert.equal(bundle2.inputs.series.length, bundle.inputs.series.length);
assert.equal(bundle2.inputs.overlays.length, bundle.inputs.overlays.length);

console.log("repro bundle tests passed");
