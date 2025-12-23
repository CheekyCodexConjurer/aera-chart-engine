import { colorFromId, withAlpha } from "../color.js";
import type { RenderFrame, RenderSeries } from "../renderer.js";
import type { RgbaColor } from "../color.js";
import type { WebGL2RendererContext } from "./context.js";
import { recordBatchCount, recordDrawCalls, recordStateChange } from "./metrics.js";
import { splitFloat64 } from "./shaders.js";
import type { CandleBuffers, InstanceBuffer, LineBuffer, BarProgramInfo, LineProgramInfo, QuadProgramInfo } from "./state.js";
import { computeBarWidth } from "./utils.js";

export function drawLineSeries(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  pane: RenderFrame["panes"][number],
  series: RenderSeries,
  buffer: LineBuffer,
  domain: { min: number; max: number }
): void {
  if (!ctx.lineProgram || buffer.count < 2) return;
  if (!setLineUniforms(ctx, gl, pane, domain, series, colorFromId(series.id, 1), 0, 0)) return;
  gl.useProgram(ctx.lineProgram.program);
  recordStateChange(ctx);
  bindLineBuffer(ctx, gl, ctx.lineProgram, buffer);
  gl.drawArrays(gl.LINE_STRIP, 0, buffer.count);
  recordDrawCalls(ctx, 1);
  recordBatchCount(ctx, 1);
}

export function drawAreaSeries(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  pane: RenderFrame["panes"][number],
  series: RenderSeries,
  fill: LineBuffer,
  line: LineBuffer,
  domain: { min: number; max: number }
): void {
  if (!ctx.lineProgram) return;
  const baseValue = domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
  const fillColor = withAlpha(colorFromId(series.id, 1), 0.2);
  if (setLineUniforms(ctx, gl, pane, domain, series, fillColor, baseValue, 1)) {
    gl.useProgram(ctx.lineProgram.program);
    recordStateChange(ctx);
    bindLineBuffer(ctx, gl, ctx.lineProgram, fill);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, fill.count);
    recordDrawCalls(ctx, 1);
    recordBatchCount(ctx, 1);
  }
  drawLineSeries(ctx, gl, pane, series, line, domain);
}

export function drawHistogramSeries(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  pane: RenderFrame["panes"][number],
  series: RenderSeries,
  buffer: InstanceBuffer,
  domain: { min: number; max: number }
): void {
  if (!ctx.barProgram || !ctx.quadIndexBuffer || buffer.count === 0) return;
  const baseValue = domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
  const halfWidth = computeBarHalfWidthTime(pane, series.timeMs.length);
  if (!setBarUniforms(ctx, gl, pane, domain, series, halfWidth, baseValue)) return;
  gl.useProgram(ctx.barProgram.program);
  recordStateChange(ctx);
  bindBarBuffer(ctx, gl, ctx.barProgram, buffer);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, buffer.count);
  recordDrawCalls(ctx, 1);
  recordBatchCount(ctx, 1);
}

export function drawCandleSeries(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  pane: RenderFrame["panes"][number],
  series: RenderSeries,
  buffers: CandleBuffers,
  domain: { min: number; max: number }
): void {
  if (!ctx.lineProgram || !ctx.quadProgram) return;
  const theme = ctx.resolvedTheme.candle;
  if (buffers.wickUp && buffers.wickUp.count > 1) {
    if (setLineUniforms(ctx, gl, pane, domain, series, theme.wickUp, 0, 0)) {
      gl.useProgram(ctx.lineProgram.program);
      recordStateChange(ctx);
      bindLineBuffer(ctx, gl, ctx.lineProgram, buffers.wickUp);
      gl.drawArrays(gl.LINES, 0, buffers.wickUp.count);
      recordDrawCalls(ctx, 1);
      recordBatchCount(ctx, 1);
    }
  }
  if (buffers.wickDown && buffers.wickDown.count > 1) {
    if (setLineUniforms(ctx, gl, pane, domain, series, theme.wickDown, 0, 0)) {
      gl.useProgram(ctx.lineProgram.program);
      recordStateChange(ctx);
      bindLineBuffer(ctx, gl, ctx.lineProgram, buffers.wickDown);
      gl.drawArrays(gl.LINES, 0, buffers.wickDown.count);
      recordDrawCalls(ctx, 1);
      recordBatchCount(ctx, 1);
    }
  }
  if (buffers.body && buffers.body.count > 0) {
    const halfWidth = computeBarHalfWidthTime(pane, series.timeMs.length);
    if (!setQuadUniforms(ctx, gl, pane, domain, series, halfWidth, theme.bodyUp, theme.bodyDown)) return;
    gl.useProgram(ctx.quadProgram.program);
    recordStateChange(ctx);
    bindQuadBuffer(ctx, gl, ctx.quadProgram, buffers.body, ctx.quadIndexBuffer);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, buffers.body.count);
    recordDrawCalls(ctx, 1);
    recordBatchCount(ctx, 1);
    if (theme.borderEnabled && ctx.quadLineIndexBuffer) {
      if (!setQuadUniforms(ctx, gl, pane, domain, series, halfWidth, theme.borderUp, theme.borderDown)) return;
      gl.useProgram(ctx.quadProgram.program);
      recordStateChange(ctx);
      bindQuadBuffer(ctx, gl, ctx.quadProgram, buffers.body, ctx.quadLineIndexBuffer);
      gl.drawElementsInstanced(gl.LINES, 8, gl.UNSIGNED_SHORT, 0, buffers.body.count);
      recordDrawCalls(ctx, 1);
      recordBatchCount(ctx, 1);
    }
  }
}

function setLineUniforms(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  pane: RenderFrame["panes"][number],
  domain: { min: number; max: number },
  series: RenderSeries,
  color: RgbaColor,
  baseValue: number,
  useBase: number
): boolean {
  if (!ctx.lineProgram) return false;
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) return false;
  if (pane.plotArea.width <= 0 || pane.plotArea.height <= 0) return false;
  const range = pane.visibleRange;
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs) || range.endMs <= range.startMs) return false;
  const [rsHi, rsLo] = splitFloat64(range.startMs);
  const [reHi, reLo] = splitFloat64(range.endMs);
  gl.useProgram(ctx.lineProgram.program);
  recordStateChange(ctx);
  gl.uniform1f(ctx.lineProgram.uniforms.rangeStartHigh, rsHi);
  gl.uniform1f(ctx.lineProgram.uniforms.rangeStartLow, rsLo);
  gl.uniform1f(ctx.lineProgram.uniforms.rangeEndHigh, reHi);
  gl.uniform1f(ctx.lineProgram.uniforms.rangeEndLow, reLo);
  gl.uniform1f(ctx.lineProgram.uniforms.domainMin, domain.min);
  gl.uniform1f(ctx.lineProgram.uniforms.domainMax, domain.max);
  gl.uniform2f(ctx.lineProgram.uniforms.plotOrigin, pane.plotArea.x, pane.plotArea.y);
  gl.uniform2f(ctx.lineProgram.uniforms.plotSize, pane.plotArea.width, pane.plotArea.height);
  gl.uniform2f(ctx.lineProgram.uniforms.viewport, ctx.width, ctx.height);
  gl.uniform4f(ctx.lineProgram.uniforms.color, color[0], color[1], color[2], color[3]);
  gl.uniform1f(ctx.lineProgram.uniforms.baseValue, baseValue);
  gl.uniform1f(ctx.lineProgram.uniforms.useBase, useBase);
  return true;
}

function setQuadUniforms(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  pane: RenderFrame["panes"][number],
  domain: { min: number; max: number },
  series: RenderSeries,
  halfWidth: number,
  colorUp: RgbaColor,
  colorDown: RgbaColor
): boolean {
  if (!ctx.quadProgram) return false;
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) return false;
  if (pane.plotArea.width <= 0 || pane.plotArea.height <= 0) return false;
  const range = pane.visibleRange;
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs) || range.endMs <= range.startMs) return false;
  const [rsHi, rsLo] = splitFloat64(range.startMs);
  const [reHi, reLo] = splitFloat64(range.endMs);
  gl.useProgram(ctx.quadProgram.program);
  recordStateChange(ctx);
  gl.uniform1f(ctx.quadProgram.uniforms.rangeStartHigh, rsHi);
  gl.uniform1f(ctx.quadProgram.uniforms.rangeStartLow, rsLo);
  gl.uniform1f(ctx.quadProgram.uniforms.rangeEndHigh, reHi);
  gl.uniform1f(ctx.quadProgram.uniforms.rangeEndLow, reLo);
  gl.uniform1f(ctx.quadProgram.uniforms.domainMin, domain.min);
  gl.uniform1f(ctx.quadProgram.uniforms.domainMax, domain.max);
  gl.uniform2f(ctx.quadProgram.uniforms.plotOrigin, pane.plotArea.x, pane.plotArea.y);
  gl.uniform2f(ctx.quadProgram.uniforms.plotSize, pane.plotArea.width, pane.plotArea.height);
  gl.uniform2f(ctx.quadProgram.uniforms.viewport, ctx.width, ctx.height);
  gl.uniform1f(ctx.quadProgram.uniforms.halfWidth, halfWidth);
  gl.uniform4f(ctx.quadProgram.uniforms.colorUp, colorUp[0], colorUp[1], colorUp[2], colorUp[3]);
  gl.uniform4f(ctx.quadProgram.uniforms.colorDown, colorDown[0], colorDown[1], colorDown[2], colorDown[3]);
  return true;
}

function setBarUniforms(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  pane: RenderFrame["panes"][number],
  domain: { min: number; max: number },
  series: RenderSeries,
  halfWidth: number,
  baseValue: number
): boolean {
  if (!ctx.barProgram) return false;
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) return false;
  if (pane.plotArea.width <= 0 || pane.plotArea.height <= 0) return false;
  const range = pane.visibleRange;
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs) || range.endMs <= range.startMs) return false;
  const [rsHi, rsLo] = splitFloat64(range.startMs);
  const [reHi, reLo] = splitFloat64(range.endMs);
  gl.useProgram(ctx.barProgram.program);
  recordStateChange(ctx);
  gl.uniform1f(ctx.barProgram.uniforms.rangeStartHigh, rsHi);
  gl.uniform1f(ctx.barProgram.uniforms.rangeStartLow, rsLo);
  gl.uniform1f(ctx.barProgram.uniforms.rangeEndHigh, reHi);
  gl.uniform1f(ctx.barProgram.uniforms.rangeEndLow, reLo);
  gl.uniform1f(ctx.barProgram.uniforms.domainMin, domain.min);
  gl.uniform1f(ctx.barProgram.uniforms.domainMax, domain.max);
  gl.uniform2f(ctx.barProgram.uniforms.plotOrigin, pane.plotArea.x, pane.plotArea.y);
  gl.uniform2f(ctx.barProgram.uniforms.plotSize, pane.plotArea.width, pane.plotArea.height);
  gl.uniform2f(ctx.barProgram.uniforms.viewport, ctx.width, ctx.height);
  gl.uniform1f(ctx.barProgram.uniforms.halfWidth, halfWidth);
  gl.uniform1f(ctx.barProgram.uniforms.baseValue, baseValue);
  return true;
}

function bindLineBuffer(ctx: WebGL2RendererContext, gl: WebGL2RenderingContext, info: LineProgramInfo, buffer: LineBuffer): void {
  gl.bindVertexArray(info.vao);
  recordStateChange(ctx);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
  recordStateChange(ctx);
  const stride = buffer.stride * Float32Array.BYTES_PER_ELEMENT;
  gl.vertexAttribPointer(info.attribs.timeHigh, 1, gl.FLOAT, false, stride, 0);
  gl.vertexAttribPointer(
    info.attribs.timeLow,
    1,
    gl.FLOAT,
    false,
    stride,
    Float32Array.BYTES_PER_ELEMENT
  );
  gl.vertexAttribPointer(
    info.attribs.value,
    1,
    gl.FLOAT,
    false,
    stride,
    2 * Float32Array.BYTES_PER_ELEMENT
  );
  gl.vertexAttribPointer(
    info.attribs.side,
    1,
    gl.FLOAT,
    false,
    stride,
    3 * Float32Array.BYTES_PER_ELEMENT
  );
}

function bindQuadBuffer(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  info: QuadProgramInfo,
  buffer: InstanceBuffer,
  elementBuffer: WebGLBuffer | null
): void {
  gl.bindVertexArray(info.vao);
  recordStateChange(ctx);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
  recordStateChange(ctx);
  if (elementBuffer) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
    recordStateChange(ctx);
  }
  const stride = buffer.stride * Float32Array.BYTES_PER_ELEMENT;
  gl.vertexAttribDivisor(info.attribs.timeHigh, 1);
  gl.vertexAttribDivisor(info.attribs.timeLow, 1);
  gl.vertexAttribDivisor(info.attribs.value0, 1);
  gl.vertexAttribDivisor(info.attribs.value1, 1);
  if (info.attribs.color >= 0) {
    gl.vertexAttribDivisor(info.attribs.color, 1);
  }
  gl.vertexAttribPointer(info.attribs.timeHigh, 1, gl.FLOAT, false, stride, 0);
  gl.vertexAttribPointer(
    info.attribs.timeLow,
    1,
    gl.FLOAT,
    false,
    stride,
    Float32Array.BYTES_PER_ELEMENT
  );
  gl.vertexAttribPointer(
    info.attribs.value0,
    1,
    gl.FLOAT,
    false,
    stride,
    2 * Float32Array.BYTES_PER_ELEMENT
  );
  gl.vertexAttribPointer(
    info.attribs.value1,
    1,
    gl.FLOAT,
    false,
    stride,
    3 * Float32Array.BYTES_PER_ELEMENT
  );
  if (info.attribs.color >= 0) {
    gl.vertexAttribPointer(
      info.attribs.color,
      4,
      gl.FLOAT,
      false,
      stride,
      4 * Float32Array.BYTES_PER_ELEMENT
    );
  }
}

function bindBarBuffer(ctx: WebGL2RendererContext, gl: WebGL2RenderingContext, info: BarProgramInfo, buffer: InstanceBuffer): void {
  gl.bindVertexArray(info.vao);
  recordStateChange(ctx);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
  recordStateChange(ctx);
  const stride = buffer.stride * Float32Array.BYTES_PER_ELEMENT;
  gl.vertexAttribDivisor(info.attribs.timeHigh, 1);
  gl.vertexAttribDivisor(info.attribs.timeLow, 1);
  gl.vertexAttribDivisor(info.attribs.value, 1);
  gl.vertexAttribDivisor(info.attribs.color, 1);
  gl.vertexAttribPointer(info.attribs.timeHigh, 1, gl.FLOAT, false, stride, 0);
  gl.vertexAttribPointer(
    info.attribs.timeLow,
    1,
    gl.FLOAT,
    false,
    stride,
    Float32Array.BYTES_PER_ELEMENT
  );
  gl.vertexAttribPointer(
    info.attribs.value,
    1,
    gl.FLOAT,
    false,
    stride,
    2 * Float32Array.BYTES_PER_ELEMENT
  );
  gl.vertexAttribPointer(
    info.attribs.color,
    4,
    gl.FLOAT,
    false,
    stride,
    3 * Float32Array.BYTES_PER_ELEMENT
  );
}

function computeBarHalfWidthTime(pane: RenderFrame["panes"][number], count: number): number {
  if (pane.plotArea.width <= 0) return 0;
  const span = pane.visibleRange.endMs - pane.visibleRange.startMs;
  if (!Number.isFinite(span) || span <= 0) return 0;
  const barWidthPx = computeBarWidth(pane, count);
  const widthTime = (barWidthPx / pane.plotArea.width) * span;
  return widthTime * 0.5;
}
