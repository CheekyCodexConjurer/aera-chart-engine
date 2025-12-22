import type { Range } from "../../api/public-types.js";
import { decimateCandles, decimateMinMax } from "../../data/lod.js";
import { policyForSeries, selectLod as selectLodLevel, type LodSelection } from "../../data/lod-policy.js";
import { rangeSpan, sliceSnapshot } from "../../data/window.js";
import type { RenderCrosshair, RenderFrame, RenderSeries } from "../../rendering/renderer.js";
import { clipOverlay, type OverlayRenderItem } from "../overlays.js";
import type { SeriesState } from "../series.js";
import { timeToX as toTimeX } from "../transform.js";
import type { EngineContext } from "./context.js";
import { enforceSingleScalePerSide, getOrderedPanes } from "./axis-layout.js";
import { getCutoffTime } from "./replay-state.js";
import type { PaneRenderState, PaneState } from "./state.js";
import { emitOverlayLayout } from "./overlays.js";
import { recordLog } from "./diagnostics.js";

export function renderFrame(ctx: EngineContext): void {
  ctx.frameId += 1;
  const overlays = ctx.overlays.getAll().map((overlay) => {
    return clipOverlay(overlay, getCutoffTime(ctx));
  });

  const panes: PaneRenderState[] = [];
  for (const pane of ctx.panes.values()) {
    panes.push({
      paneId: pane.id,
      plotArea: pane.plotArea,
      visibleRange: { ...pane.visibleRange },
      scaleDomains: Object.fromEntries(pane.scaleDomains.entries()),
      series: collectSeriesForPane(ctx, pane.id),
      axis: buildAxisRenderState(ctx, pane)
    });
  }

  const frame: RenderFrame = {
    frameId: ctx.frameId,
    panes,
    overlays,
    crosshairs: buildRenderCrosshairs(ctx)
  };
  ctx.renderer.render(frame);
  emitOverlayLayout(ctx, overlays);
}

export function collectSeriesForPane(ctx: EngineContext, paneId: string): RenderSeries[] {
  const result: RenderSeries[] = [];
  const pane = ctx.panes.get(paneId);
  if (!pane) return result;
  for (const series of ctx.series.values()) {
    if (series.paneId !== paneId) continue;
    const renderSeries = buildRenderSeries(ctx, series, pane);
    if (renderSeries) {
      result.push(renderSeries);
    }
  }
  return result;
}

export function buildAxisRenderState(ctx: EngineContext, pane: PaneState): PaneRenderState["axis"] {
  const left: PaneRenderState["axis"]["left"] = [];
  const right: PaneRenderState["axis"]["right"] = [];
  for (const [scaleId, config] of pane.scaleConfigs.entries()) {
    const ticks = pane.axisTicks.get(scaleId) ?? [];
    if (config.position === "left") {
      left.push({
        scaleId,
        position: "left",
        ticks,
        visible: config.visible
      });
    } else {
      right.push({
        scaleId,
        position: "right",
        ticks,
        visible: config.visible
      });
    }
  }
  const resolved = enforceSingleScalePerSide(ctx, pane, left, right);
  return {
    left: resolved.left,
    right: resolved.right,
    time: pane.timeTicks,
    primaryScaleId: pane.primaryScaleId,
    leftGutterWidth: pane.leftGutterWidth,
    rightGutterWidth: pane.rightGutterWidth
  };
}

export function buildRenderSeries(ctx: EngineContext, series: SeriesState, pane: PaneState): RenderSeries | null {
  const snapshot = series.snapshot;
  if (!snapshot) return null;
  const cutoffTime = getCutoffTime(ctx);
  const renderWindow = pane.renderWindow ?? pane.visibleRange;
  const renderRange: Range = {
    startMs: renderWindow.startMs,
    endMs: cutoffTime !== undefined ? Math.min(renderWindow.endMs, cutoffTime) : renderWindow.endMs
  };
  const visibleRange: Range = {
    startMs: pane.visibleRange.startMs,
    endMs: cutoffTime !== undefined ? Math.min(pane.visibleRange.endMs, cutoffTime) : pane.visibleRange.endMs
  };
  const visibleSlice = sliceSnapshot(snapshot, visibleRange, cutoffTime);
  if (!visibleSlice || visibleSlice.timeMs.length === 0) return null;
  const renderSlice = sliceSnapshot(snapshot, renderRange, cutoffTime);
  if (!renderSlice || renderSlice.timeMs.length === 0) return null;
  const selection = selectLod(ctx, series, pane.plotArea.width, visibleSlice.timeMs.length);
  const visibleSpan = Math.max(1, rangeSpan(visibleRange));
  const renderSpan = Math.max(visibleSpan, rangeSpan(renderRange));
  const maxPoints = Math.max(2, Math.floor(selection.maxPoints * (renderSpan / visibleSpan)));
  const cache = ctx.renderCache.get(series.id);
  if (
    cache &&
    cache.version === snapshot.version &&
    cache.windowStartMs === renderRange.startMs &&
    cache.windowEndMs === renderRange.endMs &&
    cache.maxPoints === maxPoints &&
    cache.cutoffTime === cutoffTime
  ) {
    ctx.engineMetrics.renderCacheHits += 1;
    return cache.series;
  }
  ctx.engineMetrics.renderCacheMisses += 1;

  const cutoffKey = cutoffTime ?? "none";
  const cacheKey = `${series.id}|${snapshot.version}|${renderRange.startMs}|${renderRange.endMs}|${maxPoints}|${cutoffKey}`;
  const cachedSeries = ctx.lodCache.get(cacheKey);
  if (cachedSeries) {
    ctx.engineMetrics.lodCacheHits += 1;
    ctx.renderCache.set(series.id, {
      version: snapshot.version,
      windowStartMs: renderRange.startMs,
      windowEndMs: renderRange.endMs,
      maxPoints,
      cutoffTime,
      series: cachedSeries
    });
    return cachedSeries;
  }
  ctx.engineMetrics.lodCacheMisses += 1;

  let timeMs = renderSlice.timeMs;
  let fields: Record<string, Float64Array> = {};

  if (series.type === "candles") {
    const open = renderSlice.fields.open ?? new Float64Array();
    const high = renderSlice.fields.high ?? new Float64Array();
    const low = renderSlice.fields.low ?? new Float64Array();
    const close = renderSlice.fields.close ?? new Float64Array();
    const volume = renderSlice.fields.volume ?? new Float64Array();
    const decimated = decimateCandles(timeMs, open, high, low, close, volume, maxPoints);
    timeMs = decimated.timeMs;
    fields = {
      open: decimated.open,
      high: decimated.high,
      low: decimated.low,
      close: decimated.close,
      volume: decimated.volume
    };
  } else {
    const values = renderSlice.fields.value ?? new Float64Array();
    const decimated = decimateMinMax(timeMs, values, maxPoints);
    timeMs = decimated.timeMs;
    fields = { value: decimated.values };
  }

  const renderSeries: RenderSeries = {
    id: series.id,
    type: series.type,
    paneId: series.paneId,
    scaleId: series.scaleId,
    timeMs,
    fields
  };

  ctx.renderCache.set(series.id, {
    version: snapshot.version,
    windowStartMs: renderRange.startMs,
    windowEndMs: renderRange.endMs,
    maxPoints,
    cutoffTime,
    series: renderSeries
  });
  ctx.lodCache.set(cacheKey, renderSeries);

  return renderSeries;
}

export function selectLod(ctx: EngineContext, series: SeriesState, width: number, visibleCount: number): LodSelection {
  const previous = ctx.lodState.get(series.id);
  const policy = policyForSeries(series.type, ctx.lodHysteresisRatio);
  const selection = selectLodLevel(visibleCount, width, policy, previous?.level);
  if (!previous || previous.level !== selection.level) {
    ctx.lodState.set(series.id, {
      level: selection.level,
      density: selection.density,
      pointsPerPixel: selection.pointsPerPixel
    });
    if (previous) {
      ctx.diagnostics.addInfo("lod.level.changed", "lod level changed", {
        seriesId: series.id,
        from: previous.level,
        to: selection.level,
        density: selection.density.toFixed(3),
        pointsPerPixel: selection.pointsPerPixel
      });
      ctx.diagnosticsEmitter.emit();
      recordLog(ctx, "info", "lod_level_changed", {
        seriesId: series.id,
        from: previous.level,
        to: selection.level,
        density: selection.density,
        pointsPerPixel: selection.pointsPerPixel
      });
    }
  }
  return selection;
}

export function buildRenderCrosshairs(ctx: EngineContext): RenderCrosshair[] {
  const active = ctx.crosshairState;
  if (!active) return [];
  const result: RenderCrosshair[] = [];
  const bottomPaneId = findBottomPaneId(ctx);
  result.push({
    paneId: active.paneId,
    timeMs: active.timeMs,
    x: active.screen.x,
    y: active.screen.y,
    price: active.price,
    showVertical: true,
    showHorizontal: true,
    showTimeLabel: active.paneId === bottomPaneId,
    showPriceLabel: true
  });

  if (ctx.crosshairSync) {
    for (const pane of ctx.panes.values()) {
      if (pane.id === active.paneId) continue;
      const x = toTimeX(pane.visibleRange, pane.plotArea, active.timeMs);
      if (x === null) continue;
      result.push({
        paneId: pane.id,
        timeMs: active.timeMs,
        x,
        showVertical: true,
        showHorizontal: false,
        showTimeLabel: pane.id === bottomPaneId,
        showPriceLabel: false
      });
    }
  }
  return result;
}

export function findBottomPaneId(ctx: EngineContext): string | null {
  const panes = getOrderedPanes(ctx);
  if (panes.length === 0) return null;
  let bottom = panes[0];
  let maxY = bottom.plotArea.y + bottom.plotArea.height;
  for (const pane of panes) {
    const y = pane.plotArea.y + pane.plotArea.height;
    if (y > maxY) {
      maxY = y;
      bottom = pane;
    }
  }
  return bottom.id;
}
