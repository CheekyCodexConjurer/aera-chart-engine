import { GpuBuffer } from "../gpu-buffer.js";
import type { RenderSeries } from "../renderer.js";
import type { WebGL2RendererContext } from "./context.js";
import { emitBufferRebuild, emitDiagnostic, recordBufferUpload } from "./metrics.js";
import type { BufferRebuildContext, InstanceBuffer, InstanceData, LineBuffer, LineData } from "./state.js";
import {
  buildAreaData,
  buildBarData,
  buildCandleBodyData,
  buildCandleWickData,
  buildLineData
} from "./series-data.js";

export function uploadBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  uploader: GpuBuffer,
  data: Float32Array,
  usage: number
): void {
  const before = uploader.getCapacityBytes();
  uploader.upload(gl, data, usage);
  const after = uploader.getCapacityBytes();
  recordBufferUpload(ctx, uploader, before, after);
}

export function createLineBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  timeMs: Float64Array,
  values: Float64Array | undefined,
  side: number
): LineBuffer | null {
  const payload = buildLineData(timeMs, values, side);
  if (!payload) return null;
  return uploadLineBuffer(ctx, gl, payload.data, payload.count);
}

export function uploadLineBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  data: Float32Array,
  count: number
): LineBuffer | null {
  if (count <= 0) return null;
  const buffer = gl.createBuffer();
  if (!buffer) {
    emitDiagnostic(ctx, {
      code: "render/buffer-allocation-failed",
      message: "Failed to allocate line buffer",
      severity: "error",
      recoverable: false
    });
    return null;
  }
  const uploader = new GpuBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  uploadBuffer(ctx, gl, uploader, data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return { buffer, uploader, count, stride: 4, data };
}

export function createAreaBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  timeMs: Float64Array,
  values: Float64Array | undefined
): LineBuffer | null {
  const payload = buildAreaData(timeMs, values);
  if (!payload) return null;
  return uploadLineBuffer(ctx, gl, payload.data, payload.count);
}

export function createBarBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  timeMs: Float64Array,
  values: Float64Array | undefined,
  seriesId = "histogram"
): InstanceBuffer | null {
  const payload = buildBarData(timeMs, values, seriesId);
  if (!payload) return null;
  return createInstanceBuffer(ctx, gl, payload);
}

export function createCandleWickBuffers(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  series: RenderSeries
): { up: LineBuffer | null; down: LineBuffer | null } | null {
  const payload = buildCandleWickData(series);
  if (!payload) return null;
  const up = payload.up ? uploadLineBuffer(ctx, gl, payload.up.data, payload.up.count) : null;
  const down = payload.down ? uploadLineBuffer(ctx, gl, payload.down.data, payload.down.count) : null;
  return { up, down };
}

export function createCandleBodyBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  series: RenderSeries
): InstanceBuffer | null {
  const payload = buildCandleBodyData(series);
  if (!payload) return null;
  return createInstanceBuffer(ctx, gl, payload);
}

export function upsertLineBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  existing: LineBuffer | null,
  payload: LineData | null,
  context?: BufferRebuildContext
): LineBuffer | null {
  if (!payload || payload.count === 0) {
    releaseLineBuffer(gl, existing);
    return null;
  }
  if (!existing) {
    return uploadLineBuffer(ctx, gl, payload.data, payload.count);
  }
  const before = existing.uploader.getCapacityBytes();
  gl.bindBuffer(gl.ARRAY_BUFFER, existing.buffer);
  uploadBuffer(ctx, gl, existing.uploader, payload.data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  existing.count = payload.count;
  existing.data = payload.data;
  const after = existing.uploader.getCapacityBytes();
  if (after > before) {
    emitBufferRebuild(ctx, context, before, after);
  }
  return existing;
}

export function upsertInstanceBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  existing: InstanceBuffer | null,
  payload: InstanceData | null,
  context?: BufferRebuildContext
): InstanceBuffer | null {
  if (!payload || payload.count === 0) {
    releaseInstanceBuffer(gl, existing);
    return null;
  }
  if (!existing) {
    return createInstanceBuffer(ctx, gl, payload);
  }
  const before = existing.uploader.getCapacityBytes();
  gl.bindBuffer(gl.ARRAY_BUFFER, existing.buffer);
  uploadBuffer(ctx, gl, existing.uploader, payload.data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  existing.count = payload.count;
  existing.stride = payload.stride;
  existing.data = payload.data;
  const after = existing.uploader.getCapacityBytes();
  if (after > before) {
    emitBufferRebuild(ctx, context, before, after);
  }
  return existing;
}

export function createInstanceBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  payload: InstanceData
): InstanceBuffer | null {
  const buffer = gl.createBuffer();
  if (!buffer) {
    emitDiagnostic(ctx, {
      code: "render/buffer-allocation-failed",
      message: "Failed to allocate instance buffer",
      severity: "error",
      recoverable: false
    });
    return null;
  }
  const uploader = new GpuBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  uploadBuffer(ctx, gl, uploader, payload.data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return { buffer, uploader, count: payload.count, stride: payload.stride, data: payload.data };
}

export function releaseLineBuffer(gl: WebGL2RenderingContext, buffer: LineBuffer | null): void {
  if (!buffer) return;
  gl.deleteBuffer(buffer.buffer);
}

export function releaseInstanceBuffer(gl: WebGL2RenderingContext, buffer: InstanceBuffer | null): void {
  if (!buffer) return;
  gl.deleteBuffer(buffer.buffer);
}
