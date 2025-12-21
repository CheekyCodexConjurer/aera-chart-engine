import { Range } from "../api/public-types.js";
import { clamp } from "../util/math.js";

export type PlotArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScaleDomain = {
  min: number;
  max: number;
};

export function timeToX(range: Range, plotArea: PlotArea, timeMs: number): number | null {
  if (plotArea.width <= 0) return null;
  if (timeMs < range.startMs || timeMs > range.endMs) return null;
  const t = (timeMs - range.startMs) / (range.endMs - range.startMs);
  return plotArea.x + t * plotArea.width;
}

export function xToTime(range: Range, plotArea: PlotArea, x: number): number | null {
  if (plotArea.width <= 0) return null;
  if (x < plotArea.x || x > plotArea.x + plotArea.width) return null;
  const t = (x - plotArea.x) / plotArea.width;
  return range.startMs + t * (range.endMs - range.startMs);
}

export function priceToY(domain: ScaleDomain, plotArea: PlotArea, price: number): number | null {
  if (plotArea.height <= 0) return null;
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max)) return null;
  if (domain.max === domain.min) return null;
  const t = (price - domain.min) / (domain.max - domain.min);
  const clamped = clamp(t, 0, 1);
  return plotArea.y + plotArea.height - clamped * plotArea.height;
}

export function yToPrice(domain: ScaleDomain, plotArea: PlotArea, y: number): number | null {
  if (plotArea.height <= 0) return null;
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max)) return null;
  if (domain.max === domain.min) return null;
  const t = clamp((plotArea.y + plotArea.height - y) / plotArea.height, 0, 1);
  return domain.min + t * (domain.max - domain.min);
}
