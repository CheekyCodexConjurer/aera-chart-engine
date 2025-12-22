import type { Range, TimeMs } from "../../api/public-types.js";
import { clamp } from "../../util/math.js";
import type { SeriesState } from "../series.js";
import type { EngineContext } from "./context.js";

export function getCutoffTime(ctx: EngineContext): TimeMs | undefined {
  if (ctx.replayState.mode === "paused" || ctx.replayState.mode === "playing") {
    return ctx.replayState.cutoffTimeMs;
  }
  return undefined;
}

export function clampRangeToReplay(ctx: EngineContext, range: Range, series: SeriesState | null): Range {
  const cutoff = getCutoffTime(ctx);
  if (!cutoff) return range;
  const paddingBars = ctx.replayState.paddingBars ?? 2;
  const barInterval = series?.approxBarIntervalMs ?? 0;
  const paddingMs = barInterval * paddingBars;
  const maxEnd = cutoff + paddingMs;
  const span = range.endMs - range.startMs;
  const endMs = Math.min(range.endMs, maxEnd);
  const startMs = Math.min(range.startMs, endMs - span);
  return { startMs, endMs };
}

export function clampZoomSpan(ctx: EngineContext, span: number, series: SeriesState | null): number {
  const minSpan = Math.max(1, (series?.approxBarIntervalMs ?? 1) * 2);
  let maxSpan = Math.max(minSpan, span);
  const snapshot = series?.snapshot;
  if (snapshot && snapshot.timeMs.length > 1) {
    const fullSpan = snapshot.timeMs[snapshot.timeMs.length - 1] - snapshot.timeMs[0];
    if (Number.isFinite(fullSpan) && fullSpan > 0) {
      maxSpan = Math.max(minSpan, fullSpan);
    }
  }
  return clamp(span, minSpan, maxSpan);
}
