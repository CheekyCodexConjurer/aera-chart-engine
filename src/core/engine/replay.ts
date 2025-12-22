import type { Range, ReplayState, TimeMs } from "../../api/public-types.js";
import type { EngineContext } from "./context.js";
import { ensurePane, getPrimarySeries } from "./axis-layout.js";
import { recordLog } from "./diagnostics.js";
import { clampRangeToReplay } from "./replay-state.js";
import { emitVisibleRange } from "./windowing.js";

export function setReplayState(ctx: EngineContext, state: ReplayState): void {
  ctx.replayState = state;
  for (const pane of ctx.panes.values()) {
    pane.visibleRange = clampRangeToReplay(ctx, pane.visibleRange, getPrimarySeries(ctx, pane.id));
    emitVisibleRange(ctx, pane.id, pane.visibleRange);
  }
  recordLog(ctx, "info", "replay_state_changed", { state: { ...state } });
  ctx.scheduler.requestFrame();
}

export function resetToLatest(ctx: EngineContext, paneId = "price"): void {
  const pane = ensurePane(ctx, paneId);
  const series = getPrimarySeries(ctx, paneId);
  if (!series?.snapshot) return;
  const times = series.snapshot.timeMs;
  const endIndex = times.length - 1;
  const startIndex = Math.max(0, endIndex - 499);
  const range: Range = { startMs: times[startIndex], endMs: times[endIndex] };
  pane.visibleRange = clampRangeToReplay(ctx, range, series);
  emitVisibleRange(ctx, paneId, pane.visibleRange);
}

export function resetAroundAnchor(ctx: EngineContext, timeMs: TimeMs, paneId = "price"): void {
  const pane = ensurePane(ctx, paneId);
  const span = pane.visibleRange.endMs - pane.visibleRange.startMs;
  const half = span / 2;
  const range: Range = { startMs: timeMs - half, endMs: timeMs + half };
  pane.visibleRange = clampRangeToReplay(ctx, range, getPrimarySeries(ctx, paneId));
  emitVisibleRange(ctx, paneId, pane.visibleRange);
}

export function focusTime(ctx: EngineContext, timeMs: TimeMs, paneId = "price"): void {
  resetAroundAnchor(ctx, timeMs, paneId);
}

export function setVisibleRange(ctx: EngineContext, range: Range, paneId = "price"): void {
  if (range.startMs >= range.endMs) {
    ctx.diagnostics.addError("range.invalid", "visible range start must be less than end", {
      paneId,
      range
    });
    ctx.diagnosticsEmitter.emit();
    return;
  }
  const pane = ensurePane(ctx, paneId);
  pane.visibleRange = clampRangeToReplay(ctx, range, getPrimarySeries(ctx, paneId));
  emitVisibleRange(ctx, paneId, pane.visibleRange);
}
