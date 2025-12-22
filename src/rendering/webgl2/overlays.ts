import {
  AreaOverlayData,
  HistogramOverlayData,
  HLineOverlayData,
  LabelOverlayData,
  LineOverlayData,
  MarkerOverlayData,
  OverlayPrimitive,
  ZoneOverlayData
} from "../../api/public-types.js";
import { OverlayRenderItem } from "../../core/overlays.js";
import { timeToX, priceToY } from "../../core/transform.js";
import { DEFAULT_OVERLAY, DEFAULT_OVERLAY_FILL, colorFromId, withAlpha } from "../color.js";
import type { RenderFrame } from "../renderer.js";
import type { TextLabel } from "../text/index.js";
import type { DrawCommand } from "../vertex-buffer.js";
import type { WebGL2RendererContext } from "./context.js";
import { clampTime, computeBarWidth, glLineStrip, glLines, glTriangles, toNdc } from "./utils.js";

export function appendOverlays(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  overlays: OverlayRenderItem[],
  commands: DrawCommand[],
  labels: TextLabel[]
): void {
  const sorted = overlays.slice().sort((a, b) => {
    const zA = a.overlay.zIndex ?? 0;
    const zB = b.overlay.zIndex ?? 0;
    return zA - zB;
  });
  for (const item of sorted) {
    const overlay = item.overlay;
    const scaleId = overlay.scaleId ?? "price";
    const domain = pane.scaleDomains[scaleId] ?? pane.scaleDomains.price;
    if (!domain) continue;
    switch (overlay.type) {
      case "line":
        appendOverlayLine(ctx, pane, overlay, item.clippedData as LineOverlayData, commands);
        break;
      case "area":
        appendOverlayArea(ctx, pane, overlay, item.clippedData as AreaOverlayData, commands);
        break;
      case "histogram":
        appendOverlayHistogram(ctx, pane, overlay, item.clippedData as HistogramOverlayData, commands);
        break;
      case "hline":
        appendOverlayHLine(ctx, pane, overlay, item.clippedData as HLineOverlayData, commands);
        break;
      case "zone":
        appendOverlayZone(ctx, pane, overlay, item.clippedData as ZoneOverlayData, commands);
        break;
      case "marker":
        appendOverlayMarkers(ctx, pane, overlay, item.clippedData as MarkerOverlayData, commands);
        break;
      case "label":
        appendOverlayLabels(ctx, pane, overlay, item.clippedData as LabelOverlayData, labels);
        break;
      default:
        break;
    }
  }
}

function appendOverlayLine(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  overlay: OverlayPrimitive,
  data: LineOverlayData,
  commands: DrawCommand[]
): void {
  const range = pane.visibleRange;
  const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
  if (!domain) return;
  const color = colorFromId(overlay.id, 1);
  const start = ctx.dynamicBuffer.vertexCount;
  let prevX: number | null = null;
  let prevY: number | null = null;
  for (const point of data.points) {
    const x = timeToX(range, pane.plotArea, point.timeMs);
    const y = priceToY(domain, pane.plotArea, point.value);
    if (x === null || y === null) continue;
    if (data.step && prevX !== null && prevY !== null) {
      const [sx, sy] = toNdc(ctx, x, prevY);
      ctx.dynamicBuffer.pushVertex(sx, sy, color[0], color[1], color[2], color[3]);
    }
    const [nx, ny] = toNdc(ctx, x, y);
    ctx.dynamicBuffer.pushVertex(nx, ny, color[0], color[1], color[2], color[3]);
    prevX = x;
    prevY = y;
  }
  const count = ctx.dynamicBuffer.vertexCount - start;
  if (count > 1) {
    commands.push({ mode: glLineStrip(ctx), first: start, count });
  }
}

function appendOverlayArea(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  overlay: OverlayPrimitive,
  data: AreaOverlayData,
  commands: DrawCommand[]
): void {
  const range = pane.visibleRange;
  const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
  if (!domain) return;
  const baseValue =
    data.baseValue !== undefined ? data.baseValue : domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
  const baseY = priceToY(domain, pane.plotArea, baseValue);
  if (baseY === null) return;
  const fillColor = withAlpha(colorFromId(overlay.id, 1), 0.2);
  let prevX: number | null = null;
  let prevY: number | null = null;
  for (const point of data.points) {
    const x = timeToX(range, pane.plotArea, point.timeMs);
    const y = priceToY(domain, pane.plotArea, point.value);
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
  appendOverlayLine(ctx, pane, overlay, { points: data.points, step: data.step }, commands);
}

function appendOverlayHistogram(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  overlay: OverlayPrimitive,
  data: HistogramOverlayData,
  commands: DrawCommand[]
): void {
  const range = pane.visibleRange;
  const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
  if (!domain) return;
  const baseValue =
    data.baseValue !== undefined ? data.baseValue : domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
  const baseY = priceToY(domain, pane.plotArea, baseValue);
  if (baseY === null) return;
  const color = colorFromId(overlay.id, 1);
  const barWidth = computeBarWidth(pane, data.points.length);
  for (const point of data.points) {
    const x = timeToX(range, pane.plotArea, point.timeMs);
    const y = priceToY(domain, pane.plotArea, point.value);
    if (x === null || y === null) continue;
    const left = x - barWidth * 0.5;
    const right = x + barWidth * 0.5;
    const top = Math.min(y, baseY);
    const bottom = Math.max(y, baseY);
    const [lx, ty] = toNdc(ctx, left, top);
    const [rx, by] = toNdc(ctx, right, bottom);
    const start = ctx.dynamicBuffer.vertexCount;
    ctx.dynamicBuffer.pushVertex(lx, ty, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(rx, by, color[0], color[1], color[2], color[3]);
    const count = ctx.dynamicBuffer.vertexCount - start;
    if (count > 0) {
      commands.push({ mode: glTriangles(ctx), first: start, count });
    }
  }
}

function appendOverlayHLine(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  overlay: OverlayPrimitive,
  data: HLineOverlayData,
  commands: DrawCommand[]
): void {
  const range = pane.visibleRange;
  const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
  if (!domain) return;
  const y = priceToY(domain, pane.plotArea, data.value);
  if (y === null) return;
  const startTime = data.fromTimeMs ?? range.startMs;
  const endTime = data.toTimeMs ?? range.endMs;
  const x0 = timeToX(range, pane.plotArea, clampTime(range, startTime));
  const x1 = timeToX(range, pane.plotArea, clampTime(range, endTime));
  if (x0 === null || x1 === null) return;
  const color = DEFAULT_OVERLAY;
  const start = ctx.dynamicBuffer.vertexCount;
  const [nx0, ny] = toNdc(ctx, x0, y);
  const [nx1, ny1] = toNdc(ctx, x1, y);
  ctx.dynamicBuffer.pushVertex(nx0, ny, color[0], color[1], color[2], color[3]);
  ctx.dynamicBuffer.pushVertex(nx1, ny1, color[0], color[1], color[2], color[3]);
  const count = ctx.dynamicBuffer.vertexCount - start;
  if (count > 0) {
    commands.push({ mode: glLines(ctx), first: start, count });
  }
}

function appendOverlayZone(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  overlay: OverlayPrimitive,
  data: ZoneOverlayData,
  commands: DrawCommand[]
): void {
  const range = pane.visibleRange;
  const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
  if (!domain) return;
  const fill = DEFAULT_OVERLAY_FILL;
  let prev: ZoneOverlayData["points"][number] | null = null;
  for (const point of data.points) {
    if (prev) {
      const x0 = timeToX(range, pane.plotArea, prev.timeMs);
      const x1 = timeToX(range, pane.plotArea, point.timeMs);
      if (x0 === null || x1 === null) {
        prev = point;
        continue;
      }
      const top0 = priceToY(domain, pane.plotArea, prev.top);
      const bot0 = priceToY(domain, pane.plotArea, prev.bottom);
      const top1 = priceToY(domain, pane.plotArea, point.top);
      const bot1 = priceToY(domain, pane.plotArea, point.bottom);
      if (top0 === null || bot0 === null || top1 === null || bot1 === null) {
        prev = point;
        continue;
      }
      const [x0t, y0t] = toNdc(ctx, x0, top0);
      const [x0b, y0b] = toNdc(ctx, x0, bot0);
      const [x1t, y1t] = toNdc(ctx, x1, top1);
      const [x1b, y1b] = toNdc(ctx, x1, bot1);
      const start = ctx.dynamicBuffer.vertexCount;
      ctx.dynamicBuffer.pushVertex(x0t, y0t, fill[0], fill[1], fill[2], fill[3]);
      ctx.dynamicBuffer.pushVertex(x0b, y0b, fill[0], fill[1], fill[2], fill[3]);
      ctx.dynamicBuffer.pushVertex(x1t, y1t, fill[0], fill[1], fill[2], fill[3]);
      ctx.dynamicBuffer.pushVertex(x1t, y1t, fill[0], fill[1], fill[2], fill[3]);
      ctx.dynamicBuffer.pushVertex(x0b, y0b, fill[0], fill[1], fill[2], fill[3]);
      ctx.dynamicBuffer.pushVertex(x1b, y1b, fill[0], fill[1], fill[2], fill[3]);
      const count = ctx.dynamicBuffer.vertexCount - start;
      if (count > 0) {
        commands.push({ mode: glTriangles(ctx), first: start, count });
      }
    }
    prev = point;
  }
}

function appendOverlayMarkers(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  overlay: OverlayPrimitive,
  data: MarkerOverlayData,
  commands: DrawCommand[]
): void {
  const range = pane.visibleRange;
  const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
  if (!domain) return;
  const color = colorFromId(overlay.id, 1);
  const start = ctx.dynamicBuffer.vertexCount;
  const size = 6;
  for (const point of data.points) {
    const x = timeToX(range, pane.plotArea, point.timeMs);
    const y = priceToY(domain, pane.plotArea, point.value);
    if (x === null || y === null) continue;
    const [nx0, ny0] = toNdc(ctx, x - size, y);
    const [nx1, ny1] = toNdc(ctx, x + size, y);
    const [nx2, ny2] = toNdc(ctx, x, y - size);
    const [nx3, ny3] = toNdc(ctx, x, y + size);
    ctx.dynamicBuffer.pushVertex(nx0, ny0, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(nx1, ny1, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(nx2, ny2, color[0], color[1], color[2], color[3]);
    ctx.dynamicBuffer.pushVertex(nx3, ny3, color[0], color[1], color[2], color[3]);
  }
  const count = ctx.dynamicBuffer.vertexCount - start;
  if (count > 0) {
    commands.push({ mode: glLines(ctx), first: start, count });
  }
}

function appendOverlayLabels(
  ctx: WebGL2RendererContext,
  pane: RenderFrame["panes"][number],
  overlay: OverlayPrimitive,
  data: LabelOverlayData,
  labels: TextLabel[]
): void {
  const range = pane.visibleRange;
  const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
  if (!domain) return;
  for (const point of data.points) {
    const x = timeToX(range, pane.plotArea, point.timeMs);
    const y = priceToY(domain, pane.plotArea, point.value);
    if (x === null || y === null) continue;
    labels.push({
      x,
      y,
      text: point.text,
      color: "#ffffff",
      align: "left",
      baseline: "middle"
    });
  }
}
