import type { SeriesData, SeriesDefinition, SeriesUpdate, SeriesUpdateType } from "../../api/public-types.js";
import { appendSnapshot, createSnapshot, patchSnapshot, prependSnapshot } from "../../data/snapshot.js";
import type { SeriesSnapshot } from "../../data/snapshot.js";
import { validateSeriesData } from "../../data/validation.js";
import { normalizeSeries, updateApproxBarInterval, type SeriesState } from "../series.js";
import type { EngineContext } from "./context.js";
import { ensurePane, ensureScale, updateScaleDomain } from "./axis-layout.js";
import { updateDataWindowCoverage, updateRenderWindow, maybeRequestDataWindow } from "./windowing.js";
import { findExactIndex } from "./util.js";

export function defineSeries(ctx: EngineContext, definition: SeriesDefinition): void {
  const normalized = normalizeSeries(definition);
  ctx.series.set(definition.id, normalized);
  ensurePane(ctx, normalized.paneId);
  ensureScale(ctx, normalized.paneId, normalized.scaleId);
  ctx.scheduler.requestFrame();
}

export function setSeriesData(
  ctx: EngineContext,
  seriesId: string,
  data: SeriesData,
  updateType: SeriesUpdateType = "replace"
): void {
  const series = ctx.series.get(seriesId);
  if (!series) {
    ctx.diagnostics.addError("series.missing", "series not defined", { seriesId });
    ctx.diagnosticsEmitter.emit();
    return;
  }
  const issues = validateSeriesData(data);
  if (issues.length > 0) {
    for (const issue of issues) {
      ctx.diagnostics.addError(issue.code, issue.message, { seriesId, ...issue.context });
    }
    ctx.diagnosticsEmitter.emit();
    return;
  }
  const snapshot = series.snapshot;
  if (snapshot && updateType !== "replace") {
    if (!validateSeriesUpdate(ctx, series, snapshot, data, updateType)) {
      return;
    }
  }
  if (!snapshot || updateType === "replace") {
    series.snapshot = createSnapshot(series.type, data, (snapshot?.version ?? 0) + 1);
  } else if (updateType === "append") {
    series.snapshot = appendSnapshot(series.type, snapshot, data);
  } else if (updateType === "prepend") {
    series.snapshot = prependSnapshot(series.type, snapshot, data);
  } else if (updateType === "patch") {
    series.snapshot = patchSnapshot(series.type, snapshot, data);
  }
  updateApproxBarInterval(series);
  updateDataWindowCoverage(ctx, series.paneId);
  const pane = ctx.panes.get(series.paneId);
  if (pane) {
    updateRenderWindow(ctx, pane, pane.visibleRange);
    maybeRequestDataWindow(ctx, pane);
  }
  updateScaleDomain(ctx, series.paneId);
  ctx.scheduler.requestFrame();
}

export function updateSeries(ctx: EngineContext, seriesId: string, update: SeriesUpdate): void {
  setSeriesData(ctx, seriesId, update.data, update.type);
}

export function removeSeries(ctx: EngineContext, seriesId: string): void {
  const paneId = ctx.series.get(seriesId)?.paneId;
  ctx.series.delete(seriesId);
  ctx.renderCache.delete(seriesId);
  ctx.renderer.removeSeries?.(seriesId);
  if (paneId) {
    updateDataWindowCoverage(ctx, paneId);
    const pane = ctx.panes.get(paneId);
    if (pane) {
      updateRenderWindow(ctx, pane, pane.visibleRange);
      maybeRequestDataWindow(ctx, pane);
    }
  }
  ctx.scheduler.requestFrame();
}

export function validateSeriesUpdate(
  ctx: EngineContext,
  series: SeriesState,
  snapshot: SeriesSnapshot,
  data: SeriesData,
  updateType: SeriesUpdateType
): boolean {
  const updateTimes = data.timeMs;
  if (updateTimes.length === 0) {
    ctx.diagnostics.addError("series.update.empty", "series update contains no points", {
      seriesId: series.id,
      paneId: series.paneId,
      updateType
    });
    ctx.diagnosticsEmitter.emit();
    return false;
  }
  if (updateType === "append") {
    const lastBase = snapshot.timeMs[snapshot.timeMs.length - 1];
    if (updateTimes[0] <= lastBase) {
      ctx.diagnostics.addError("series.update.append.order", "append update must start after the last snapshot time", {
        seriesId: series.id,
        paneId: series.paneId,
        lastSnapshotTimeMs: lastBase,
        firstUpdateTimeMs: updateTimes[0]
      });
      ctx.diagnosticsEmitter.emit();
      return false;
    }
  }
  if (updateType === "prepend") {
    const firstBase = snapshot.timeMs[0];
    const lastUpdate = updateTimes[updateTimes.length - 1];
    if (lastUpdate >= firstBase) {
      ctx.diagnostics.addError("series.update.prepend.order", "prepend update must end before the first snapshot time", {
        seriesId: series.id,
        paneId: series.paneId,
        firstSnapshotTimeMs: firstBase,
        lastUpdateTimeMs: lastUpdate
      });
      ctx.diagnosticsEmitter.emit();
      return false;
    }
  }
  if (updateType === "patch") {
    let missingCount = 0;
    const sample: number[] = [];
    for (const time of updateTimes) {
      if (findExactIndex(snapshot.timeMs, time) < 0) {
        missingCount += 1;
        if (sample.length < 3) {
          sample.push(time);
        }
      }
    }
    if (missingCount > 0) {
      ctx.diagnostics.addError(
        "series.update.patch.missing",
        "patch update contains timestamps not present in base snapshot",
        {
          seriesId: series.id,
          paneId: series.paneId,
          missingCount,
          missingSample: sample
        }
      );
      ctx.diagnosticsEmitter.emit();
      return false;
    }
  }
  return true;
}
