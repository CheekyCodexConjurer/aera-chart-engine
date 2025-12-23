import type { WorkerAdapter, WorkerMode, WorkerStatus } from "../../api/public-types.js";
import type { EngineContext } from "./context.js";
import { WorkerComputePipeline } from "../../compute/worker-pipeline.js";
import { WorkerRenderer } from "../../rendering/worker-renderer.js";
import { setComputePipeline } from "./compute.js";
import { setOverlays } from "./overlays.js";
import type { WorkerMessage } from "../../compute/worker-protocol.js";

export type WorkerAdapterOptions = {
  mode?: WorkerMode;
};

const DEFAULT_STATUS: WorkerStatus = { available: false, mode: "main", reason: "not-configured" };

export function setWorkerAdapter(
  ctx: EngineContext,
  adapter: WorkerAdapter | null,
  options: WorkerAdapterOptions = {}
): WorkerStatus {
  teardownWorker(ctx);

  if (!adapter) {
    ctx.workerAdapter = null;
    ctx.workerMode = "main";
    ctx.workerStatus = { ...DEFAULT_STATUS };
    if (!ctx.workerPipelineFallback) {
      ctx.computePipeline = setComputePipeline(ctx, null);
    } else {
      ctx.computePipeline = ctx.workerPipelineFallback;
      ctx.workerPipelineFallback = null;
    }
    return ctx.workerStatus;
  }

  const requestedMode = options.mode ?? "worker";
  let effectiveMode: WorkerMode = requestedMode;
  if (requestedMode === "offscreen" && !adapter.supportsOffscreenCanvas) {
    ctx.diagnostics.addWarn("worker.offscreen.unavailable", "offscreen canvas unavailable", {
      requestedMode
    });
    ctx.diagnosticsEmitter.emit();
    effectiveMode = "worker";
  }

  const typedAdapter = adapter as WorkerAdapter<WorkerMessage>;
  const pipeline = new WorkerComputePipeline(typedAdapter, {
    applyOverlays: (batch) => setOverlays(ctx, batch),
    emitDiagnostic: (diag) => {
      ctx.diagnostics.add(diag);
      ctx.diagnosticsEmitter.emit();
    },
    onStatus: (status) => {
      ctx.workerStatus = status;
      ctx.workerMode = status.mode;
    }
  });

  ctx.workerPipelineFallback = ctx.computePipeline;
  ctx.computePipeline = pipeline;
  ctx.workerAdapter = adapter;
  ctx.workerMode = effectiveMode;
  ctx.workerStatus = { available: true, mode: effectiveMode };

  if (effectiveMode === "offscreen") {
    ctx.workerRendererFallback = ctx.renderer;
    ctx.workerRenderer = new WorkerRenderer(typedAdapter);
    ctx.renderer = ctx.workerRenderer;
    ctx.renderer.initialize?.();
    ctx.renderer.resize?.(ctx.width, ctx.height, ctx.devicePixelRatio);
  }

  return ctx.workerStatus;
}

export function getWorkerStatus(ctx: EngineContext): WorkerStatus {
  return ctx.workerStatus ?? { ...DEFAULT_STATUS };
}

function teardownWorker(ctx: EngineContext): void {
  if (ctx.workerAdapter) {
    const pipeline = ctx.computePipeline;
    if (typeof pipeline.dispose === "function") {
      pipeline.dispose();
    }
  }

  if (ctx.workerPipelineFallback) {
    ctx.computePipeline = ctx.workerPipelineFallback;
    ctx.workerPipelineFallback = null;
  }

  if (ctx.workerRendererFallback) {
    ctx.renderer = ctx.workerRendererFallback;
    ctx.workerRendererFallback = null;
    ctx.workerRenderer = null;
    ctx.renderer.initialize?.();
    ctx.renderer.resize?.(ctx.width, ctx.height, ctx.devicePixelRatio);
  }

  ctx.workerAdapter = null;
}
