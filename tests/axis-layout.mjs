import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

class CaptureRenderer {
  frame = null;
  render(frame) {
    this.frame = frame;
  }
}

function buildLine(count, start = 0, step = 1, base = 100) {
  const timeMs = [];
  const value = [];
  let t = start;
  let v = base;
  for (let i = 0; i < count; i += 1) {
    t += step;
    v += Math.sin(i / 5) * 0.5;
    timeMs.push(t);
    value.push(v);
  }
  return { timeMs, value };
}

function createEngine(renderer) {
  return new ChartEngine({
    width: 280,
    height: 140,
    axisLabelHeight: 14,
    axisLabelPadding: 4,
    axisLabelMeasure: (text) => text.length * 8,
    renderer
  });
}

const renderer = new CaptureRenderer();
const engine = createEngine(renderer);

engine.defineSeries({ id: "line-1", type: "line", paneId: "price", scaleId: "price" });
engine.setSeriesData("line-1", buildLine(200, 0, 60000, 120));
engine.setScaleConfig("price", "price", { position: "right", tickCount: 8 });
engine.flush();

assert.ok(renderer.frame, "frame should render");
const pane = renderer.frame.panes[0];
const ticks = pane.axis.right[0]?.ticks ?? [];
const positions = ticks
  .map((tick) => engine.priceToY("price", "price", tick.value))
  .filter((y) => y !== null);
positions.sort((a, b) => a - b);
const minGap = 14 + 4;
for (let i = 1; i < positions.length; i += 1) {
  assert.ok(
    positions[i] - positions[i - 1] >= minGap - 0.5,
    "numeric ticks should not overlap"
  );
}

engine.setScaleConfig("price", "price", {
  position: "right",
  tickCount: 3,
  labelFormatter: (value) => Math.round(value).toString()
});
engine.setScaleDomain("price", "price", { min: 0, max: 9 });
engine.flush();
const gutterA = engine.getRightGutterWidth("price");

engine.setScaleDomain("price", "price", { min: 1, max: 9 });
engine.flush();
const gutterB = engine.getRightGutterWidth("price");
assert.ok(Math.abs(gutterA - gutterB) <= 2, "right gutter should remain stable");

engine.defineSeries({ id: "line-2", type: "line", paneId: "price", scaleId: "secondary" });
engine.setSeriesData("line-2", buildLine(200, 0, 60000, 70));
engine.setScaleConfig("price", "secondary", { position: "right", visible: true });
engine.setScaleConfig("price", "price", { position: "right", visible: true });
engine.flush();

const axisRight = renderer.frame.panes[0].axis.right;
const visible = axisRight.filter((scale) => scale.visible);
assert.equal(visible.length, 1, "only one visible scale per side");
const diagnostics = engine.getDiagnostics();
assert.ok(
  diagnostics.some((diag) => diag.code === "axis.scale.overlap"),
  "scale overlap diagnostic should be emitted"
);

console.log("axis layout tests passed");
