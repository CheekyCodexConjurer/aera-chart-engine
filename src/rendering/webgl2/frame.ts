import { formatTimestamp } from "../../core/axis.js";
import { timeToX, priceToY } from "../../core/transform.js";
import {
  DEFAULT_AXIS,
  DEFAULT_CLEAR,
  DEFAULT_CROSSHAIR,
  DEFAULT_DOWN_CANDLE,
  DEFAULT_GRID,
  DEFAULT_UP_CANDLE,
  colorFromId,
  parseColor,
  withAlpha
} from "../color.js";
import type { RenderCrosshair, RenderFrame, RenderSeries } from "../renderer.js";
import type { TextLabel } from "../text/index.js";
import type { DrawCommand } from "../vertex-buffer.js";
import type { OverlayRenderItem } from "../../core/overlays.js";
import type { Range } from "../../api/public-types.js";
import type { WebGL2RendererContext } from "./context.js";
import { uploadBuffer } from "./buffers.js";
import { drawAreaSeries, drawCandleSeries, drawHistogramSeries, drawLineSeries } from "./draw.js";
import { computeLabelRect, measureLabel } from "./labels.js";
import { resetFrameMetrics, recordDrawCalls } from "./metrics.js";
import { appendOverlays } from "./overlays.js";
import { getSeriesEntry } from "./series-cache.js";
import {
  coalesceDrawCommands,
  computeBarWidth,
  findBottomPaneId,
  formatPrice,
  glLineStrip,
  glLines,
  glTriangles,
  toNdc,
  applyScissor
} from "./utils.js";

export function renderFrame(ctx: WebGL2RendererContext, frame: RenderFrame): void {
  if (
    !ctx.gl ||
    !ctx.dynamicProgram ||
    !ctx.dynamicVao ||
    !ctx.dynamicVbo ||
    !ctx.lineProgram ||
    !ctx.quadProgram ||
    !ctx.barProgram
  ) {
    return;
  }
  ctx.metrics.frameCount += 1;
  resetFrameMetrics(ctx);
  const gl = ctx.gl;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.SCISSOR_TEST);
  const clear = ctx.options.clearColor ?? DEFAULT_CLEAR;
  gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const labels: TextLabel[] = [];
  const bottomPaneId = findBottomPaneId(frame.panes);
  const crosshairs = frame.crosshairs ?? [];
  for (const pane of frame.panes) {
    const isBottom = pane.paneId === bottomPaneId;
    const paneCrosshairs = crosshairs.filter((item) => item.paneId === pane.paneId);
    labels.push(...renderPane(ctx, gl, pane, frame.overlays, isBottom, paneCrosshairs));
  }

  if (ctx.options.textLayer) {
    ctx.options.textLayer.clear();
    for (const label of labels) {
      ctx.options.textLayer.drawLabel(label);
    }
  } else if (labels.length > 0 && !ctx.warnedMissingTextLayer) {
    if (ctx.gpuText) {
      renderLabelBackgrounds(ctx, labels);
      ctx.gpuText.render(labels);
    } else {
      ctx.options.onError?.("Label overlays skipped: text layer not configured");
      ctx.warnedMissingTextLayer = true;
    }
  }

  if (ctx.gpuText) {
    ctx.metrics.textAtlas = ctx.gpuText.getMetrics();
  } else {
    ctx.metrics.textAtlas = { pages: 0, glyphs: 0, capacity: 0, occupancy: 0 };
  }

  gl.disable(gl.SCISSOR_TEST);
}

function renderPane(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  pane: RenderFrame["panes"][number],
  overlays: OverlayRenderItem[],
  isBottomPane: boolean,
  crosshairs: RenderCrosshair[]
): TextLabel[] {
  const plotArea = pane.plotArea;
  if (plotArea.width <= 0 || plotArea.height <= 0) return [];
  pushClip(ctx, gl, plotArea);

  const labels: TextLabel[] = [];
  const commands: DrawCommand[] = [];
  ctx.dynamicBuffer.reset();

  const paneOverlays = overlays.filter(
    (item) => (item.overlay.paneId ?? "price") === pane.paneId
  );
  const below = paneOverlays.filter((item) => (item.overlay.layer ?? "above") === "below");
  const above = paneOverlays.filter((item) => (item.overlay.layer ?? "above") === "above");
  const ui = paneOverlays.filter((item) => item.overlay.layer === "ui");

  appendGridAndAxes(ctx, pane, commands, labels, isBottomPane);
  appendOverlays(ctx, pane, below, commands, labels);
  flushDynamic(ctx, gl, commands);
  drawSeries(ctx, gl, pane);
  appendOverlays(ctx, pane, above, commands, labels);
  appendOverlays(ctx, pane, ui, commands, labels);
  if (crosshairs.length > 0) {
    for (const crosshair of crosshairs) {
      appendCrosshair(ctx, pane, crosshair, commands, labels);
    }
  }
  flushDynamic(ctx, gl, commands);

  popClip(ctx, gl);
  return labels;
}

function appendSeries(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  series: RenderSeries,
  commands: DrawCommand[]
): void {
  const range = pane.visibleRange;
  const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
  if (!domain) return;
  if (series.type === "candles") {
    appendCandleSeries(ctx, range, pane, series, commands);
    return;
  }
  if (series.type === "histogram") {
    appendHistogramSeries(ctx, range, pane, series, commands);
    return;
  }
  if (series.type === "area") {
    appendAreaSeries(ctx, range, pane, series, commands);
    return;
  }
  appendLineSeries(ctx, range, pane, series, commands);
}

function appendLineSeries(
  ctx: WebGL2RendererContext,
  range: Range,
  pane: RenderFrame["panes"][number],
  series: RenderSeries,
  commands: DrawCommand[]
): void {
  const values = series.fields.value;
  if (!values) return;
  const color = colorFromId(series.id, 1);
  const start = ctx.dynamicBuffer.vertexCount;
  for (let i = 0; i < series.timeMs.length; i += 1) {
    const x = timeToX(range, pane.plotArea, series.timeMs[i]);
    const y = priceToY(pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price, pane.plotArea, values[i]);
    if (x === null || y === null) continue;
    const [nx, ny] = toNdc(ctx, x, y);
    ctx.dynamicBuffer.pushVertex(nx, ny, color[0], color[1], color[2], color[3]);
  }
  const count = ctx.dynamicBuffer.vertexCount - start;
  if (count > 1) {
    commands.push({ mode: glLineStrip(ctx), first: start, count });
  }
}

function appendAreaSeries(
  ctx: WebGL2RendererContext,
  range: Range,
  pane: RenderFrame["panes"][number],
  series: RenderSeries,
  commands: DrawCommand[]
): void {
  const values = series.fields.value;
  if (!values) return;
  const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
  if (!domain) return;
  const baseValue = domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
  const baseY = priceToY(domain, pane.plotArea, baseValue);
  if (baseY === null) return;

  const fillColor = withAlpha(colorFromId(series.id, 1), 0.2);
  let prevX: number | null = null;
  let prevY: number | null = null;
  for (let i = 0; i < series.timeMs.length; i += 1) {
    const x = timeToX(range, pane.plotArea, series.timeMs[i]);
    const y = priceToY(domain, pane.plotArea, values[i]);
    if (x === null || y === null) continue;
    if (prevX !== null && prevY !== null) {
      const [x0, y0] = toNdc(ctx, prevX, prevY);
      const [x1, y1] = toNdc(ctx, x, y);
      const [x0b, y0b] = toNdc(ctx, prevX, baseY);
      const [x1b, y1b] = toNdc(ctx, x, baseY);
      const start = ctx.dynamicBuffer.vertexCount;
      ctx.dynamicBuffer.pushVertex(x0, y0, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
      ctx.dynamicBuffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
      ctx.dynamicBuffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
      ctx.dynamicBuffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
      ctx.dynamicBuffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
      ctx.dynamicBuffer.pushVertex(x1b, y1b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
      const count = ctx.dynamicBuffer.vertexCount - start;
      if (count > 0) {
        commands.push({ mode: glTriangles(ctx), first: start, count });
      }
    }
    prevX = x;
    prevY = y;
  }
  appendLineSeries(ctx, range, pane, series, commands);
}

function appendHistogramSeries(
  ctx: WebGL2RendererContext,
  range: Range,
  pane: RenderFrame["panes"][number],
  series: RenderSeries,
  commands: DrawCommand[]
): void {
  const values = series.fields.value;
  if (!values) return;
  const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
  if (!domain) return;
  const baseValue = domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
  const baseY = priceToY(domain, pane.plotArea, baseValue);
  if (baseY === null) return;
  const barColor = colorFromId(series.id, 1);
  const barWidth = computeBarWidth(pane, series.timeMs.length);
  for (let i = 0; i < series.timeMs.length; i += 1) {
    const x = timeToX(range, pane.plotArea, series.timeMs[i]);
    const y = priceToY(domain, pane.plotArea, values[i]);
    if (x === null || y === null) continue;
    const left = x - barWidth * 0.5;
    const right = x + barWidth * 0.5;
    const top = Math.min(y, baseY);
    const bottom = Math.max(y, baseY);
    const [lx, ty] = toNdc(ctx, left, top);
    const [rx, by] = toNdc(ctx, right, bottom);
    const start = ctx.dynamicBuffer.vertexCount;
    ctx.dynamicBuffer.pushVertex(lx, ty, barColor[0], barColor[1], barColor[2], barColor[3]);
    ctx.dynamicBuffer.pushVertex(lx, by, barColor[0], barColor[1], barColor[2], barColor[3]);
    ctx.dynamicBuffer.pushVertex(rx, ty, barColor[0], barColor[1], barColor[2], barColor[3]);
    ctx.dynamicBuffer.pushVertex(rx, ty, barColor[0], barColor[1], barColor[2], barColor[3]);
    ctx.dynamicBuffer.pushVertex(lx, by, barColor[0], barColor[1], barColor[2], barColor[3]);
    ctx.dynamicBuffer.pushVertex(rx, by, barColor[0], barColor[1], barColor[2], barColor[3]);
    const count = ctx.dynamicBuffer.vertexCount - start;
    if (count > 0) {
      commands.push({ mode: glTriangles(ctx), first: start, count });
    }
  }
}

function appendCandleSeries(
  ctx: WebGL2RendererContext,
  range: Range,
  pane: RenderFrame["panes"][number],
  series: RenderSeries,
  commands: DrawCommand[]
): void {
  const open = series.fields.open;
  const high = series.fields.high;
  const low = series.fields.low;
  const close = series.fields.close;
  if (!open || !high || !low || !close) return;
  const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
  if (!domain) return;

  const candleWidth = computeBarWidth(pane, series.timeMs.length);
  const wickStart = ctx.dynamicBuffer.vertexCount;
  for (let i = 0; i < series.timeMs.length; i += 1) {
    const x = timeToX(range, pane.plotArea, series.timeMs[i]);
    if (x === null) continue;
    const openY = priceToY(domain, pane.plotArea, open[i]);
    const closeY = priceToY(domain, pane.plotArea, close[i]);
    const highY = priceToY(domain, pane.plotArea, high[i]);
    const lowY = priceToY(domain, pane.plotArea, low[i]);
    if (openY === null || closeY === null || highY === null || lowY === null) continue;
    const isUp = close[i] >= open[i];
    const color = isUp ? DEFAULT_UP_CANDLE : DEFAULT_DOWN_CANDLE;
    const [nx, nyHigh] = toNdc(ctx, x, highY);
    const [nx2, nyLow] = toNdc(ctx, x, lowY);
    ctx.dynamicBuffer.pushVertex(nx, nyHigh, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(nx2, nyLow, color[0], color[1], color[2], color[3]);
  }
  const wickCount = ctx.dynamicBuffer.vertexCount - wickStart;
  if (wickCount > 0) {
    commands.push({ mode: glLines(ctx), first: wickStart, count: wickCount });
  }

  const bodyStart = ctx.dynamicBuffer.vertexCount;
  for (let i = 0; i < series.timeMs.length; i += 1) {
    const x = timeToX(range, pane.plotArea, series.timeMs[i]);
    if (x === null) continue;
    const openY = priceToY(domain, pane.plotArea, open[i]);
    const closeY = priceToY(domain, pane.plotArea, close[i]);
    if (openY === null || closeY === null) continue;
    const top = Math.min(openY, closeY);
    const bottom = Math.max(openY, closeY);
    const left = x - candleWidth * 0.5;
    const right = x + candleWidth * 0.5;
    const isUp = close[i] >= open[i];
    const color = isUp ? DEFAULT_UP_CANDLE : DEFAULT_DOWN_CANDLE;
    const [lx, ty] = toNdc(ctx, left, top);
    const [rx, by] = toNdc(ctx, right, bottom);
    ctx.dynamicBuffer.pushVertex(lx, ty, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(rx, by, color[0], color[1], color[2], color[3]);
  }
  const bodyCount = ctx.dynamicBuffer.vertexCount - bodyStart;
  if (bodyCount > 0) {
    commands.push({ mode: glTriangles(ctx), first: bodyStart, count: bodyCount });
  }
}

function drawSeries(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  pane: RenderFrame["panes"][number]
): void {
  for (const series of pane.series) {
    const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
    if (!domain) continue;
    const entry = getSeriesEntry(ctx, gl, series);
    if (!entry) continue;
    if (series.type === "candles" && entry.candles) {
      drawCandleSeries(ctx, gl, pane, series, entry.candles, domain);
      continue;
    }
    if (series.type === "histogram" && entry.histogram) {
      drawHistogramSeries(ctx, gl, pane, series, entry.histogram, domain);
      continue;
    }
    if (series.type === "area" && entry.area && entry.line) {
      drawAreaSeries(ctx, gl, pane, series, entry.area, entry.line, domain);
      continue;
    }
    if (series.type === "line" && entry.line) {
      drawLineSeries(ctx, gl, pane, series, entry.line, domain);
    }
  }
}

function flushDynamic(ctx: WebGL2RendererContext, gl: WebGL2RenderingContext, commands: DrawCommand[]): void {
  if (!ctx.dynamicProgram || !ctx.dynamicVao || !ctx.dynamicVbo) return;
  if (commands.length === 0 || ctx.dynamicBuffer.vertexCount === 0) {
    ctx.dynamicBuffer.reset();
    commands.length = 0;
    return;
  }
  const data = ctx.dynamicBuffer.buffer;
  const optimized = coalesceDrawCommands(commands);
  gl.useProgram(ctx.dynamicProgram);
  gl.bindVertexArray(ctx.dynamicVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.dynamicVbo);
  uploadBuffer(ctx, gl, ctx.dynamicGpuBuffer, data, gl.DYNAMIC_DRAW);
  for (const command of optimized) {
    gl.drawArrays(command.mode, command.first, command.count);
  }
  recordDrawCalls(ctx, optimized.length);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  ctx.dynamicBuffer.reset();
  commands.length = 0;
}

function renderLabelBackgrounds(ctx: WebGL2RendererContext, labels: TextLabel[]): void {
  if (!ctx.gl || !ctx.dynamicProgram || !ctx.dynamicVao || !ctx.dynamicVbo) return;
  const gl = ctx.gl;
  const commands: DrawCommand[] = [];
  ctx.dynamicBuffer.reset();
  for (const label of labels) {
    if (!label.background) continue;
    const padding = label.padding ?? 4;
    const metrics = measureLabel(ctx, label.text);
    const rect = computeLabelRect(label, metrics, padding);
    const color = parseColor(label.background, [0, 0, 0, 0.6]);
    appendRect(ctx, rect.x, rect.y, rect.width, rect.height, color, commands);
  }
  flushDynamic(ctx, gl, commands);
}

function appendRect(
  ctx: WebGL2RendererContext,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number, number],
  commands: DrawCommand[]
): void {
  const [x0, y0] = toNdc(ctx, x, y);
  const [x1, y1] = toNdc(ctx, x + width, y + height);
  const start = ctx.dynamicBuffer.vertexCount;
  ctx.dynamicBuffer.pushVertex(x0, y0, color[0], color[1], color[2], color[3]);
  ctx.dynamicBuffer.pushVertex(x1, y0, color[0], color[1], color[2], color[3]);
  ctx.dynamicBuffer.pushVertex(x1, y1, color[0], color[1], color[2], color[3]);
  ctx.dynamicBuffer.pushVertex(x1, y1, color[0], color[1], color[2], color[3]);
  ctx.dynamicBuffer.pushVertex(x0, y1, color[0], color[1], color[2], color[3]);
  ctx.dynamicBuffer.pushVertex(x0, y0, color[0], color[1], color[2], color[3]);
  const count = ctx.dynamicBuffer.vertexCount - start;
  if (count > 0) {
    commands.push({ mode: glTriangles(ctx), first: start, count });
  }
}

function pushClip(ctx: WebGL2RendererContext, gl: WebGL2RenderingContext, plotArea: RenderFrame["panes"][number]["plotArea"]): void {
  ctx.clipStack.push(plotArea);
  applyScissor(ctx, gl, plotArea);
}

function popClip(ctx: WebGL2RendererContext, gl: WebGL2RenderingContext): void {
  ctx.clipStack.pop();
  const next = ctx.clipStack[ctx.clipStack.length - 1];
  if (next) {
    applyScissor(ctx, gl, next);
  } else {
    gl.scissor(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

function appendGridAndAxes(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  commands: DrawCommand[],
  labels: TextLabel[],
  isBottomPane: boolean
): void {
  const plotArea = pane.plotArea;
  const axis = pane.axis;
  const primaryScale =
    axis.left.find((item) => item.scaleId === axis.primaryScaleId) ??
    axis.right.find((item) => item.scaleId === axis.primaryScaleId) ??
    axis.right[0] ??
    axis.left[0];
  const yTicks = primaryScale?.ticks ?? [];
  const xTicks = axis.time ?? [];

  const domain = pane.scaleDomains[axis.primaryScaleId] ?? pane.scaleDomains.price;
  const gridStart = ctx.dynamicBuffer.vertexCount;
  if (domain) {
    for (const tick of yTicks) {
      const y = priceToY(domain, plotArea, tick.value);
      if (y === null) continue;
      const [x0, y0] = toNdc(ctx, plotArea.x, y);
      const [x1, y1] = toNdc(ctx, plotArea.x + plotArea.width, y);
      ctx.dynamicBuffer.pushVertex(x0, y0, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
      ctx.dynamicBuffer.pushVertex(x1, y1, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
    }
  }
  for (const tick of xTicks) {
    const x = timeToX(pane.visibleRange, plotArea, tick.value);
    if (x === null) continue;
    const [x0, y0] = toNdc(ctx, x, plotArea.y);
    const [x1, y1] = toNdc(ctx, x, plotArea.y + plotArea.height);
    ctx.dynamicBuffer.pushVertex(x0, y0, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
    ctx.dynamicBuffer.pushVertex(x1, y1, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
  }
  const gridCount = ctx.dynamicBuffer.vertexCount - gridStart;
  if (gridCount > 0) {
    commands.push({ mode: glLines(ctx), first: gridStart, count: gridCount });
  }

  const axisStart = ctx.dynamicBuffer.vertexCount;
  if (axis.left.length > 0) {
    const [lx0, ly0] = toNdc(ctx, plotArea.x, plotArea.y);
    const [lx1, ly1] = toNdc(ctx, plotArea.x, plotArea.y + plotArea.height);
    ctx.dynamicBuffer.pushVertex(lx0, ly0, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
    ctx.dynamicBuffer.pushVertex(lx1, ly1, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
  }
  if (axis.right.length > 0) {
    const axisX = plotArea.x + plotArea.width;
    const [rx0, ry0] = toNdc(ctx, axisX, plotArea.y);
    const [rx1, ry1] = toNdc(ctx, axisX, plotArea.y + plotArea.height);
    ctx.dynamicBuffer.pushVertex(rx0, ry0, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
    ctx.dynamicBuffer.pushVertex(rx1, ry1, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
  }
  const axisCount = ctx.dynamicBuffer.vertexCount - axisStart;
  if (axisCount > 0) {
    commands.push({ mode: glLines(ctx), first: axisStart, count: axisCount });
  }

  for (const scale of axis.left) {
    if (!scale.visible) continue;
    const domain = pane.scaleDomains[scale.scaleId];
    if (!domain) continue;
    const labelX = plotArea.x - 6;
    for (const tick of scale.ticks) {
      const y = priceToY(domain, plotArea, tick.value);
      if (y === null) continue;
      labels.push({
        x: labelX,
        y,
        text: tick.label,
        color: "#cfd3da",
        align: "right",
        baseline: "middle"
      });
    }
  }
  for (const scale of axis.right) {
    if (!scale.visible) continue;
    const domain = pane.scaleDomains[scale.scaleId];
    if (!domain) continue;
    const labelX = plotArea.x + plotArea.width + 6;
    for (const tick of scale.ticks) {
      const y = priceToY(domain, plotArea, tick.value);
      if (y === null) continue;
      labels.push({
        x: labelX,
        y,
        text: tick.label,
        color: "#cfd3da",
        align: "left",
        baseline: "middle"
      });
    }
  }

  if (isBottomPane) {
    const labelY = plotArea.y + plotArea.height - 12;
    for (const tick of xTicks) {
      const x = timeToX(pane.visibleRange, plotArea, tick.value);
      if (x === null) continue;
      labels.push({
        x,
        y: labelY,
        text: tick.label,
        color: "#cfd3da",
        align: "center",
        baseline: "top"
      });
    }
  }
}

function appendCrosshair(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  crosshair: RenderCrosshair,
  commands: DrawCommand[],
  labels: TextLabel[]
): void {
  const plotArea = pane.plotArea;
  const x = crosshair.x;
  const y = crosshair.y ?? plotArea.y;
  if (x < plotArea.x || x > plotArea.x + plotArea.width) return;
  if (crosshair.showHorizontal && (y < plotArea.y || y > plotArea.y + plotArea.height)) return;

  const start = ctx.dynamicBuffer.vertexCount;
  if (crosshair.showVertical) {
    const [vx0, vy0] = toNdc(ctx, x, plotArea.y);
    const [vx1, vy1] = toNdc(ctx, x, plotArea.y + plotArea.height);
    ctx.dynamicBuffer.pushVertex(vx0, vy0, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
    ctx.dynamicBuffer.pushVertex(vx1, vy1, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
  }
  if (crosshair.showHorizontal) {
    const [hx0, hy0] = toNdc(ctx, plotArea.x, y);
    const [hx1, hy1] = toNdc(ctx, plotArea.x + plotArea.width, y);
    ctx.dynamicBuffer.pushVertex(hx0, hy0, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
    ctx.dynamicBuffer.pushVertex(hx1, hy1, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
  }

  const count = ctx.dynamicBuffer.vertexCount - start;
  if (count > 0) {
    commands.push({ mode: glLines(ctx), first: start, count });
  }

  if (crosshair.showPriceLabel && crosshair.price != null && Number.isFinite(crosshair.price) && crosshair.showHorizontal) {
    labels.push({
      x: plotArea.x + plotArea.width + 6,
      y,
      text: formatPrice(crosshair.price),
      color: "#ffffff",
      align: "left",
      baseline: "middle",
      background: "rgba(0,0,0,0.6)",
      padding: 3
    });
  }

  if (crosshair.showTimeLabel) {
    labels.push({
      x,
      y: plotArea.y + plotArea.height - 12,
      text: formatTimestamp(crosshair.timeMs),
      color: "#ffffff",
      align: "center",
      baseline: "top",
      background: "rgba(0,0,0,0.6)",
      padding: 3
    });
  }
}
