import { parseColor } from "../color.js";
import type { RenderCrosshair, RenderFrame, RenderSeries } from "../renderer.js";
import type { TextLabel } from "../text/index.js";
import type { DrawCommand } from "../vertex-buffer.js";
import type { OverlayRenderItem } from "../../core/overlays.js";
import type { WebGL2RendererContext } from "./context.js";
import { uploadBuffer } from "./buffers.js";
import { drawAreaSeries, drawCandleSeries, drawHistogramSeries, drawLineSeries } from "./draw.js";
import { appendCrosshair, appendGridAndAxes } from "./frame-axes.js";
import { computeLabelRect, measureLabel } from "./labels.js";
import { recordBatchCount, recordDrawCalls, recordStateChange, resetFrameMetrics } from "./metrics.js";
import { appendOverlays } from "./overlays.js";
import { getSeriesEntry } from "./series-cache.js";
import {
  coalesceDrawCommands,
  findBottomPaneId,
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
  recordStateChange(ctx);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  recordStateChange(ctx);
  gl.enable(gl.SCISSOR_TEST);
  recordStateChange(ctx);
  ctx.clipStack.length = 0;
  const clear = ctx.resolvedTheme.background;
  gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const labels: TextLabel[] = [];
  let atlasEvictions = 0;
  const bottomPaneId = findBottomPaneId(frame.panes);
  const crosshairs = frame.crosshairs ?? [];
  for (const pane of frame.panes) {
    const isBottom = pane.paneId === bottomPaneId;
    const paneCrosshairs = crosshairs.filter((item) => item.paneId === pane.paneId);
    labels.push(...renderPane(ctx, gl, pane, frame.overlays, isBottom, paneCrosshairs));
  }

  const hasLabels = labels.length > 0;
  const textLayer = ctx.options.textLayer;
  if (ctx.textMode === "gpu" && !ctx.gpuText) {
    ctx.textMode = textLayer ? "canvas" : "none";
  }
  if (ctx.textMode === "canvas" && !textLayer) {
    ctx.textMode = ctx.gpuText ? "gpu" : "none";
  }
  if (ctx.textMode === "gpu" && ctx.gpuText && hasLabels) {
    const atlasCheck = ctx.gpuText.canRender(labels);
    if (!atlasCheck.ok) {
      if (!ctx.warnedTextAtlasFull) {
        ctx.options.onError?.(
          `GPU text atlas full (glyphs=${atlasCheck.glyphs} capacity=${atlasCheck.capacity} missing=${atlasCheck.missing}); falling back`
        );
        ctx.warnedTextAtlasFull = true;
      }
      atlasEvictions += 1;
      ctx.textMode = textLayer ? "canvas" : "none";
    }
  }
  if (ctx.lastTextMode !== ctx.textMode && ctx.lastTextMode === "canvas" && textLayer) {
    textLayer.clear();
  }
  ctx.lastTextMode = ctx.textMode;

  if (ctx.textMode === "canvas" && textLayer) {
    textLayer.clear();
    for (const label of labels) {
      textLayer.drawLabel(label);
    }
  } else if (ctx.textMode === "gpu" && ctx.gpuText) {
    if (hasLabels) {
      renderLabelBackgrounds(ctx, labels);
      ctx.gpuText.render(labels);
      recordDrawCalls(ctx, 1);
      recordBatchCount(ctx, 1);
      recordStateChange(ctx, 4);
    }
  } else if (hasLabels && !ctx.warnedMissingTextLayer && !ctx.warnedTextAtlasFull) {
    ctx.options.onError?.("Label overlays skipped: text renderer not configured");
    ctx.warnedMissingTextLayer = true;
  }

  if (ctx.gpuText) {
    ctx.metrics.textAtlas = ctx.gpuText.getMetrics();
  } else {
    ctx.metrics.textAtlas = { pages: 0, glyphs: 0, capacity: 0, occupancy: 0, evictions: 0 };
  }
  if (atlasEvictions > 0) {
    ctx.metrics.textAtlas.evictions += atlasEvictions;
  }

  gl.disable(gl.SCISSOR_TEST);
  recordStateChange(ctx);
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
  recordStateChange(ctx);
  gl.bindVertexArray(ctx.dynamicVao);
  recordStateChange(ctx);
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.dynamicVbo);
  recordStateChange(ctx);
  uploadBuffer(ctx, gl, ctx.dynamicGpuBuffer, data, gl.DYNAMIC_DRAW);
  for (const command of optimized) {
    gl.drawArrays(command.mode, command.first, command.count);
  }
  recordDrawCalls(ctx, optimized.length);
  recordBatchCount(ctx, optimized.length);
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
  recordStateChange(ctx);
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
