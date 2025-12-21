import { CandleSeriesData, LineSeriesData, SeriesData, SeriesType } from "../api/public-types.js";

export type SeriesSnapshot = {
  timeMs: Float64Array;
  fields: Record<string, Float64Array>;
  version: number;
};

export function createSnapshot(type: SeriesType, data: SeriesData, version: number): SeriesSnapshot {
  const timeMs = Float64Array.from(data.timeMs);
  if (type === "candles") {
    const candle = data as CandleSeriesData;
    return {
      timeMs,
      fields: {
        open: Float64Array.from(candle.open),
        high: Float64Array.from(candle.high),
        low: Float64Array.from(candle.low),
        close: Float64Array.from(candle.close),
        volume: candle.volume ? Float64Array.from(candle.volume) : new Float64Array()
      },
      version
    };
  }

  const line = data as LineSeriesData;
  return {
    timeMs,
    fields: { value: Float64Array.from(line.value) },
    version
  };
}

function concatArrays(a: Float64Array, b: Float64Array): Float64Array {
  const result = new Float64Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

export function appendSnapshot(type: SeriesType, base: SeriesSnapshot, data: SeriesData): SeriesSnapshot {
  const update = createSnapshot(type, data, base.version + 1);
  const fields: Record<string, Float64Array> = {};
  for (const key of Object.keys(base.fields)) {
    const baseField = base.fields[key];
    const updateField = update.fields[key] ?? new Float64Array();
    fields[key] = concatArrays(baseField, updateField);
  }
  return {
    timeMs: concatArrays(base.timeMs, update.timeMs),
    fields,
    version: update.version
  };
}

export function prependSnapshot(type: SeriesType, base: SeriesSnapshot, data: SeriesData): SeriesSnapshot {
  const update = createSnapshot(type, data, base.version + 1);
  const fields: Record<string, Float64Array> = {};
  for (const key of Object.keys(base.fields)) {
    const baseField = base.fields[key];
    const updateField = update.fields[key] ?? new Float64Array();
    fields[key] = concatArrays(updateField, baseField);
  }
  return {
    timeMs: concatArrays(update.timeMs, base.timeMs),
    fields,
    version: update.version
  };
}

function binarySearch(times: Float64Array, target: number): number {
  let low = 0;
  let high = times.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = times[mid];
    if (value === target) return mid;
    if (value < target) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export function patchSnapshot(type: SeriesType, base: SeriesSnapshot, data: SeriesData): SeriesSnapshot {
  const update = createSnapshot(type, data, base.version + 1);
  const fields: Record<string, Float64Array> = {};
  for (const key of Object.keys(base.fields)) {
    fields[key] = Float64Array.from(base.fields[key]);
  }
  for (let i = 0; i < update.timeMs.length; i += 1) {
    const time = update.timeMs[i];
    const index = binarySearch(base.timeMs, time);
    if (index >= 0) {
      for (const key of Object.keys(fields)) {
        const updateField = update.fields[key];
        if (updateField && updateField.length > 0) {
          fields[key][index] = updateField[i];
        }
      }
    }
  }
  return {
    timeMs: Float64Array.from(base.timeMs),
    fields,
    version: update.version
  };
}
