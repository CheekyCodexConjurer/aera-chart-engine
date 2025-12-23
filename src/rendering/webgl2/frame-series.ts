import { timeToX, priceToY } from "../../core/transform.js";
import {
  DEFAULT_DOWN_CANDLE,
  DEFAULT_UP_CANDLE,
  colorFromId,
  withAlpha
} from "../color.js";
import type { RenderFrame, RenderSeries } from "../renderer.js";
import type { DrawCommand } from "../vertex-buffer.js";
import type { Range } from "../../api/public-types.js";
import type { WebGL2RendererContext } from "./context.js";
import { computeBarWidth, glLineStrip, glLines, glTriangles, toNdc } from "./utils.js";

export function appendSeries(
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
