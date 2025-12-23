import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

const engine = new ChartEngine({ width: 600, height: 300 });
engine.defineSeries({ id: "line", type: "line", paneId: "price", scaleId: "price" });
const timeMs = [1000, 2000, 3000, 4000, 5000];
engine.setSeriesData("line", { timeMs, value: [100, 101, 102, 103, 104] });
engine.setVisibleRange({ startMs: 1000, endMs: 5000 });
engine.flush();

const ranges = [];
engine.onVisibleRangeChange((event) => {
  ranges.push(event.range);
});

const x = engine.timeToX("price", 3000);
assert.ok(x !== null, "timeToX should work before pinch");
engine.handlePinchZoom("price", x ?? 0, 1.2);
engine.flush();

const before = { startMs: 1000, endMs: 5000 };
const after = ranges[ranges.length - 1];
assert.ok(after, "pinch zoom should emit visible range");
const beforeSpan = before.endMs - before.startMs;
const afterSpan = after.endMs - after.startMs;
assert.ok(afterSpan < beforeSpan, "pinch zoom should reduce span");

console.log("interaction input tests passed");
