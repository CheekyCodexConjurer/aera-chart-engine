import type { Range } from "../../api/public-types.js";
import { computeDataWindow, rangeContains, rangeSpan } from "../../data/window.js";
import type { EngineContext } from "./context.js";
import { RENDER_WINDOW_GUARD_RATIO, RENDER_WINDOW_SPAN_TOLERANCE } from "./constants.js";
import { recordLog } from "./diagnostics.js";
import { ensurePane, getPrimarySeries, updateScaleDomain } from "./axis-layout.js";
import type { PaneState } from "./state.js";
import { rangesEqual } from "./util.js";

export function emitVisibleRange(ctx: EngineContext, paneId: string, range: Range): void {
  const pane = ensurePane(ctx, paneId);
  if (!rangesEqual(pane.lastEmittedRange, range)) {
    pane.lastEmittedRange = { ...range };
    ctx.visibleRangeEmitter.emit({ paneId, range });
    ctx.transformEmitter.emit({ paneId });
    recordLog(ctx, "info", "visible_range_changed", { paneId, range: { ...range } });
  }
  updateRenderWindow(ctx, pane, range);
  maybeRequestDataWindow(ctx, pane);
  updateScaleDomain(ctx, paneId);
  ctx.scheduler.requestFrame();
}

export function updateRenderWindow(ctx: EngineContext, pane: PaneState, range: Range): void {
  if (!shouldUpdateRenderWindow(ctx, pane, range)) return;
  const dataWindow = computeDataWindow(range, ctx.prefetchRatio);
  const previous = pane.renderWindow ? { ...pane.renderWindow } : null;
  pane.renderWindow = { ...dataWindow.range };
  if (!rangesEqual(previous, pane.renderWindow)) {
    recordLog(ctx, "info", "render_window_shifted", {
      paneId: pane.id,
      previous,
      next: { ...pane.renderWindow }
    });
  }
}

export function shouldUpdateRenderWindow(ctx: EngineContext, pane: PaneState, range: Range): boolean {
  const renderWindow = pane.renderWindow;
  if (!renderWindow) return true;
  const renderSpan = rangeSpan(renderWindow);
  if (!Number.isFinite(renderSpan) || renderSpan <= 0) return true;
  const ratio = 1 + 2 * ctx.prefetchRatio;
  const baseSpan = ratio > 0 ? renderSpan / ratio : renderSpan;
  if (!Number.isFinite(baseSpan) || baseSpan <= 0) return true;
  const span = rangeSpan(range);
  if (Math.abs(span - baseSpan) > baseSpan * RENDER_WINDOW_SPAN_TOLERANCE) return true;
  if (!rangeContains(renderWindow, range)) return true;
  const margin = baseSpan * ctx.prefetchRatio;
  const guard = margin * RENDER_WINDOW_GUARD_RATIO;
  if (guard <= 0) return false;
  if (range.startMs <= renderWindow.startMs + guard) return true;
  if (range.endMs >= renderWindow.endMs - guard) return true;
  return false;
}

export function maybeRequestDataWindow(ctx: EngineContext, pane: PaneState): void {
  const target = pane.renderWindow ?? pane.visibleRange;
  const coverage = pane.dataWindowCoverage;
  if (coverage && rangeContains(coverage, target)) {
    if (pane.pendingDataWindow && rangeContains(coverage, pane.pendingDataWindow)) {
      pane.pendingDataWindow = null;
    }
    pane.lastCoverageWarning = null;
    return;
  }
  if (pane.pendingDataWindow && rangeContains(pane.pendingDataWindow, target)) {
    return;
  }
  if (!rangesEqual(pane.lastRequestedDataWindow, target)) {
    pane.lastRequestedDataWindow = { ...target };
    pane.pendingDataWindow = { ...target };
    ctx.dataWindowEmitter.emit({ paneId: pane.id, range: target, prefetchRatio: ctx.prefetchRatio });
    recordLog(ctx, "info", "data_window_requested", {
      paneId: pane.id,
      range: { ...target },
      prefetchRatio: ctx.prefetchRatio
    });
  }
}

export function updateDataWindowCoverage(ctx: EngineContext, paneId: string): void {
  const pane = ensurePane(ctx, paneId);
  const primary = getPrimarySeries(ctx, paneId);
  const snapshot = primary?.snapshot;
  if (!snapshot || snapshot.timeMs.length === 0) {
    pane.dataWindowCoverage = null;
    return;
  }
  const coverage: Range = {
    startMs: snapshot.timeMs[0],
    endMs: snapshot.timeMs[snapshot.timeMs.length - 1]
  };
  pane.dataWindowCoverage = coverage;
  if (!pane.pendingDataWindow) return;
  if (rangeContains(coverage, pane.pendingDataWindow)) {
    pane.pendingDataWindow = null;
    pane.lastCoverageWarning = null;
    return;
  }
  if (!rangesEqual(pane.lastCoverageWarning, pane.pendingDataWindow)) {
    pane.lastCoverageWarning = { ...pane.pendingDataWindow };
    ctx.diagnostics.addWarn("data.window.incomplete", "data window coverage is smaller than requested", {
      paneId,
      requested: { ...pane.pendingDataWindow },
      coverage: { ...coverage }
    });
    ctx.diagnosticsEmitter.emit();
  }
}
