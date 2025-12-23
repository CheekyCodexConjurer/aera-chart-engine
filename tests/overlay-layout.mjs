import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

const engine = new ChartEngine({ width: 640, height: 360 });
engine.defineSeries({ id: "line", type: "line", paneId: "price", scaleId: "price" });
engine.setSeriesData("line", {
  timeMs: [1000, 2000, 3000],
  value: [100, 101, 102]
});
engine.setVisibleRange({ startMs: 1000, endMs: 3000 });

let layoutEvent = null;
engine.onOverlayLayoutChange((event) => {
  layoutEvent = event;
});

engine.setOverlays({
  batchId: "layout",
  overlays: [
    {
      id: "table-1",
      type: "table",
      data: { position: "top-right", rows: [{ cells: [{ text: "A" }, { text: "B" }] }] }
    },
    {
      id: "right-1",
      type: "right-label",
      data: { labels: [{ price: 101, text: "R1" }] }
    }
  ]
});

engine.flush();

assert.ok(layoutEvent, "overlay layout event should emit");
assert.ok(layoutEvent.frameId >= 1, "overlay layout event includes frame id");
const items = layoutEvent.items;
assert.ok(items.some((item) => item.type === "table"), "table layout item emitted");
assert.ok(items.some((item) => item.type === "right-label"), "right-label layout item emitted");

const tableItem = items.find((item) => item.type === "table");
assert.ok(tableItem && tableItem.plotArea.width > 0, "table layout includes plot area");
const rightItem = items.find((item) => item.type === "right-label");
assert.ok(rightItem && rightItem.rightGutterWidth > 0, "right-label layout includes gutter width");

console.log("overlay layout tests passed");
