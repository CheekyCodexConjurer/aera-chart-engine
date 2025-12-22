import type { ComputeRequest, ComputeResult } from "../../api/public-types.js";
import { ComputePipeline } from "../../compute/pipeline.js";
import type { EngineContext } from "./context.js";
import { setOverlays } from "./overlays.js";

export function setComputePipeline(ctx: EngineContext, pipeline: ComputePipeline | null): ComputePipeline {
  if (pipeline) {
    ctx.computePipeline = pipeline;
    return pipeline;
  }
  const created = new ComputePipeline({
    applyOverlays: (batch) => setOverlays(ctx, batch),
    emitDiagnostic: (diag) => {
      ctx.diagnostics.add(diag);
      ctx.diagnosticsEmitter.emit();
    }
  });
  ctx.computePipeline = created;
  return created;
}

export function postComputeRequest(ctx: EngineContext, request: ComputeRequest): void {
  ctx.computePipeline.postRequest(request);
}

export function cancelComputeIndicator(ctx: EngineContext, indicatorId: string, version?: number): void {
  ctx.computePipeline.cancelIndicator(indicatorId, version);
}

export function cancelComputeWindow(ctx: EngineContext, windowId: string): void {
  ctx.computePipeline.cancelWindow(windowId);
}

export function applyComputeResult(ctx: EngineContext, result: ComputeResult): boolean {
  return ctx.computePipeline.applyResult(result);
}

export function getComputeStatus(ctx: EngineContext): { pendingIndicators: number; pendingSeries: number } {
  return ctx.computePipeline.getStatus();
}
