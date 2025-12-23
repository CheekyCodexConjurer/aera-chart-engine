import { Range, SeriesDefinition, SeriesType } from "../api/public-types.js";
import { SeriesSnapshot } from "../data/snapshot.js";
import { findIndexRange } from "../data/window.js";

export type SeriesState = SeriesDefinition & {
  paneId: string;
  scaleId: string;
  snapshot?: SeriesSnapshot;
  approxBarIntervalMs?: number;
};

export function normalizeSeries(definition: SeriesDefinition): SeriesState {
  return {
    ...definition,
    paneId: definition.paneId ?? "price",
    scaleId: definition.scaleId ?? "price"
  };
}

export function updateApproxBarInterval(series: SeriesState): void {
  const snapshot = series.snapshot;
  if (!snapshot || snapshot.timeMs.length < 2) return;
  const times = snapshot.timeMs;
  const total = times.length;
  const sampleCount = Math.min(50, total - 1);
  const step = Math.max(1, Math.floor((total - 1) / sampleCount));
  const intervals: number[] = [];
  for (let i = total - 1; i - step >= 0 && intervals.length < sampleCount; i -= step) {
    const delta = times[i] - times[i - step];
    if (Number.isFinite(delta) && delta > 0) {
      intervals.push(delta / step);
    }
  }
  if (intervals.length === 0) return;
  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median =
    intervals.length % 2 === 1 ? intervals[mid] : (intervals[mid - 1] + intervals[mid]) * 0.5;
  series.approxBarIntervalMs = Math.max(1, median);
}

export function computeSeriesDomain(series: SeriesState, range: Range): { min: number; max: number } | null {
  const snapshot = series.snapshot;
  if (!snapshot) return null;
  const times = snapshot.timeMs;
  if (times.length === 0) return null;
  const indices = findIndexRange(times, range);
  if (!indices) return null;
  const { start, end } = indices;
  if (end < start) return null;
  if (series.type === "candles") {
    const low = snapshot.fields.low;
    const high = snapshot.fields.high;
    let min = Infinity;
    let max = -Infinity;
    for (let i = start; i <= end; i += 1) {
      if (low[i] < min) min = low[i];
      if (high[i] > max) max = high[i];
    }
    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
  }
  const values = snapshot.fields.value;
  let min = Infinity;
  let max = -Infinity;
  for (let i = start; i <= end; i += 1) {
    const value = values[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

export function isCandleSeries(type: SeriesType): boolean {
  return type === "candles";
}
