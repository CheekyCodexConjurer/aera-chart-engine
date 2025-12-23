import { formatTimestamp } from "../../core/axis.js";
import { timeToX, priceToY } from "../../core/transform.js";
import { DEFAULT_AXIS, DEFAULT_CROSSHAIR, DEFAULT_GRID } from "../color.js";
import type { RenderCrosshair, RenderFrame } from "../renderer.js";
import type { TextLabel } from "../text/index.js";
import type { DrawCommand } from "../vertex-buffer.js";
import type { WebGL2RendererContext } from "./context.js";
import { formatPrice, glLines, toNdc } from "./utils.js";

export function appendGridAndAxes(
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

export function appendCrosshair(
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
