import type { DataWindowRequestReason, Range } from "../../api/public-types.js";
import { computeDataWindow, rangeContains, rangeSpan } from "../../data/window.js";
import type { EngineContext } from "./context.js";
import { RENDER_WINDOW_GUARD_RATIO, RENDER_WINDOW_SPAN_TOLERANCE } from "./constants.js";
import { recordLog } from "./diagnostics.js";
import { emitTransform, ensurePane, getPrimarySeries, updateScaleDomain } from "./axis-layout.js";
import type { DataWindowRequestState, PaneState } from "./state.js";
import { rangesEqual } from "./util.js";

export function emitVisibleRange(ctx: EngineContext, paneId: string, range: Range): void {
  const pane = ensurePane(ctx, paneId);
  if (!rangesEqual(pane.lastEmittedRange, range)) {
    pane.lastEmittedRange = { ...range };
    ctx.visibleRangeEmitter.emit({ paneId, range });
    emitTransform(ctx, paneId);
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
    clearCoveredRequests(pane, coverage);
    pane.lastCoverageWarningId = null;
    return;
  }
  if (pane.pendingDataWindowRequests.some((request) => rangeContains(request.range, target))) {
    return;
  }
  const reason: DataWindowRequestReason = coverage ? "coverage-gap" : "render-window";
  enqueueDataWindowRequest(ctx, pane, target, reason);
}

export function updateDataWindowCoverage(ctx: EngineContext, paneId: string): void {
  const pane = ensurePane(ctx, paneId);
  const coverage = resolveDataWindowCoverage(ctx, paneId);
  pane.dataWindowCoverage = coverage;
  if (coverage) {
    clearCoveredRequests(pane, coverage);
  }
  if (pane.pendingDataWindowRequests.length === 0) {
    pane.lastCoverageWarningId = null;
    return;
  }
  const pending = pane.pendingDataWindowRequests[pane.pendingDataWindowRequests.length - 1];
  if (!coverage || !rangeContains(coverage, pending.range)) {
    if (pane.lastCoverageWarningId !== pending.id) {
      pane.lastCoverageWarningId = pending.id;
      ctx.diagnostics.addWarn("data.window.incomplete", "data window coverage is smaller than requested", {
        paneId,
        requestId: pending.id,
        requested: { ...pending.range },
        coverage: coverage ? { ...coverage } : null
      });
      ctx.diagnosticsEmitter.emit();
    }
  }
}

export function setDataWindowCoverage(ctx: EngineContext, paneId: string, range: Range | null): void {
  const pane = ensurePane(ctx, paneId);
  if (range === null) {
    pane.dataWindowCoverageOverride = null;
    updateDataWindowCoverage(ctx, paneId);
    maybeRequestDataWindow(ctx, pane);
    return;
  }
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs) || range.endMs <= range.startMs) {
    ctx.diagnostics.addError("data.window.coverage.invalid", "data window coverage must be a valid range", {
      paneId,
      range
    });
    ctx.diagnosticsEmitter.emit();
    return;
  }
  pane.dataWindowCoverageOverride = { ...range };
  updateDataWindowCoverage(ctx, paneId);
  maybeRequestDataWindow(ctx, pane);
}

function resolveDataWindowCoverage(ctx: EngineContext, paneId: string): Range | null {
  const pane = ensurePane(ctx, paneId);
  if (pane.dataWindowCoverageOverride) {
    return { ...pane.dataWindowCoverageOverride };
  }
  const primary = getPrimarySeries(ctx, paneId);
  const snapshot = primary?.snapshot;
  if (!snapshot || snapshot.timeMs.length === 0) {
    return null;
  }
  return {
    startMs: snapshot.timeMs[0],
    endMs: snapshot.timeMs[snapshot.timeMs.length - 1]
  };
}

function enqueueDataWindowRequest(
  ctx: EngineContext,
  pane: PaneState,
  range: Range,
  reason: DataWindowRequestReason
): void {
  const maxPending = Number.isFinite(ctx.dataWindowMaxPending)
    ? Math.max(1, Math.floor(ctx.dataWindowMaxPending))
    : 1;
  if (pane.pendingDataWindowRequests.length >= maxPending) {
    const last = pane.pendingDataWindowRequests[pane.pendingDataWindowRequests.length - 1];
    const merged = mergeRanges(last.range, range);
    if (rangesEqual(last.range, merged)) {
      return;
    }
    last.range = merged;
    last.reason = "backpressure";
    last.requestedAt = ctx.frameId;
    pane.lastRequestedDataWindow = { ...merged };
    emitDataWindowRequest(ctx, pane, last);
    ctx.diagnostics.addWarn("data.window.backpressure", "data window request coalesced due to backpressure", {
      paneId: pane.id,
      requestId: last.id,
      pendingCount: pane.pendingDataWindowRequests.length,
      maxPending,
      merged: { ...merged }
    });
    ctx.diagnosticsEmitter.emit();
    return;
  }
  const request: DataWindowRequestState = {
    id: ++ctx.dataWindowRequestId,
    range: { ...range },
    reason,
    requestedAt: ctx.frameId
  };
  pane.pendingDataWindowRequests.push(request);
  pane.lastRequestedDataWindow = { ...request.range };
  emitDataWindowRequest(ctx, pane, request);
}

function emitDataWindowRequest(ctx: EngineContext, pane: PaneState, request: DataWindowRequestState): void {
  const pendingCount = pane.pendingDataWindowRequests.length;
  ctx.dataWindowEmitter.emit({
    paneId: pane.id,
    range: { ...request.range },
    prefetchRatio: ctx.prefetchRatio,
    requestId: request.id,
    reason: request.reason,
    pendingCount
  });
  recordLog(ctx, "info", "data_window_requested", {
    paneId: pane.id,
    range: { ...request.range },
    prefetchRatio: ctx.prefetchRatio,
    requestId: request.id,
    reason: request.reason,
    pendingCount
  });
}

function clearCoveredRequests(pane: PaneState, coverage: Range): void {
  pane.pendingDataWindowRequests = pane.pendingDataWindowRequests.filter(
    (request) => !rangeContains(coverage, request.range)
  );
}

function mergeRanges(a: Range, b: Range): Range {
  return {
    startMs: Math.min(a.startMs, b.startMs),
    endMs: Math.max(a.endMs, b.endMs)
  };
}
