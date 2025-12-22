import type { Range } from "../../api/public-types.js";
import type { RenderFrame } from "../renderer.js";
import type { DrawCommand } from "../vertex-buffer.js";
import type { WebGL2RendererContext } from "./context.js";

export function clampTime(range: Range, time: number): number {
  return Math.min(Math.max(time, range.startMs), range.endMs);
}

export function formatPrice(value: number): string {
  const abs = Math.abs(value);
  let decimals = 2;
  if (abs < 1) decimals = 6;
  else if (abs < 100) decimals = 4;
  return value.toFixed(decimals);
}

export function coalesceDrawCommands(commands: DrawCommand[]): DrawCommand[] {
  if (commands.length <= 1) return commands;
  const result: DrawCommand[] = [];
  let current = { ...commands[0] };
  for (let i = 1; i < commands.length; i += 1) {
    const next = commands[i];
    if (next.mode === current.mode && next.first === current.first + current.count) {
      current.count += next.count;
    } else {
      result.push(current);
      current = { ...next };
    }
  }
  result.push(current);
  return result;
}

export function toNdc(ctx: WebGL2RendererContext, x: number, y: number): [number, number] {
  const nx = (x / ctx.width) * 2 - 1;
  const ny = 1 - (y / ctx.height) * 2;
  return [nx, ny];
}

export function computeBarWidth(pane: RenderFrame["panes"][number], count: number): number {
  const safeCount = Math.max(1, count);
  const spacing = pane.plotArea.width / safeCount;
  return Math.max(1, spacing * 0.7);
}

export function findBottomPaneId(panes: RenderFrame["panes"]): string | null {
  if (panes.length === 0) return null;
  let bottom = panes[0];
  let maxY = bottom.plotArea.y + bottom.plotArea.height;
  for (const pane of panes) {
    const y = pane.plotArea.y + pane.plotArea.height;
    if (y > maxY) {
      maxY = y;
      bottom = pane;
    }
  }
  return bottom.paneId;
}

export function applyScissor(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  plotArea: RenderFrame["panes"][number]["plotArea"]
): void {
  const x = Math.floor(plotArea.x * ctx.dpr);
  const y = Math.floor((ctx.height - (plotArea.y + plotArea.height)) * ctx.dpr);
  const w = Math.floor(plotArea.width * ctx.dpr);
  const h = Math.floor(plotArea.height * ctx.dpr);
  gl.scissor(x, y, w, h);
}

export function glLineStrip(ctx: WebGL2RendererContext): number {
  return ctx.gl ? ctx.gl.LINE_STRIP : 0;
}

export function glLines(ctx: WebGL2RendererContext): number {
  return ctx.gl ? ctx.gl.LINES : 0;
}

export function glTriangles(ctx: WebGL2RendererContext): number {
  return ctx.gl ? ctx.gl.TRIANGLES : 0;
}
