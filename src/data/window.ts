import { Range } from "../api/public-types.js";

export type DataWindow = {
  range: Range;
  prefetchRatio: number;
};

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
