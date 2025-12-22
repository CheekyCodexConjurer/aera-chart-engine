import type { ReproBundle, SeriesData } from "../../api/public-types.js";
import type { SeriesSnapshot } from "../../data/snapshot.js";
import { OverlayStore } from "../overlays.js";
import type { SeriesState } from "../series.js";
import { ENGINE_CONTRACT_VERSION, ENGINE_VERSION, REPRO_BUNDLE_VERSION } from "../version.js";
import type { EngineContext } from "./context.js";
import { getMetrics } from "./diagnostics.js";
import { getPlatform } from "./util.js";
import { defineSeries, setSeriesData } from "./series.js";
import { setOverlays } from "./overlays.js";
import { setReplayState, setVisibleRange } from "./replay.js";
import { setPaneLayout, setScaleConfig, setScaleDomain, setTimeAxisConfig, setViewportSize } from "./axis-layout.js";
import { flushPendingCrosshairMove } from "./interaction.js";

export function captureReproBundle(ctx: EngineContext): ReproBundle {
  const panes = Array.from(ctx.panes.values()).map((pane) => {
    const scales = Array.from(pane.scaleConfigs.entries()).map(([scaleId, config]) => {
      const domain = pane.scaleDomains.get(scaleId);
      return {
        scaleId,
        position: config.position,
        visible: config.visible,
        tickCount: config.tickCount,
        autoScale: pane.autoScale.get(scaleId) ?? true,
        domain: domain ? { min: domain.min, max: domain.max } : undefined
      };
    });
    return {
      paneId: pane.id,
      layoutWeight: pane.layoutWeight,
      visibleRange: { ...pane.visibleRange },
      renderWindow: pane.renderWindow ? { ...pane.renderWindow } : null,
      primaryScaleId: pane.primaryScaleId,
      scales
    };
  });

  const seriesSnapshots = Array.from(ctx.series.values())
    .filter((series) => series.snapshot)
    .map((series) => {
      const snapshot = series.snapshot!;
      return {
        definition: {
          id: series.id,
          type: series.type,
          paneId: series.paneId,
          scaleId: series.scaleId
        },
        data: snapshotToSeriesData(series.type, snapshot),
        version: snapshot.version
      };
    });

  return {
    bundleFormatVersion: REPRO_BUNDLE_VERSION,
    meta: {
      engineVersion: ENGINE_VERSION,
      engineContractVersion: ENGINE_CONTRACT_VERSION,
      timestamp: new Date().toISOString(),
      sessionId: ctx.sessionId,
      chartId: ctx.chartId,
      platform: getPlatform()
    },
    options: snapshotOptions(ctx),
    view: {
      panes,
      replayState: { ...ctx.replayState }
    },
    inputs: {
      series: seriesSnapshots,
      overlays: ctx.overlays.getBatches()
    },
    events: ctx.logStore.getAll(),
    diagnostics: ctx.diagnostics.getAll(),
    metrics: getMetrics(ctx)
  };
}

export function applyReproBundle(ctx: EngineContext, bundle: ReproBundle): void {
  const oldSeries = Array.from(ctx.series.keys());
  for (const seriesId of oldSeries) {
    ctx.renderer.removeSeries?.(seriesId);
  }
  ctx.series.clear();
  ctx.renderCache.clear();
  ctx.lodCache.clear();
  ctx.lodState.clear();
  ctx.overlays = new OverlayStore();
  ctx.panes.clear();
  ctx.paneOrderCounter = 0;

  const options = bundle.options;
  const width = options.width ?? ctx.width;
  const height = options.height ?? ctx.height;
  const dpr = options.devicePixelRatio ?? ctx.devicePixelRatio;
  setViewportSize(ctx, width, height, dpr);

  if (options.timeAxisConfig) {
    setTimeAxisConfig(ctx, options.timeAxisConfig);
  }

  if (bundle.view.panes.length > 0) {
    setPaneLayout(ctx, bundle.view.panes.map((pane) => ({ paneId: pane.paneId, weight: pane.layoutWeight })));
  }

  for (const series of bundle.inputs.series) {
    defineSeries(ctx, series.definition);
    setSeriesData(ctx, series.definition.id, series.data, "replace");
  }

  for (const pane of bundle.view.panes) {
    for (const scale of pane.scales) {
      setScaleConfig(ctx, pane.paneId, scale.scaleId, {
        position: scale.position,
        visible: scale.visible,
        tickCount: scale.tickCount
      });
      if (scale.autoScale === false && scale.domain) {
        setScaleDomain(ctx, pane.paneId, scale.scaleId, scale.domain);
      }
    }
  }

  setReplayState(ctx, bundle.view.replayState);
  for (const pane of bundle.view.panes) {
    setVisibleRange(ctx, pane.visibleRange, pane.paneId);
  }

  for (const batch of bundle.inputs.overlays) {
    setOverlays(ctx, batch);
  }

  ctx.scheduler.flush();
  flushPendingCrosshairMove(ctx);
}

export function snapshotOptions(ctx: EngineContext): ReproBundle["options"] {
  return {
    width: ctx.width,
    height: ctx.height,
    devicePixelRatio: ctx.devicePixelRatio,
    rightGutterWidth: ctx.baseRightGutterWidth,
    leftGutterWidth: ctx.baseLeftGutterWidth,
    axisLabelCharWidth: ctx.axisLabelCharWidth,
    axisLabelPadding: ctx.axisLabelPadding,
    axisLabelHeight: ctx.axisLabelHeight,
    prefetchRatio: ctx.prefetchRatio,
    paneGap: ctx.paneGap,
    hitTestRadiusPx: ctx.hitTestRadiusPx,
    lodHysteresisRatio: ctx.lodHysteresisRatio,
    lodCacheEntries: ctx.lodCacheEntries,
    crosshairSync: ctx.crosshairSync,
    keyboardPanFraction: ctx.keyboardPanFraction,
    keyboardZoomFactor: ctx.keyboardZoomFactor,
    timeAxisConfig: ctx.timeAxisConfig.tickCount !== undefined ? { tickCount: ctx.timeAxisConfig.tickCount } : undefined,
    chartId: ctx.chartId,
    sessionId: ctx.sessionId,
    logEventLimit: ctx.logEventLimit
  };
}

export function snapshotToSeriesData(type: SeriesState["type"], snapshot: SeriesSnapshot): SeriesData {
  const timeMs = Array.from(snapshot.timeMs);
  if (type === "candles") {
    const open = Array.from(snapshot.fields.open ?? []);
    const high = Array.from(snapshot.fields.high ?? []);
    const low = Array.from(snapshot.fields.low ?? []);
    const close = Array.from(snapshot.fields.close ?? []);
    const volumeArray = snapshot.fields.volume ?? new Float64Array();
    const volume = volumeArray.length > 0 ? Array.from(volumeArray) : undefined;
    return { timeMs, open, high, low, close, volume };
  }
  const value = Array.from(snapshot.fields.value ?? []);
  return { timeMs, value };
}
