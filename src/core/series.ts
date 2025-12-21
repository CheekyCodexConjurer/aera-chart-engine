import { Range, SeriesDefinition, SeriesType } from "../api/public-types.js";
import { SeriesSnapshot } from "../data/snapshot.js";

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
  const last = snapshot.timeMs[snapshot.timeMs.length - 1];
  const prev = snapshot.timeMs[snapshot.timeMs.length - 2];
  series.approxBarIntervalMs = Math.max(1, last - prev);
}

function findRangeIndices(times: Float64Array, range: Range): { start: number; end: number } {
  let start = 0;
  let end = times.length - 1;
  while (start < times.length && times[start] < range.startMs) start += 1;
  while (end >= 0 && times[end] > range.endMs) end -= 1;
  return { start, end };
}

export function computeSeriesDomain(series: SeriesState, range: Range): { min: number; max: number } | null {
  const snapshot = series.snapshot;
  if (!snapshot) return null;
  const times = snapshot.timeMs;
  if (times.length === 0) return null;
  const { start, end } = findRangeIndices(times, range);
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
