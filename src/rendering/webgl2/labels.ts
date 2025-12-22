import type { TextLabel } from "../text-layer.js";
import type { WebGL2RendererContext } from "./context.js";
import type { LabelMetrics } from "./state.js";

export function measureLabel(ctx: WebGL2RendererContext, text: string): LabelMetrics {
  if (ctx.gpuText) {
    const metrics = ctx.gpuText.measureText(text);
    return { width: metrics.width, height: metrics.height, ascent: metrics.ascent, descent: metrics.descent };
  }
  const width = Math.max(1, text.length * 7);
  return { width, height: 12, ascent: 9, descent: 3 };
}

export function computeLabelRect(
  label: TextLabel,
  metrics: LabelMetrics,
  padding: number
): { x: number; y: number; width: number; height: number } {
  let x = label.x;
  if (label.align === "center") {
    x -= metrics.width / 2;
  } else if (label.align === "right" || label.align === "end") {
    x -= metrics.width;
  }
  let baseline = label.y;
  switch (label.baseline) {
    case "top":
      baseline = label.y + metrics.ascent;
      break;
    case "bottom":
      baseline = label.y - metrics.descent;
      break;
    case "middle":
      baseline = label.y + metrics.ascent - metrics.height / 2;
      break;
    default:
      baseline = label.y;
      break;
  }
  const x0 = x - padding;
  const y0 = baseline - metrics.ascent - padding;
  const width = metrics.width + padding * 2;
  const height = metrics.height + padding * 2;
  return { x: x0, y: y0, width, height };
}
