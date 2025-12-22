import assert from "node:assert/strict";
import { ComputePipeline } from "../dist/index.js";

const diagnostics = [];
const applied = [];
const pipeline = new ComputePipeline({
  maxPendingPerIndicator: 2,
  applyOverlays: (batch) => applied.push(batch),
  emitDiagnostic: (diag) => diagnostics.push(diag)
});

pipeline.postRequest({ indicatorId: "ind-1", windowId: "w1", version: 1, payload: null });
pipeline.postRequest({ indicatorId: "ind-1", windowId: "w1", version: 2, payload: null });
pipeline.postRequest({ indicatorId: "ind-1", windowId: "w1", version: 3, payload: null });

assert.ok(
  diagnostics.some((diag) => diag.code === "compute.queue.overrun"),
  "queue overrun should emit diagnostic"
);

pipeline.cancelWindow("w1");
const canceled = pipeline.applyResult({
  indicatorId: "ind-1",
  windowId: "w1",
  version: 3,
  batch: { batchId: "ind-1", overlays: [] }
});
assert.equal(canceled, false, "canceled window should drop results");

const diagnostics2 = [];
const applied2 = [];
const pipeline2 = new ComputePipeline({
  applyOverlays: (batch) => applied2.push(batch),
  emitDiagnostic: (diag) => diagnostics2.push(diag)
});
pipeline2.postRequest({ indicatorId: "ind-2", windowId: "w2", version: 1, payload: null });
pipeline2.postRequest({ indicatorId: "ind-2", windowId: "w2", version: 2, payload: null });

const stale = pipeline2.applyResult({
  indicatorId: "ind-2",
  windowId: "w2",
  version: 1,
  batch: { batchId: "ind-2", overlays: [] }
});
assert.equal(stale, false, "stale result should be dropped");
assert.ok(
  diagnostics2.some((diag) => diag.code === "compute.result.stale"),
  "stale result should emit diagnostic"
);

const accepted = pipeline2.applyResult({
  indicatorId: "ind-2",
  windowId: "w2",
  version: 2,
  batch: { batchId: "ind-2", overlays: [] }
});
assert.equal(accepted, true, "latest result should be applied");
assert.equal(applied2.length, 1, "applied overlays should be forwarded");

console.log("compute pipeline tests passed");
