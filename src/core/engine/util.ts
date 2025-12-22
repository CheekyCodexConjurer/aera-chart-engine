import type { Range, TimeMs } from "../../api/public-types.js";
import { clamp } from "../../util/math.js";
import type { PlotArea } from "../transform.js";

export function rangesEqual(a: Range | null, b: Range | null): boolean {
  if (!a || !b) return false;
  return a.startMs === b.startMs && a.endMs === b.endMs;
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function generateSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Math.random().toString(36).slice(2, 10)}`;
}

export function getPlatform(): string {
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    return navigator.userAgent;
  }
  return "node";
}

export function upperBound(times: Float64Array, target: TimeMs): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (times[mid] <= target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function isPointInside(plotArea: PlotArea, x: number, y: number): boolean {
  return (
    x >= plotArea.x &&
    x <= plotArea.x + plotArea.width &&
    y >= plotArea.y &&
    y <= plotArea.y + plotArea.height
  );
}

export function findExactIndex(times: Float64Array, timeMs: TimeMs): number {
  let low = 0;
  let high = times.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = times[mid];
    if (value === timeMs) return mid;
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export function findNearestIndex(times: Float64Array, timeMs: TimeMs, cutoff?: TimeMs): number | null {
  if (times.length === 0) return null;
  let low = 0;
  let high = times.length - 1;
  let maxIndex = high;
  if (cutoff !== undefined) {
    const lastIndex = upperBound(times, cutoff) - 1;
    if (lastIndex < 0) return null;
    maxIndex = Math.min(high, lastIndex);
    high = maxIndex;
  }
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = times[mid];
    if (value === timeMs) return mid;
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  const left = clamp(high, 0, maxIndex);
  const right = clamp(low, 0, maxIndex);
  const leftDiff = Math.abs(times[left] - timeMs);
  const rightDiff = Math.abs(times[right] - timeMs);
  return leftDiff <= rightDiff ? left : right;
}

export function findNearestPoint(
  points: { timeMs: TimeMs; value: number; text?: string }[],
  timeMs: TimeMs
): { timeMs: TimeMs; value: number; text?: string } | null {
  if (points.length === 0) return null;
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = points[mid].timeMs;
    if (value === timeMs) return points[mid];
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  const left = clamp(high, 0, points.length - 1);
  const right = clamp(low, 0, points.length - 1);
  const leftDiff = Math.abs(points[left].timeMs - timeMs);
  const rightDiff = Math.abs(points[right].timeMs - timeMs);
  return leftDiff <= rightDiff ? points[left] : points[right];
}

export function findNearestZone(
  points: { timeMs: TimeMs; top: number; bottom: number }[],
  timeMs: TimeMs
): { timeMs: TimeMs; top: number; bottom: number } | null {
  if (points.length === 0) return null;
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = points[mid].timeMs;
    if (value === timeMs) return points[mid];
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  const left = clamp(high, 0, points.length - 1);
  const right = clamp(low, 0, points.length - 1);
  const leftDiff = Math.abs(points[left].timeMs - timeMs);
  const rightDiff = Math.abs(points[right].timeMs - timeMs);
  return leftDiff <= rightDiff ? points[left] : points[right];
}
