import type { Diagnostic } from "../../api/public-types.js";
import type { GpuBuffer } from "../gpu-buffer.js";
import type { WebGL2RendererContext } from "./context.js";
import type { BufferRebuildContext } from "./state.js";

export function emitDiagnostic(ctx: WebGL2RendererContext, diag: Diagnostic): void {
  ctx.diagnosticHandler?.(diag);
}

export function resetFrameMetrics(ctx: WebGL2RendererContext): void {
  ctx.metrics.lastFrame = {
    drawCalls: 0,
    batchCount: 0,
    stateChanges: 0,
    bufferUploads: 0,
    bufferAllocations: 0,
    bufferBytes: 0,
    bufferReuses: 0
  };
}

export function recordDrawCalls(ctx: WebGL2RendererContext, count: number): void {
  if (count <= 0) return;
  ctx.metrics.lastFrame.drawCalls += count;
  ctx.metrics.totals.drawCalls += count;
}

export function recordBatchCount(ctx: WebGL2RendererContext, count: number): void {
  if (count <= 0) return;
  ctx.metrics.lastFrame.batchCount += count;
  ctx.metrics.totals.batchCount += count;
}

export function recordStateChange(ctx: WebGL2RendererContext, count = 1): void {
  if (count <= 0) return;
  ctx.metrics.lastFrame.stateChanges += count;
  ctx.metrics.totals.stateChanges += count;
}

export function recordBufferUpload(ctx: WebGL2RendererContext, uploader: GpuBuffer, before: number, after: number): void {
  ctx.metrics.lastFrame.bufferUploads += 1;
  ctx.metrics.totals.bufferUploads += 1;
  if (after > before) {
    const delta = after - before;
    ctx.metrics.lastFrame.bufferAllocations += 1;
    ctx.metrics.totals.bufferAllocations += 1;
    ctx.metrics.lastFrame.bufferBytes += delta;
    ctx.metrics.totals.bufferBytes += delta;
  } else {
    ctx.metrics.lastFrame.bufferReuses += 1;
    ctx.metrics.totals.bufferReuses += 1;
  }
}

export function recordTextAtlasEviction(ctx: WebGL2RendererContext, count = 1): void {
  if (count <= 0) return;
  ctx.metrics.textAtlas.evictions += count;
}

export function emitBufferRebuild(
  ctx: WebGL2RendererContext,
  context: BufferRebuildContext | undefined,
  before: number,
  after: number
): void {
  if (!context || after <= before) return;
  emitDiagnostic(ctx, {
    code: "render/buffer-rebuild",
    message: "GPU buffer resized",
    severity: "info",
    recoverable: true,
    context: {
      seriesId: context.seriesId,
      buffer: context.buffer,
      beforeBytes: before,
      afterBytes: after
    }
  });
}
