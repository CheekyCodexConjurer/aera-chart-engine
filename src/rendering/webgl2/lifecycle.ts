import { createProgram } from "../gl-utils.js";
import { GpuTextRenderer } from "../gpu-text.js";
import type { WebGL2RendererContext } from "./context.js";
import { emitDiagnostic } from "./metrics.js";
import { releaseSeriesEntry } from "./series-cache.js";
import {
  FRAG_SHADER_SOURCE,
  SERIES_BAR_FRAG,
  SERIES_BAR_VERT,
  SERIES_LINE_FRAG,
  SERIES_LINE_VERT,
  SERIES_QUAD_FRAG,
  SERIES_QUAD_VERT,
  VERT_SHADER_SOURCE,
  createBarProgramInfo,
  createLineProgramInfo,
  createQuadProgramInfo
} from "./shaders.js";

export function initializeRenderer(ctx: WebGL2RendererContext): void {
  if (!ctx.hasContextListeners) {
    ctx.canvas.addEventListener("webglcontextlost", ctx.handleContextLost);
    ctx.canvas.addEventListener("webglcontextrestored", ctx.handleContextRestored);
    ctx.hasContextListeners = true;
  }
  if (ctx.isContextLost) {
    return;
  }
  ctx.gl = ctx.canvas.getContext("webgl2");
  if (!ctx.gl) {
    emitDiagnostic(ctx, {
      code: "render/context-lost",
      message: "WebGL2 context not available",
      severity: "error",
      recoverable: true
    });
    ctx.options.onError?.("WebGL2 context not available");
    return;
  }
  const dynamicProgram = createProgram(ctx.gl, VERT_SHADER_SOURCE, FRAG_SHADER_SOURCE);
  if (!dynamicProgram) {
    ctx.options.onError?.("Failed to compile WebGL2 program");
    return;
  }
  ctx.dynamicProgram = dynamicProgram;
  ctx.dynamicVao = ctx.gl.createVertexArray();
  ctx.dynamicVbo = ctx.gl.createBuffer();
  if (!ctx.dynamicVao || !ctx.dynamicVbo) {
    ctx.options.onError?.("Failed to allocate WebGL buffers");
    return;
  }
  ctx.gl.bindVertexArray(ctx.dynamicVao);
  ctx.gl.bindBuffer(ctx.gl.ARRAY_BUFFER, ctx.dynamicVbo);
  const positionLocation = ctx.gl.getAttribLocation(dynamicProgram, "a_position");
  const colorLocation = ctx.gl.getAttribLocation(dynamicProgram, "a_color");
  const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
  ctx.gl.enableVertexAttribArray(positionLocation);
  ctx.gl.vertexAttribPointer(positionLocation, 2, ctx.gl.FLOAT, false, stride, 0);
  ctx.gl.enableVertexAttribArray(colorLocation);
  ctx.gl.vertexAttribPointer(
    colorLocation,
    4,
    ctx.gl.FLOAT,
    false,
    stride,
    2 * Float32Array.BYTES_PER_ELEMENT
  );
  ctx.gl.bindVertexArray(null);
  ctx.gl.bindBuffer(ctx.gl.ARRAY_BUFFER, null);

  ctx.quadCornerBuffer = ctx.gl.createBuffer();
  ctx.quadIndexBuffer = ctx.gl.createBuffer();
  if (!ctx.quadCornerBuffer || !ctx.quadIndexBuffer) {
    ctx.options.onError?.("Failed to allocate quad buffers");
    return;
  }
  const corners = new Float32Array([
    -0.5, -0.5,
    0.5, -0.5,
    0.5, 0.5,
    -0.5, 0.5
  ]);
  const indices = new Uint16Array([0, 1, 2, 2, 3, 0]);
  ctx.gl.bindBuffer(ctx.gl.ARRAY_BUFFER, ctx.quadCornerBuffer);
  ctx.gl.bufferData(ctx.gl.ARRAY_BUFFER, corners, ctx.gl.STATIC_DRAW);
  ctx.gl.bindBuffer(ctx.gl.ELEMENT_ARRAY_BUFFER, ctx.quadIndexBuffer);
  ctx.gl.bufferData(ctx.gl.ELEMENT_ARRAY_BUFFER, indices, ctx.gl.STATIC_DRAW);
  ctx.gl.bindBuffer(ctx.gl.ARRAY_BUFFER, null);
  ctx.gl.bindBuffer(ctx.gl.ELEMENT_ARRAY_BUFFER, null);

  const lineProgram = createProgram(ctx.gl, SERIES_LINE_VERT, SERIES_LINE_FRAG);
  if (!lineProgram) {
    ctx.options.onError?.("Failed to compile series line program");
    return;
  }
  try {
    ctx.lineProgram = createLineProgramInfo(ctx.gl, lineProgram);
  } catch (error) {
    emitDiagnostic(ctx, {
      code: "render/buffer-allocation-failed",
      message: "Failed to allocate line VAO",
      severity: "error",
      recoverable: false,
      context: { error: String(error) }
    });
    ctx.options.onError?.("Failed to allocate line VAO");
    return;
  }

  const quadProgram = createProgram(ctx.gl, SERIES_QUAD_VERT, SERIES_QUAD_FRAG);
  if (!quadProgram) {
    ctx.options.onError?.("Failed to compile series quad program");
    return;
  }
  try {
    ctx.quadProgram = createQuadProgramInfo(ctx.gl, quadProgram, ctx.quadCornerBuffer, ctx.quadIndexBuffer);
  } catch (error) {
    emitDiagnostic(ctx, {
      code: "render/buffer-allocation-failed",
      message: "Failed to allocate quad VAO",
      severity: "error",
      recoverable: false,
      context: { error: String(error) }
    });
    ctx.options.onError?.("Failed to allocate quad VAO");
    return;
  }

  const barProgram = createProgram(ctx.gl, SERIES_BAR_VERT, SERIES_BAR_FRAG);
  if (!barProgram) {
    ctx.options.onError?.("Failed to compile series bar program");
    return;
  }
  try {
    ctx.barProgram = createBarProgramInfo(ctx.gl, barProgram, ctx.quadCornerBuffer, ctx.quadIndexBuffer);
  } catch (error) {
    emitDiagnostic(ctx, {
      code: "render/buffer-allocation-failed",
      message: "Failed to allocate bar VAO",
      severity: "error",
      recoverable: false,
      context: { error: String(error) }
    });
    ctx.options.onError?.("Failed to allocate bar VAO");
    return;
  }

  const useGpuText = ctx.options.useGpuText ?? !ctx.options.textLayer;
  if (useGpuText) {
    ctx.gpuText = new GpuTextRenderer(ctx.gl, { font: ctx.options.textFont });
  }
}

export function resizeRenderer(ctx: WebGL2RendererContext, width: number, height: number, devicePixelRatio: number): void {
  ctx.width = width;
  ctx.height = height;
  ctx.dpr = Math.max(1, devicePixelRatio);
  ctx.canvas.width = Math.floor(width * ctx.dpr);
  ctx.canvas.height = Math.floor(height * ctx.dpr);
  ctx.canvas.style.width = `${width}px`;
  ctx.canvas.style.height = `${height}px`;
  ctx.gl?.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.options.textLayer?.resize(width, height, ctx.dpr);
  ctx.gpuText?.resize(width, height);
}

export function handleContextLost(ctx: WebGL2RendererContext, event: Event): void {
  event.preventDefault();
  if (ctx.isContextLost) return;
  ctx.isContextLost = true;
  ctx.contextLossCount += 1;
  emitDiagnostic(ctx, {
    code: "render/context-lost",
    message: "WebGL2 context lost",
    severity: "error",
    recoverable: true,
    context: { count: ctx.contextLossCount }
  });
  resetGpuState(ctx);
}

export function handleContextRestored(ctx: WebGL2RendererContext): void {
  if (!ctx.isContextLost) return;
  ctx.isContextLost = false;
  emitDiagnostic(ctx, {
    code: "render/context-restored",
    message: "WebGL2 context restored",
    severity: "info",
    recoverable: true
  });
  initializeRenderer(ctx);
  if (ctx.width > 0 && ctx.height > 0) {
    resizeRenderer(ctx, ctx.width, ctx.height, ctx.dpr);
  }
}

export function resetGpuState(ctx: WebGL2RendererContext): void {
  if (ctx.gl) {
    if (ctx.dynamicVbo) ctx.gl.deleteBuffer(ctx.dynamicVbo);
    if (ctx.dynamicVao) ctx.gl.deleteVertexArray(ctx.dynamicVao);
    if (ctx.dynamicProgram) ctx.gl.deleteProgram(ctx.dynamicProgram);
    if (ctx.quadCornerBuffer) ctx.gl.deleteBuffer(ctx.quadCornerBuffer);
    if (ctx.quadIndexBuffer) ctx.gl.deleteBuffer(ctx.quadIndexBuffer);
    if (ctx.lineProgram) ctx.gl.deleteProgram(ctx.lineProgram.program);
    if (ctx.quadProgram) ctx.gl.deleteProgram(ctx.quadProgram.program);
    if (ctx.barProgram) ctx.gl.deleteProgram(ctx.barProgram.program);
    for (const entry of ctx.seriesCache.values()) {
      releaseSeriesEntry(ctx, entry);
    }
  }
  ctx.seriesCache.clear();
  ctx.seriesGpuBytes = 0;
  ctx.dynamicProgram = null;
  ctx.dynamicVao = null;
  ctx.dynamicVbo = null;
  ctx.lineProgram = null;
  ctx.quadProgram = null;
  ctx.barProgram = null;
  ctx.quadCornerBuffer = null;
  ctx.quadIndexBuffer = null;
  ctx.gpuText = null;
  ctx.gl = null;
}
