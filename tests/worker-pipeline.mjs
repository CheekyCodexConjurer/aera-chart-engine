import assert from "node:assert/strict";
import { WorkerComputePipeline } from "../dist/compute/worker-pipeline.js";

function createAdapter() {
  const messages = [];
  const listeners = new Set();
  let terminated = false;

  return {
    adapter: {
      supportsOffscreenCanvas: true,
      post(message) {
        messages.push(message);
      },
      onMessage(handler) {
        listeners.add(handler);
        return () => listeners.delete(handler);
      },
      terminate() {
        terminated = true;
      }
    },
    emit(message) {
      for (const handler of listeners) {
        handler(message);
      }
    },
    get messages() {
      return messages;
    },
    get terminated() {
      return terminated;
    }
  };
}

const testAdapter = createAdapter();
const { adapter, emit, messages } = testAdapter;
const diagnostics = [];
const applied = [];

const pipeline = new WorkerComputePipeline(adapter, {
  maxPendingPerIndicator: 1,
  applyOverlays: (batch) => applied.push(batch),
  emitDiagnostic: (diag) => diagnostics.push(diag)
});

pipeline.postRequest({ indicatorId: "ind-1", windowId: "w1", version: 1, payload: null });
pipeline.postRequest({ indicatorId: "ind-1", windowId: "w1", version: 2, payload: null });

assert.ok(
  messages.some((msg) => msg.type === "compute_request"),
  "compute requests should be sent to worker"
);
assert.ok(
  messages.some((msg) => msg.type === "compute_cancel_request"),
  "queue drops should trigger cancel requests"
);

emit({
  type: "compute_result",
  result: {
    indicatorId: "ind-1",
    windowId: "w1",
    version: 2,
    batch: { batchId: "ind-1", overlays: [] }
  }
});

assert.equal(applied.length, 1, "accepted worker result should apply overlays");

pipeline.cancelIndicator("ind-1", 2);
assert.ok(
  messages.some((msg) => msg.type === "compute_cancel_indicator"),
  "indicator cancel should be sent to worker"
);

emit({ type: "unknown" });
assert.ok(
  diagnostics.some((diag) => diag.code === "worker.message.unknown"),
  "unknown worker message should emit diagnostic"
);

pipeline.dispose();
assert.equal(testAdapter.terminated, true, "pipeline dispose should terminate adapter");

console.log("worker compute pipeline tests passed");
