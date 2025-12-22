import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

class CaptureRenderer {
  render(frame) {
    this.frame = frame;
  }
}

const renderer = new CaptureRenderer();
const engine = new ChartEngine({ width: 800, height: 400, renderer });

engine.setPaneLayout([
  { paneId: "price", weight: 3 },
  { paneId: "volume", weight: 1 }
]);

engine.defineSeries({ id: "price", type: "line", paneId: "price", scaleId: "price" });
engine.defineSeries({ id: "vol", type: "line", paneId: "volume", scaleId: "vol" });

const timeMs = [];
const value = [];
const volume = [];
let t = 0;
for (let i = 0; i < 200; i += 1) {
  t += 60_000;
  timeMs.push(t);
  value.push(100 + Math.sin(i / 10) * 2);
  volume.push(1000 + i * 10);
}

engine.setSeriesData("price", { timeMs, value });
engine.setSeriesData("vol", { timeMs, value: volume });
engine.setVisibleRange({ startMs: timeMs[100], endMs: timeMs[199] });
engine.flush();

const x = engine.timeToX("price", timeMs[150]);
assert.ok(x !== null, "timeToX returns value");
const backTime = engine.xToTime("price", x ?? 0);
assert.ok(backTime !== null, "xToTime returns value");
assert.ok(Math.abs((backTime ?? 0) - timeMs[150]) < 1, "time conversion roundtrip");

engine.setScaleDomain("volume", "vol", { min: 900, max: 3000 });
engine.flush();
const y = engine.priceToY("volume", "vol", 1500);
assert.ok(y !== null, "priceToY returns value");
const backPrice = engine.yToPrice("volume", "vol", y ?? 0);
assert.ok(backPrice !== null, "yToPrice returns value");
assert.ok(Math.abs((backPrice ?? 0) - 1500) < 0.1, "price conversion roundtrip");

const plotArea = engine.getPlotArea("price");
assert.ok(plotArea.width > 0 && plotArea.height > 0, "plot area is valid");
const gutter = engine.getRightGutterWidth("price");
assert.ok(gutter > 0, "right gutter width is positive");

console.log("coordinate contract tests passed");
