import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

class CaptureRenderer {
  frame = null;
  render(frame) {
    this.frame = frame;
  }
}

function buildLine(count, start = 0, step = 60_000, base = 100) {
  const timeMs = [];
  const value = [];
  let t = start;
  let v = base;
  for (let i = 0; i < count; i += 1) {
    t += step;
    v += Math.sin(i / 25) * 0.2;
    timeMs.push(t);
    value.push(v);
  }
  return { timeMs, value };
}

const renderer = new CaptureRenderer();
const engine = new ChartEngine({ width: 800, height: 300, renderer });

engine.defineSeries({ id: "line", type: "line", paneId: "price", scaleId: "price" });
const base = buildLine(5000, 0, 60_000, 100);
engine.setSeriesData("line", base);
engine.setVisibleRange({ startMs: base.timeMs[3000], endMs: base.timeMs[4999] });
engine.flush();

const seriesA = renderer.frame.panes[0].series[0];
const firstPass = Array.from(seriesA.timeMs);
engine.flush();
const seriesB = renderer.frame.panes[0].series[0];
assert.deepEqual(Array.from(seriesB.timeMs), firstPass, "LOD output should be deterministic");

const diagStart = engine.getDiagnostics().length;
engine.setViewportSize(800, 300);
engine.flush();
engine.setViewportSize(1200, 300);
engine.flush();
engine.setViewportSize(2000, 300);
engine.flush();
const lodChanges = engine.getDiagnostics()
  .slice(diagStart)
  .filter((diag) => diag.code === "lod.level.changed");
assert.ok(lodChanges.length >= 1, "LOD hysteresis should eventually switch levels");

let windowRequest = null;
engine.onDataWindowRequest((event) => {
  windowRequest = event;
});
engine.setVisibleRange({ startMs: base.timeMs[0] - 10_000_000, endMs: base.timeMs[100] });
engine.flush();
assert.ok(windowRequest, "data window request should emit for out-of-range view");

const small = buildLine(50, 0, 60_000, 80);
engine.setSeriesData("line", small);
engine.flush();
const windowDiag = engine.getDiagnostics().some((diag) => diag.code === "data.window.incomplete");
assert.ok(windowDiag, "incomplete data window should emit diagnostic");

const loadRenderer = new CaptureRenderer();
const loadEngine = new ChartEngine({ width: 900, height: 320, renderer: loadRenderer });
loadEngine.defineSeries({ id: "line", type: "line", paneId: "price", scaleId: "price" });
const large = buildLine(50_000, 0, 60_000, 120);
loadEngine.setSeriesData("line", large);
loadEngine.setVisibleRange({ startMs: large.timeMs[20_000], endMs: large.timeMs[20_500] });
loadEngine.flush();

const beforeRange = loadRenderer.frame.panes[0].visibleRange;
const append = buildLine(200, large.timeMs[large.timeMs.length - 1], 60_000, 130);
loadEngine.setSeriesData("line", append, "append");
loadEngine.flush();
assert.deepEqual(loadRenderer.frame.panes[0].visibleRange, beforeRange, "append preserves view");

const prepend = buildLine(200, -12_000_000, 60_000, 110);
loadEngine.setSeriesData("line", prepend, "prepend");
loadEngine.flush();
assert.deepEqual(loadRenderer.frame.panes[0].visibleRange, beforeRange, "prepend preserves view");

const patchData = {
  timeMs: [large.timeMs[20_100], large.timeMs[20_200]],
  value: [200, 210]
};
loadEngine.setSeriesData("line", patchData, "patch");
loadEngine.flush();
assert.deepEqual(loadRenderer.frame.panes[0].visibleRange, beforeRange, "patch preserves view");

console.log("data pipeline tests passed");
