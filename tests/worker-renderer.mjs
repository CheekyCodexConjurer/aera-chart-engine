import assert from "node:assert/strict";
import { ChartEngine } from "../dist/index.js";

function createAdapter(supportsOffscreenCanvas) {
  const messages = [];
  const listeners = new Set();

  return {
    adapter: {
      supportsOffscreenCanvas,
      post(message) {
        messages.push(message);
      },
      onMessage(handler) {
        listeners.add(handler);
        return () => listeners.delete(handler);
      },
      terminate() {}
    },
    messages,
    emit(message) {
      for (const handler of listeners) {
        handler(message);
      }
    }
  };
}

const offscreenAdapter = createAdapter(true);
const engine = new ChartEngine({ width: 400, height: 240 });
const status = engine.setWorkerAdapter(offscreenAdapter.adapter, { mode: "offscreen" });

assert.equal(status.mode, "offscreen", "worker status should be offscreen when supported");
assert.ok(
  offscreenAdapter.messages.some((msg) => msg.type === "render_command" && msg.command.type === "initialize"),
  "offscreen adapter should receive initialize command"
);
assert.ok(
  offscreenAdapter.messages.some((msg) => msg.type === "render_command" && msg.command.type === "resize"),
  "offscreen adapter should receive resize command"
);

engine.setVisibleRange({ startMs: 0, endMs: 100 }, "price");
engine.flush();
assert.ok(
  offscreenAdapter.messages.some((msg) => msg.type === "render_command" && msg.command.type === "render"),
  "render command should be posted after flush"
);

const workerOnlyAdapter = createAdapter(false);
const engine2 = new ChartEngine({ width: 320, height: 200 });
const status2 = engine2.setWorkerAdapter(workerOnlyAdapter.adapter, { mode: "offscreen" });

assert.equal(status2.mode, "worker", "offscreen should fall back to worker when unsupported");
assert.ok(
  engine2.getDiagnostics().some((diag) => diag.code === "worker.offscreen.unavailable"),
  "fallback should emit diagnostic"
);

console.log("worker renderer tests passed");
