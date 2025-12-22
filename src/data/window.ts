import { Range, TimeMs } from "../api/public-types.js";
import { SeriesSnapshot } from "./snapshot.js";

export type DataWindow = {
  range: Range;
  prefetchRatio: number;
};

export type IndexRange = {
  start: number;
  end: number;
};

export type SeriesWindow = {
  timeMs: Float64Array;
  fields: Record<string, Float64Array>;
  start: number;
  end: number;
};

export function rangeSpan(range: Range): number {
  return range.endMs - range.startMs;
}

export function rangeContains(outer: Range, inner: Range): boolean {
  return outer.startMs <= inner.startMs && outer.endMs >= inner.endMs;
}

export function computeDataWindow(range: Range, prefetchRatio: number): DataWindow {
  const span = range.endMs - range.startMs;
  const margin = span * prefetchRatio;
  return {
    range: {
      startMs: range.startMs - margin,
      endMs: range.endMs + margin
    },
    prefetchRatio
  };
}

function lowerBound(times: Float64Array, target: TimeMs): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (times[mid] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function upperBound(times: Float64Array, target: TimeMs): number {
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

export function findIndexRange(times: Float64Array, range: Range): IndexRange | null {
  if (times.length === 0) return null;
  const start = lowerBound(times, range.startMs);
  const end = upperBound(times, range.endMs) - 1;
  if (start > end || start >= times.length || end < 0) return null;
  return {
    start,
    end
  };
}

export function sliceSnapshot(
  snapshot: SeriesSnapshot,
  range: Range,
  cutoffTimeMs?: TimeMs
): SeriesWindow | null {
  const endMs = cutoffTimeMs !== undefined ? Math.min(range.endMs, cutoffTimeMs) : range.endMs;
  if (endMs < range.startMs) return null;
  const effective: Range = { startMs: range.startMs, endMs };
  const indices = findIndexRange(snapshot.timeMs, effective);
  if (!indices) return null;
  const timeMs = snapshot.timeMs.subarray(indices.start, indices.end + 1);
  const fields: Record<string, Float64Array> = {};
  for (const key of Object.keys(snapshot.fields)) {
    fields[key] = snapshot.fields[key].subarray(indices.start, indices.end + 1);
  }
  return {
    timeMs,
    fields,
    start: indices.start,
    end: indices.end
  };
}
