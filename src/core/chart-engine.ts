import {
  AxisLabelMeasure,
  ChartEngineOptions,
  CrosshairEvent,
  DataWindowRequestEvent,
  Diagnostic,
  EngineMetricsSnapshot,
  HitTestEvent,
  KeyCommand,
  LayoutChangeEvent,
  LogEvent,
  LogLevel,
  OverlayBatch,
  OverlayLayoutEvent,
  OverlayLayoutItem,
  PaneLayout,
  Range,
  ReproBundle,
  ScaleConfig,
  RightLabelOverlayData,
  ReplayState,
  SeriesHit,
  SeriesData,
  SeriesDefinition,
  OverlayHit,
  SeriesUpdate,
  SeriesUpdateType,
  TableOverlayData,
  TimeAxisConfig,
  TimeMs,
  VisibleRangeEvent,
  ComputeRequest,
  ComputeResult
} from "../api/public-types.js";
import { DiagnosticsStore } from "./diagnostics.js";
import { EventEmitter } from "./events.js";
import { FrameScheduler } from "./scheduler.js";
import { LogStore } from "./log-store.js";
import { computeDataWindow, rangeContains, rangeSpan, sliceSnapshot } from "../data/window.js";
import { validateSeriesData } from "../data/validation.js";
import { appendSnapshot, createSnapshot, patchSnapshot, prependSnapshot } from "../data/snapshot.js";
import type { SeriesSnapshot } from "../data/snapshot.js";
import { computeSeriesDomain, normalizeSeries, SeriesState, updateApproxBarInterval } from "./series.js";
import { decimateCandles, decimateMinMax } from "../data/lod.js";
import { LruCache } from "../data/cache.js";
import { LodLevel, LodSelection, policyForSeries, selectLod } from "../data/lod-policy.js";
import { InteractionStateMachine } from "../interaction/state-machine.js";
import { PointerState } from "../interaction/pointer.js";
import { clipOverlay, enforceOverlayCaps, isOverlaySupported, OverlayRenderItem, OverlayStore, validateOverlay } from "./overlays.js";
import { PlotArea, ScaleDomain, timeToX, xToTime, priceToY, yToPrice } from "./transform.js";
import { RenderCrosshair, Renderer, RenderFrame, RenderSeries } from "../rendering/renderer.js";
import { NullRenderer } from "../rendering/null-renderer.js";
import { clamp } from "../util/math.js";
import { AxisTick, generateNumericTicks, generateTimeTicks } from "./axis.js";
import { ComputePipeline } from "../compute/pipeline.js";
import { ENGINE_CONTRACT_VERSION, ENGINE_VERSION, REPRO_BUNDLE_VERSION } from "./version.js";

const RENDER_WINDOW_GUARD_RATIO = 0.5;
const RENDER_WINDOW_SPAN_TOLERANCE = 0.02;

export type ChartEngineInitOptions = ChartEngineOptions & {
  renderer?: Renderer;
};

export class ChartEngine {
  private diagnostics: DiagnosticsStore;
  private logStore: LogStore;
  private chartId: string;
  private sessionId: string;
  private logEventLimit: number;
  private renderer: Renderer;
  private scheduler: FrameScheduler;
  private panes = new Map<string, PaneState>();
  private series = new Map<string, SeriesState>();
  private overlays = new OverlayStore();
  private computePipeline: ComputePipeline;
  private renderCache = new Map<string, RenderSeriesCache>();
  private lodCache: LruCache<string, RenderSeries>;
  private lodState = new Map<string, LodState>();
  private replayState: ReplayState = { mode: "off" };
  private frameId = 0;
  private interaction = new InteractionStateMachine();
  private pointer = new PointerState();
  private pointerCapturePaneId: string | null = null;
  private panAnchor: { paneId: string; range: Range; screenX: number } | null = null;
  private pendingCrosshairMove: CrosshairEvent | null = null;
  private crosshairMoveScheduled = false;
  private crosshairState: CrosshairEvent | null = null;
  private engineMetrics = {
    lodCacheHits: 0,
    lodCacheMisses: 0,
    renderCacheHits: 0,
    renderCacheMisses: 0
  };

  private visibleRangeEmitter = new EventEmitter<VisibleRangeEvent>();
  private transformEmitter = new EventEmitter<{ paneId: string }>();
  private layoutEmitter = new EventEmitter<LayoutChangeEvent>();
  private overlayLayoutEmitter = new EventEmitter<OverlayLayoutEvent>();
  private crosshairMoveEmitter = new EventEmitter<CrosshairEvent>();
  private crosshairClickEmitter = new EventEmitter<CrosshairEvent>();
  private hitTestEmitter = new EventEmitter<HitTestEvent>();
  private diagnosticsEmitter = new EventEmitter<void>();
  private dataWindowEmitter = new EventEmitter<DataWindowRequestEvent>();

  private width: number;
  private height: number;
  private devicePixelRatio: number;
  private baseRightGutterWidth: number;
  private baseLeftGutterWidth: number;
  private axisLabelCharWidth: number;
  private axisLabelPadding: number;
  private axisLabelHeight: number;
  private axisLabelMeasure?: AxisLabelMeasure;
  private timeAxisConfig: TimeAxisConfig;
  private prefetchRatio: number;
  private paneGap: number;
  private paneOrderCounter = 0;
  private hitTestRadiusPx: number;
  private pendingHitTest: HitTestEvent | null = null;
  private hitTestScheduled = false;
  private lodHysteresisRatio: number;
  private lodCacheEntries: number;
  private crosshairSync: boolean;
  private keyboardPanFraction: number;
  private keyboardZoomFactor: number;

  constructor(options: ChartEngineInitOptions = {}) {
    this.width = options.width ?? 800;
    this.height = options.height ?? 600;
    this.devicePixelRatio = options.devicePixelRatio ?? 1;
    this.chartId = options.chartId ?? "chart";
    this.sessionId = options.sessionId ?? generateSessionId();
    this.logEventLimit = options.logEventLimit ?? 512;
    this.logStore = new LogStore(this.logEventLimit);
    this.baseRightGutterWidth = options.rightGutterWidth ?? 60;
    this.baseLeftGutterWidth = options.leftGutterWidth ?? 0;
    this.axisLabelCharWidth = options.axisLabelCharWidth ?? 7;
    this.axisLabelPadding = options.axisLabelPadding ?? 6;
    this.axisLabelHeight = options.axisLabelHeight ?? 12;
    this.axisLabelMeasure = options.axisLabelMeasure;
    this.timeAxisConfig = options.timeAxisConfig ?? {};
    this.prefetchRatio = options.prefetchRatio ?? 0.2;
    this.paneGap = options.paneGap ?? 0;
    this.hitTestRadiusPx = options.hitTestRadiusPx ?? 8;
    this.lodHysteresisRatio = options.lodHysteresisRatio ?? 0.15;
    this.lodCacheEntries = options.lodCacheEntries ?? 64;
    this.lodCache = new LruCache<string, RenderSeries>(
      this.lodCacheEntries,
      (key) => {
        this.recordLog("info", "cache_evicted", { cache: "lod", key });
      }
    );
    this.crosshairSync = options.crosshairSync ?? true;
    this.keyboardPanFraction = options.keyboardPanFraction ?? 0.1;
    this.keyboardZoomFactor = options.keyboardZoomFactor ?? 1.2;
    this.diagnostics = new DiagnosticsStore((diag) => this.recordDiagnostic(diag));
    this.renderer = options.renderer ?? new NullRenderer();
    this.renderer.setDiagnostics?.((diag) => {
      this.diagnostics.add(diag);
      this.diagnosticsEmitter.emit();
    });
    this.computePipeline = new ComputePipeline({
      applyOverlays: (batch) => this.setOverlays(batch),
      emitDiagnostic: (diag) => {
        this.diagnostics.add(diag);
        this.diagnosticsEmitter.emit();
      }
    });

    this.scheduler = new FrameScheduler(() => this.renderFrame());
    this.ensurePane("price");
    this.renderer.initialize?.();
    this.renderer.resize?.(this.width, this.height, this.devicePixelRatio);
  }

  onVisibleRangeChange(listener: (event: VisibleRangeEvent) => void): () => void {
    return this.visibleRangeEmitter.subscribe(listener);
  }

  onTransformChange(listener: (event: { paneId: string }) => void): () => void {
    return this.transformEmitter.subscribe(listener);
  }

  onLayoutChange(listener: (event: LayoutChangeEvent) => void): () => void {
    return this.layoutEmitter.subscribe(listener);
  }

  onOverlayLayoutChange(listener: (event: OverlayLayoutEvent) => void): () => void {
    return this.overlayLayoutEmitter.subscribe(listener);
  }

  onCrosshairMove(listener: (event: CrosshairEvent) => void): () => void {
    return this.crosshairMoveEmitter.subscribe(listener);
  }

  onCrosshairClick(listener: (event: CrosshairEvent) => void): () => void {
    return this.crosshairClickEmitter.subscribe(listener);
  }

  onHitTest(listener: (event: HitTestEvent) => void): () => void {
    return this.hitTestEmitter.subscribe(listener);
  }

  onDiagnostics(listener: () => void): () => void {
    return this.diagnosticsEmitter.subscribe(listener);
  }

  onDataWindowRequest(listener: (event: DataWindowRequestEvent) => void): () => void {
    return this.dataWindowEmitter.subscribe(listener);
  }

  getDiagnostics(): ReadonlyArray<ReturnType<DiagnosticsStore["getAll"]>[number]> {
    return this.diagnostics.getAll();
  }

  getEngineInfo(): { engineVersion: string; engineContractVersion: string } {
    return { engineVersion: ENGINE_VERSION, engineContractVersion: ENGINE_CONTRACT_VERSION };
  }

  getLogs(): ReadonlyArray<LogEvent> {
    return this.logStore.getAll();
  }

  getMetrics(): EngineMetricsSnapshot {
    return {
      renderer: this.renderer.getMetrics?.() ?? null,
      engine: { ...this.engineMetrics }
    };
  }

  captureReproBundle(): ReproBundle {
    const panes = Array.from(this.panes.values()).map((pane) => {
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

    const seriesSnapshots = Array.from(this.series.values())
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
          data: this.snapshotToSeriesData(series.type, snapshot),
          version: snapshot.version
        };
      });

    return {
      bundleFormatVersion: REPRO_BUNDLE_VERSION,
      meta: {
        engineVersion: ENGINE_VERSION,
        engineContractVersion: ENGINE_CONTRACT_VERSION,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        chartId: this.chartId,
        platform: getPlatform()
      },
      options: this.snapshotOptions(),
      view: {
        panes,
        replayState: { ...this.replayState }
      },
      inputs: {
        series: seriesSnapshots,
        overlays: this.overlays.getBatches()
      },
      events: this.logStore.getAll(),
      diagnostics: this.diagnostics.getAll(),
      metrics: this.getMetrics()
    };
  }

  applyReproBundle(bundle: ReproBundle): void {
    const oldSeries = Array.from(this.series.keys());
    for (const seriesId of oldSeries) {
      this.renderer.removeSeries?.(seriesId);
    }
    this.series.clear();
    this.renderCache.clear();
    this.lodCache.clear();
    this.lodState.clear();
    this.overlays = new OverlayStore();
    this.panes.clear();
    this.paneOrderCounter = 0;

    const options = bundle.options;
    const width = options.width ?? this.width;
    const height = options.height ?? this.height;
    const dpr = options.devicePixelRatio ?? this.devicePixelRatio;
    this.setViewportSize(width, height, dpr);

    if (options.timeAxisConfig) {
      this.setTimeAxisConfig(options.timeAxisConfig);
    }

    if (bundle.view.panes.length > 0) {
      this.setPaneLayout(bundle.view.panes.map((pane) => ({ paneId: pane.paneId, weight: pane.layoutWeight })));
    }

    for (const series of bundle.inputs.series) {
      this.defineSeries(series.definition);
      this.setSeriesData(series.definition.id, series.data, "replace");
    }

    for (const pane of bundle.view.panes) {
      for (const scale of pane.scales) {
        this.setScaleConfig(pane.paneId, scale.scaleId, {
          position: scale.position,
          visible: scale.visible,
          tickCount: scale.tickCount
        });
        if (scale.autoScale === false && scale.domain) {
          this.setScaleDomain(pane.paneId, scale.scaleId, scale.domain);
        }
      }
    }

    this.setReplayState(bundle.view.replayState);
    for (const pane of bundle.view.panes) {
      this.setVisibleRange(pane.visibleRange, pane.paneId);
    }

    for (const batch of bundle.inputs.overlays) {
      this.setOverlays(batch);
    }

    this.flush();
  }

  static fromReproBundle(bundle: ReproBundle): ChartEngine {
    const engine = new ChartEngine(bundle.options);
    engine.applyReproBundle(bundle);
    return engine;
  }

  flush(): void {
    this.scheduler.flush();
    this.flushPendingCrosshairMove();
  }

  setViewportSize(width: number, height: number, devicePixelRatio?: number): void {
    this.width = width;
    this.height = height;
    if (devicePixelRatio !== undefined) {
      this.devicePixelRatio = devicePixelRatio;
    }
    this.recomputeLayout();
    for (const pane of this.panes.values()) {
      this.updateAxisLayout(pane.id);
    }
    this.renderer.resize?.(this.width, this.height, this.devicePixelRatio);
    this.transformEmitter.emit({ paneId: "price" });
    this.requestRender();
  }

  setAutoScale(paneId: string, scaleId: string, enabled: boolean): void {
    const pane = this.ensurePane(paneId);
    this.ensureScale(paneId, scaleId);
    pane.autoScale.set(scaleId, enabled);
    if (enabled) {
      this.updateScaleDomain(paneId);
    }
  }

  setCrosshairSync(enabled: boolean): void {
    this.crosshairSync = enabled;
    this.requestRender();
  }

  setScaleConfig(paneId: string, scaleId: string, config: ScaleConfig): void {
    const pane = this.ensurePane(paneId);
    this.ensureScale(paneId, scaleId);
    const current = pane.scaleConfigs.get(scaleId) ?? { position: "right", visible: true };
    const position = config.position ?? current.position;
    if (position !== "left" && position !== "right") {
      this.diagnostics.addError("scale.position.invalid", "scale position must be left or right", {
        paneId,
        scaleId,
        position
      });
      this.diagnosticsEmitter.emit();
      return;
    }
    pane.scaleConfigs.set(scaleId, {
      position,
      visible: config.visible ?? current.visible ?? true,
      tickCount: config.tickCount ?? current.tickCount,
      labelFormatter: config.labelFormatter ?? current.labelFormatter
    });
    this.updateAxisLayout(paneId);
    this.requestRender();
  }

  setTimeAxisConfig(config: TimeAxisConfig): void {
    this.timeAxisConfig = { ...this.timeAxisConfig, ...config };
    for (const pane of this.panes.values()) {
      this.updateAxisLayout(pane.id);
    }
    this.requestRender();
  }

  handleKeyCommand(paneId: string, command: KeyCommand, anchorTimeMs?: TimeMs): void {
    const pane = this.ensurePane(paneId);
    if (this.interaction.getState() === "disabled") return;
    switch (command) {
      case "pan-left":
        this.panByFraction(pane, -this.keyboardPanFraction);
        break;
      case "pan-right":
        this.panByFraction(pane, this.keyboardPanFraction);
        break;
      case "zoom-in": {
        const centerX = pane.plotArea.x + pane.plotArea.width * 0.5;
        this.zoomAt(paneId, centerX, this.keyboardZoomFactor);
        break;
      }
      case "zoom-out": {
        const centerX = pane.plotArea.x + pane.plotArea.width * 0.5;
        this.zoomAt(paneId, centerX, 1 / this.keyboardZoomFactor);
        break;
      }
      case "reset-latest":
        this.resetToLatest(paneId);
        break;
      case "reset-anchor":
        if (anchorTimeMs === undefined) {
          this.diagnostics.addError("keyboard.anchor.missing", "anchor time is required for reset-anchor", {
            paneId
          });
          this.diagnosticsEmitter.emit();
          return;
        }
        this.resetAroundAnchor(anchorTimeMs, paneId);
        break;
      default:
        this.diagnostics.addWarn("keyboard.command.unknown", "keyboard command not supported", {
          paneId,
          command
        });
        this.diagnosticsEmitter.emit();
        break;
    }
  }

  setPaneLayout(layout: PaneLayout): void {
    if (!Array.isArray(layout)) return;
    for (const entry of layout) {
      const pane = this.ensurePane(entry.paneId);
      const weight = entry.weight ?? 1;
      if (!Number.isFinite(weight) || weight <= 0) {
        this.diagnostics.addError("pane.layout.invalid", "pane layout weight must be positive", {
          paneId: entry.paneId,
          weight
        });
        continue;
      }
      pane.layoutWeight = weight;
    }
    this.recomputeLayout();
    for (const pane of this.panes.values()) {
      this.updateAxisLayout(pane.id);
    }
  }

  getPlotArea(paneId: string): PlotArea {
    const pane = this.ensurePane(paneId);
    return { ...pane.plotArea };
  }

  getRightGutterWidth(paneId: string): number {
    return this.ensurePane(paneId).rightGutterWidth;
  }

  defineSeries(definition: SeriesDefinition): void {
    const normalized = normalizeSeries(definition);
    this.series.set(definition.id, normalized);
    this.ensurePane(normalized.paneId);
    this.ensureScale(normalized.paneId, normalized.scaleId);
    this.requestRender();
  }

  setSeriesData(seriesId: string, data: SeriesData, updateType: SeriesUpdateType = "replace"): void {
    const series = this.series.get(seriesId);
    if (!series) {
      this.diagnostics.addError("series.missing", "series not defined", { seriesId });
      this.diagnosticsEmitter.emit();
      return;
    }
    const issues = validateSeriesData(data);
    if (issues.length > 0) {
      for (const issue of issues) {
        this.diagnostics.addError(issue.code, issue.message, { seriesId, ...issue.context });
      }
      this.diagnosticsEmitter.emit();
      return;
    }
    const snapshot = series.snapshot;
    if (snapshot && updateType !== "replace") {
      if (!this.validateSeriesUpdate(series, snapshot, data, updateType)) {
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
    this.updateDataWindowCoverage(series.paneId);
    const pane = this.panes.get(series.paneId);
    if (pane) {
      this.updateRenderWindow(pane, pane.visibleRange);
      this.maybeRequestDataWindow(pane);
    }
    this.updateScaleDomain(series.paneId);
    this.requestRender();
  }

  private validateSeriesUpdate(
    series: SeriesState,
    snapshot: SeriesSnapshot,
    data: SeriesData,
    updateType: SeriesUpdateType
  ): boolean {
    const updateTimes = data.timeMs;
    if (updateTimes.length === 0) {
      this.diagnostics.addError("series.update.empty", "series update contains no points", {
        seriesId: series.id,
        paneId: series.paneId,
        updateType
      });
      this.diagnosticsEmitter.emit();
      return false;
    }
    if (updateType === "append") {
      const lastBase = snapshot.timeMs[snapshot.timeMs.length - 1];
      if (updateTimes[0] <= lastBase) {
        this.diagnostics.addError("series.update.append.order", "append update must start after the last snapshot time", {
          seriesId: series.id,
          paneId: series.paneId,
          lastSnapshotTimeMs: lastBase,
          firstUpdateTimeMs: updateTimes[0]
        });
        this.diagnosticsEmitter.emit();
        return false;
      }
    }
    if (updateType === "prepend") {
      const firstBase = snapshot.timeMs[0];
      const lastUpdate = updateTimes[updateTimes.length - 1];
      if (lastUpdate >= firstBase) {
        this.diagnostics.addError("series.update.prepend.order", "prepend update must end before the first snapshot time", {
          seriesId: series.id,
          paneId: series.paneId,
          firstSnapshotTimeMs: firstBase,
          lastUpdateTimeMs: lastUpdate
        });
        this.diagnosticsEmitter.emit();
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
        this.diagnostics.addError(
          "series.update.patch.missing",
          "patch update contains timestamps not present in base snapshot",
          {
            seriesId: series.id,
            paneId: series.paneId,
            missingCount,
            missingSample: sample
          }
        );
        this.diagnosticsEmitter.emit();
        return false;
      }
    }
    return true;
  }

  updateSeries(seriesId: string, update: SeriesUpdate): void {
    this.setSeriesData(seriesId, update.data, update.type);
  }

  removeSeries(seriesId: string): void {
    const paneId = this.series.get(seriesId)?.paneId;
    this.series.delete(seriesId);
    this.renderCache.delete(seriesId);
    this.renderer.removeSeries?.(seriesId);
    if (paneId) {
      this.updateDataWindowCoverage(paneId);
      const pane = this.panes.get(paneId);
      if (pane) {
        this.updateRenderWindow(pane, pane.visibleRange);
        this.maybeRequestDataWindow(pane);
      }
    }
    this.requestRender();
  }

  setOverlays(batch: OverlayBatch): void {
    const accepted: typeof batch.overlays = [];
    let diagnosticsChanged = false;
    for (const overlay of batch.overlays) {
      if (!isOverlaySupported(overlay.type)) {
        this.diagnostics.addWarn("overlay.unsupported", "overlay type is not supported", {
          batchId: batch.batchId,
          overlayId: overlay.id,
          type: overlay.type
        });
        diagnosticsChanged = true;
        continue;
      }
      const capped = enforceOverlayCaps(overlay);
      const cappedOverlay = capped.overlay;
      if (capped.capped) {
        this.diagnostics.addWarn("overlay.points.capped", "overlay points capped to limit", {
          batchId: batch.batchId,
          overlayId: overlay.id,
          type: overlay.type,
          cap: capped.cap,
          originalCount: capped.originalCount
        });
        diagnosticsChanged = true;
      }
      const issues = validateOverlay(cappedOverlay);
      if (issues.length > 0) {
        for (const issue of issues) {
          this.diagnostics.addError(issue.code, issue.message, {
            batchId: batch.batchId,
            overlayId: overlay.id,
            type: overlay.type,
            ...issue.context
          });
          diagnosticsChanged = true;
        }
        continue;
      }
      const paneId = cappedOverlay.paneId ?? "price";
      const pane = this.panes.get(paneId);
      if (!pane) {
        this.diagnostics.addError("overlay.pane.missing", "overlay pane does not exist", {
          batchId: batch.batchId,
          overlayId: cappedOverlay.id,
          paneId
        });
        diagnosticsChanged = true;
        continue;
      }
      const scaleId = cappedOverlay.scaleId ?? this.getPrimaryScaleId(paneId);
      if (!pane.scaleDomains.has(scaleId)) {
        this.diagnostics.addError("overlay.scale.missing", "overlay scale does not exist", {
          batchId: batch.batchId,
          overlayId: cappedOverlay.id,
          paneId,
          scaleId
        });
        diagnosticsChanged = true;
        continue;
      }
      accepted.push({ ...cappedOverlay, paneId, scaleId });
    }
    this.overlays.setBatch({ ...batch, overlays: accepted });
    if (diagnosticsChanged) {
      this.diagnosticsEmitter.emit();
    }
    this.requestRender();
  }

  removeOverlayBatch(batchId: string): void {
    this.overlays.removeBatch(batchId);
    this.requestRender();
  }

  setComputePipeline(pipeline: ComputePipeline | null): void {
    if (pipeline) {
      this.computePipeline = pipeline;
      return;
    }
    this.computePipeline = new ComputePipeline({
      applyOverlays: (batch) => this.setOverlays(batch),
      emitDiagnostic: (diag) => {
        this.diagnostics.add(diag);
        this.diagnosticsEmitter.emit();
      }
    });
  }

  postComputeRequest(request: ComputeRequest): void {
    this.computePipeline.postRequest(request);
  }

  cancelComputeIndicator(indicatorId: string, version?: number): void {
    this.computePipeline.cancelIndicator(indicatorId, version);
  }

  cancelComputeWindow(windowId: string): void {
    this.computePipeline.cancelWindow(windowId);
  }

  applyComputeResult(result: ComputeResult): boolean {
    return this.computePipeline.applyResult(result);
  }

  getComputeStatus(): { pendingIndicators: number; pendingSeries: number } {
    return this.computePipeline.getStatus();
  }

  setReplayState(state: ReplayState): void {
    this.replayState = state;
    for (const pane of this.panes.values()) {
      pane.visibleRange = this.clampRangeToReplay(pane.visibleRange, this.getPrimarySeries(pane.id));
      this.emitVisibleRange(pane.id, pane.visibleRange);
    }
    this.recordLog("info", "replay_state_changed", { state: { ...state } });
    this.requestRender();
  }

  resetToLatest(paneId = "price"): void {
    const pane = this.ensurePane(paneId);
    const series = this.getPrimarySeries(paneId);
    if (!series?.snapshot) return;
    const times = series.snapshot.timeMs;
    const endIndex = times.length - 1;
    const startIndex = Math.max(0, endIndex - 499);
    const range: Range = { startMs: times[startIndex], endMs: times[endIndex] };
    pane.visibleRange = this.clampRangeToReplay(range, series);
    this.emitVisibleRange(paneId, pane.visibleRange);
  }

  resetAroundAnchor(timeMs: TimeMs, paneId = "price"): void {
    const pane = this.ensurePane(paneId);
    const span = pane.visibleRange.endMs - pane.visibleRange.startMs;
    const half = span / 2;
    const range: Range = { startMs: timeMs - half, endMs: timeMs + half };
    pane.visibleRange = this.clampRangeToReplay(range, this.getPrimarySeries(paneId));
    this.emitVisibleRange(paneId, pane.visibleRange);
  }

  focusTime(timeMs: TimeMs, paneId = "price"): void {
    this.resetAroundAnchor(timeMs, paneId);
  }

  setVisibleRange(range: Range, paneId = "price"): void {
    if (range.startMs >= range.endMs) {
      this.diagnostics.addError("range.invalid", "visible range start must be less than end", {
        paneId,
        range
      });
      this.diagnosticsEmitter.emit();
      return;
    }
    const pane = this.ensurePane(paneId);
    pane.visibleRange = this.clampRangeToReplay(range, this.getPrimarySeries(paneId));
    this.emitVisibleRange(paneId, pane.visibleRange);
  }

  timeToX(paneId: string, timeMs: TimeMs): number | null {
    const pane = this.ensurePane(paneId);
    return timeToX(pane.visibleRange, pane.plotArea, timeMs);
  }

  xToTime(paneId: string, x: number): TimeMs | null {
    const pane = this.ensurePane(paneId);
    return xToTime(pane.visibleRange, pane.plotArea, x);
  }

  priceToY(paneId: string, scaleId: string, price: number): number | null {
    const pane = this.ensurePane(paneId);
    const domain = pane.scaleDomains.get(scaleId);
    if (!domain) return null;
    return priceToY(domain, pane.plotArea, price);
  }

  yToPrice(paneId: string, scaleId: string, y: number): number | null {
    const pane = this.ensurePane(paneId);
    const domain = pane.scaleDomains.get(scaleId);
    if (!domain) return null;
    return yToPrice(domain, pane.plotArea, y);
  }

  handlePointerMove(paneId: string, x: number, y: number): void {
    const pane = this.ensurePane(paneId);
    if (this.interaction.getState() === "disabled") return;
    const state = this.interaction.getState();
    const isCaptured = this.pointerCapturePaneId === paneId;
    if (!isCaptured && !isPointInside(pane.plotArea, x, y)) {
      this.clearPointer(paneId);
      return;
    }
    this.pointer.update({ x, y });
    if (state === "active-drag" || state === "active-zoom" || state === "selection") {
      return;
    }
    this.interaction.setState("hover");
    const timeMs = this.xToTime(paneId, x);
    if (timeMs === null) {
      this.clearPointer(paneId);
      return;
    }
    const price = this.yToPrice(paneId, this.getPrimaryScaleId(paneId), y);
    const nearest = this.findNearestTime(paneId, timeMs);
    const event: CrosshairEvent = {
      paneId,
      timeMs,
      nearestTimeMs: nearest,
      price,
      screen: { x, y }
    };
    this.crosshairState = event;
    this.queueCrosshairMove(event);
    if (this.hitTestEmitter.hasListeners()) {
      this.queueHitTest(this.computeHitTest(paneId, timeMs, x, y));
    }
    this.requestRender();
  }

  handlePointerClick(paneId: string, x: number, y: number): void {
    const pane = this.ensurePane(paneId);
    if (this.interaction.getState() === "disabled") return;
    const timeMs = this.xToTime(paneId, x);
    if (timeMs === null) return;
    const price = this.yToPrice(paneId, this.getPrimaryScaleId(paneId), y);
    const nearest = this.findNearestTime(paneId, timeMs);
    this.crosshairClickEmitter.emit({
      paneId,
      timeMs,
      nearestTimeMs: nearest,
      price,
      screen: { x, y }
    });
  }

  clearPointer(paneId?: string): void {
    if (this.pointerCapturePaneId) return;
    if (paneId && this.crosshairState?.paneId !== paneId) return;
    this.pointer.clear();
    this.crosshairState = null;
    if (!paneId) {
      this.pendingHitTest = null;
    }
    if (this.interaction.getState() === "hover") {
      this.interaction.setState("idle");
    }
    this.requestRender();
  }

  beginPan(paneId: string, x: number): void {
    const pane = this.ensurePane(paneId);
    if (this.interaction.getState() === "disabled") return;
    this.interaction.setState("active-drag");
    this.pointerCapturePaneId = paneId;
    this.crosshairState = null;
    this.pendingHitTest = null;
    this.requestRender();
    this.panAnchor = { paneId, range: { ...pane.visibleRange }, screenX: x };
  }

  updatePan(paneId: string, x: number): void {
    if (!this.panAnchor || this.panAnchor.paneId !== paneId) return;
    const pane = this.ensurePane(paneId);
    const span = this.panAnchor.range.endMs - this.panAnchor.range.startMs;
    const deltaX = x - this.panAnchor.screenX;
    const deltaTime = -(deltaX / pane.plotArea.width) * span;
    const range: Range = {
      startMs: this.panAnchor.range.startMs + deltaTime,
      endMs: this.panAnchor.range.endMs + deltaTime
    };
    pane.visibleRange = this.clampRangeToReplay(range, this.getPrimarySeries(paneId));
    this.emitVisibleRange(paneId, pane.visibleRange);
  }

  handleWheelZoom(paneId: string, x: number, deltaY: number, zoomSpeed = 0.002): void {
    if (this.interaction.getState() === "disabled") return;
    if (!Number.isFinite(deltaY)) return;
    const speed = Math.max(0.0001, zoomSpeed);
    const factor = Math.exp(-deltaY * speed);
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoomAt(paneId, x, factor);
  }

  zoomAt(paneId: string, x: number, zoomFactor: number): void {
    if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
      this.diagnostics.addError("zoom.invalid", "zoom factor must be a positive number", {
        paneId,
        zoomFactor
      });
      this.diagnosticsEmitter.emit();
      return;
    }
    const pane = this.ensurePane(paneId);
    const range = pane.visibleRange;
    const anchorTime = this.xToTime(paneId, x) ?? (range.startMs + range.endMs) * 0.5;
    const span = range.endMs - range.startMs;
    const nextSpan = this.clampZoomSpan(span / zoomFactor, this.getPrimarySeries(paneId));
    const ratio = span > 0 ? (anchorTime - range.startMs) / span : 0.5;
    const startMs = anchorTime - ratio * nextSpan;
    const endMs = startMs + nextSpan;
    this.interaction.setState("active-zoom");
    pane.visibleRange = this.clampRangeToReplay({ startMs, endMs }, this.getPrimarySeries(paneId));
    this.emitVisibleRange(paneId, pane.visibleRange);
    this.interaction.setState("idle");
  }

  endPan(): void {
    if (this.interaction.getState() === "active-drag") {
      this.interaction.setState("idle");
    }
    this.panAnchor = null;
    this.pointerCapturePaneId = null;
  }

  setScaleDomain(paneId: string, scaleId: string, domain: ScaleDomain): void {
    const pane = this.ensurePane(paneId);
    this.ensureScale(paneId, scaleId);
    pane.scaleDomains.set(scaleId, domain);
    pane.autoScale.set(scaleId, false);
    this.transformEmitter.emit({ paneId });
    this.updateAxisLayout(paneId);
    this.requestRender();
  }

  private renderFrame(): void {
    this.frameId += 1;
    const overlays = this.overlays.getAll().map((overlay) => {
      return clipOverlay(overlay, this.getCutoffTime());
    });

    const panes: PaneRenderState[] = [];
    for (const pane of this.panes.values()) {
      panes.push({
        paneId: pane.id,
        plotArea: pane.plotArea,
        visibleRange: { ...pane.visibleRange },
        scaleDomains: Object.fromEntries(pane.scaleDomains.entries()),
        series: this.collectSeriesForPane(pane.id),
        axis: this.buildAxisRenderState(pane)
      });
    }

    const frame: RenderFrame = {
      frameId: this.frameId,
      panes,
      overlays,
      crosshairs: this.buildRenderCrosshairs()
    };
    this.renderer.render(frame);
    this.emitOverlayLayout(overlays);
  }

  private collectSeriesForPane(paneId: string): RenderSeries[] {
    const result: RenderSeries[] = [];
    const pane = this.ensurePane(paneId);
    for (const series of this.series.values()) {
      if (series.paneId !== paneId) continue;
      const renderSeries = this.buildRenderSeries(series, pane);
      if (renderSeries) {
        result.push(renderSeries);
      }
    }
    return result;
  }

  private buildAxisRenderState(pane: PaneState): PaneRenderState["axis"] {
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
    const resolved = this.enforceSingleScalePerSide(pane, left, right);
    return {
      left: resolved.left,
      right: resolved.right,
      time: pane.timeTicks,
      primaryScaleId: pane.primaryScaleId,
      leftGutterWidth: pane.leftGutterWidth,
      rightGutterWidth: pane.rightGutterWidth
    };
  }

  private buildRenderSeries(series: SeriesState, pane: PaneState): RenderSeries | null {
    const snapshot = series.snapshot;
    if (!snapshot) return null;
    const cutoffTime = this.getCutoffTime();
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
    const selection = this.selectLod(series, pane.plotArea.width, visibleSlice.timeMs.length);
    const visibleSpan = Math.max(1, rangeSpan(visibleRange));
    const renderSpan = Math.max(visibleSpan, rangeSpan(renderRange));
    const maxPoints = Math.max(2, Math.floor(selection.maxPoints * (renderSpan / visibleSpan)));
    const cache = this.renderCache.get(series.id);
    if (
      cache &&
      cache.version === snapshot.version &&
      cache.windowStartMs === renderRange.startMs &&
      cache.windowEndMs === renderRange.endMs &&
      cache.maxPoints === maxPoints &&
      cache.cutoffTime === cutoffTime
    ) {
      this.engineMetrics.renderCacheHits += 1;
      return cache.series;
    }
    this.engineMetrics.renderCacheMisses += 1;

    const cutoffKey = cutoffTime ?? "none";
    const cacheKey = `${series.id}|${snapshot.version}|${renderRange.startMs}|${renderRange.endMs}|${maxPoints}|${cutoffKey}`;
    const cachedSeries = this.lodCache.get(cacheKey);
    if (cachedSeries) {
      this.engineMetrics.lodCacheHits += 1;
      this.renderCache.set(series.id, {
        version: snapshot.version,
        windowStartMs: renderRange.startMs,
        windowEndMs: renderRange.endMs,
        maxPoints,
        cutoffTime,
        series: cachedSeries
      });
      return cachedSeries;
    }
    this.engineMetrics.lodCacheMisses += 1;

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

    this.renderCache.set(series.id, {
      version: snapshot.version,
      windowStartMs: renderRange.startMs,
      windowEndMs: renderRange.endMs,
      maxPoints,
      cutoffTime,
      series: renderSeries
    });
    this.lodCache.set(cacheKey, renderSeries);

    return renderSeries;
  }

  private selectLod(series: SeriesState, width: number, visibleCount: number): LodSelection {
    const previous = this.lodState.get(series.id);
    const policy = policyForSeries(series.type, this.lodHysteresisRatio);
    const selection = selectLod(visibleCount, width, policy, previous?.level);
    if (!previous || previous.level !== selection.level) {
      this.lodState.set(series.id, {
        level: selection.level,
        density: selection.density,
        pointsPerPixel: selection.pointsPerPixel
      });
      if (previous) {
        this.diagnostics.addInfo("lod.level.changed", "lod level changed", {
          seriesId: series.id,
          from: previous.level,
          to: selection.level,
          density: selection.density.toFixed(3),
          pointsPerPixel: selection.pointsPerPixel
        });
        this.diagnosticsEmitter.emit();
        this.recordLog("info", "lod_level_changed", {
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

  private emitOverlayLayout(overlays: OverlayRenderItem[]): void {
    if (!this.overlayLayoutEmitter.hasListeners()) return;
    const items = this.buildOverlayLayoutItems(overlays);
    this.overlayLayoutEmitter.emit({ frameId: this.frameId, items });
  }

  private buildOverlayLayoutItems(overlays: OverlayRenderItem[]): OverlayLayoutItem[] {
    const items: OverlayLayoutItem[] = [];
    for (const item of overlays) {
      const overlay = item.overlay;
      if (overlay.type === "table") {
        const data = item.clippedData as TableOverlayData | null;
        if (!data || !Array.isArray(data.rows) || data.rows.length === 0) continue;
        const paneId = overlay.paneId ?? "price";
        const pane = this.panes.get(paneId);
        if (!pane) continue;
        const position = data.position ?? "top-right";
        items.push({
          type: "table",
          overlayId: overlay.id,
          paneId,
          position,
          plotArea: { ...pane.plotArea },
          rightGutterWidth: pane.rightGutterWidth,
          rows: data.rows,
          anchorTimeMs: data.anchorTimeMs,
          layer: overlay.layer,
          zIndex: overlay.zIndex
        });
      }
      if (overlay.type === "right-label") {
        const data = item.clippedData as RightLabelOverlayData | null;
        if (!data || !Array.isArray(data.labels) || data.labels.length === 0) continue;
        const paneId = overlay.paneId ?? "price";
        const pane = this.panes.get(paneId);
        if (!pane) continue;
        const scaleId = overlay.scaleId ?? this.getPrimaryScaleId(paneId);
        const domain = pane.scaleDomains.get(scaleId);
        if (!domain) {
          this.diagnostics.addError("overlay.scale.missing", "overlay scale does not exist", {
            overlayId: overlay.id,
            paneId,
            scaleId
          });
          this.diagnosticsEmitter.emit();
          continue;
        }
        for (const label of data.labels) {
          const y = priceToY(domain, pane.plotArea, label.price);
          if (y === null) continue;
          items.push({
            type: "right-label",
            overlayId: overlay.id,
            labelId: label.id,
            paneId,
            scaleId,
            plotArea: { ...pane.plotArea },
            rightGutterWidth: pane.rightGutterWidth,
            price: label.price,
            text: label.text,
            timeMs: label.timeMs,
            color: label.color,
            sizePx: label.sizePx,
            y,
            layer: overlay.layer,
            zIndex: overlay.zIndex
          });
        }
      }
    }
    return items;
  }

  private buildRenderCrosshairs(): RenderCrosshair[] {
    const active = this.crosshairState;
    if (!active) return [];
    const result: RenderCrosshair[] = [];
    const bottomPaneId = this.findBottomPaneId();
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

    if (this.crosshairSync) {
      for (const pane of this.panes.values()) {
        if (pane.id === active.paneId) continue;
        const x = timeToX(pane.visibleRange, pane.plotArea, active.timeMs);
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

  private findBottomPaneId(): string | null {
    const panes = this.getOrderedPanes();
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

  private updateScaleDomain(paneId: string): void {
    const pane = this.ensurePane(paneId);
    const cutoffTime = this.getCutoffTime();
    const range: Range = {
      startMs: pane.visibleRange.startMs,
      endMs: cutoffTime !== undefined ? Math.min(pane.visibleRange.endMs, cutoffTime) : pane.visibleRange.endMs
    };
    const merged = new Map<string, ScaleDomain>();
    for (const series of this.series.values()) {
      if (series.paneId !== paneId) continue;
      if (pane.autoScale.get(series.scaleId) === false) continue;
      const domain = computeSeriesDomain(series, range);
      if (!domain) continue;
      const existing = merged.get(series.scaleId);
      if (!existing) {
        merged.set(series.scaleId, domain);
      } else {
        merged.set(series.scaleId, {
          min: Math.min(existing.min, domain.min),
          max: Math.max(existing.max, domain.max)
        });
      }
    }
    if (merged.size === 0) {
      this.updateAxisLayout(paneId);
      return;
    }
    for (const [scaleId, domain] of merged.entries()) {
      pane.scaleDomains.set(scaleId, domain);
    }
    this.transformEmitter.emit({ paneId });
    this.updateAxisLayout(paneId);
  }

  private updateAxisLayout(paneId: string, allowGutterUpdate = true): void {
    const pane = this.ensurePane(paneId);
    const layout = this.computeAxisLayout(pane);
    pane.axisTicks = layout.axisTicks;
    pane.timeTicks = layout.timeTicks;
    pane.primaryScaleId = layout.primaryScaleId;

    const leftChanged = Math.abs(layout.leftGutterWidth - pane.leftGutterWidth) > 2;
    const rightChanged = Math.abs(layout.rightGutterWidth - pane.rightGutterWidth) > 2;
    if (allowGutterUpdate && (leftChanged || rightChanged)) {
      pane.leftGutterWidth = layout.leftGutterWidth;
      pane.rightGutterWidth = layout.rightGutterWidth;
      this.recomputeLayout();
      this.updateAxisLayout(paneId, false);
    }
  }

  private computeAxisLayout(pane: PaneState): {
    axisTicks: Map<string, AxisTick[]>;
    timeTicks: AxisTick[];
    leftGutterWidth: number;
    rightGutterWidth: number;
    primaryScaleId: string;
  } {
    const axisTicks = new Map<string, AxisTick[]>();
    const primaryScaleId = this.getPrimaryScaleId(pane.id);
    const labelHeight = Math.max(8, this.axisLabelHeight);
    const targetCount = Math.max(2, Math.floor(pane.plotArea.height / (labelHeight + this.axisLabelPadding)));

    let maxLeftLabel = 0;
    let maxRightLabel = 0;
    for (const [scaleId, config] of pane.scaleConfigs.entries()) {
      if (config.visible === false) {
        axisTicks.set(scaleId, []);
        continue;
      }
      const domain = pane.scaleDomains.get(scaleId);
      if (!domain) {
        axisTicks.set(scaleId, []);
        continue;
      }
      const ticks = generateNumericTicks(
        domain.min,
        domain.max,
        config.tickCount ?? targetCount,
        config.labelFormatter
      );
      for (const tick of ticks) {
        const width = this.measureLabelWidth(tick.label);
        if (config.position === "left") {
          maxLeftLabel = Math.max(maxLeftLabel, width);
        } else {
          maxRightLabel = Math.max(maxRightLabel, width);
        }
      }
      axisTicks.set(scaleId, this.filterNumericTicks(pane, scaleId, ticks));
    }

    const leftGutterWidth = Math.max(this.baseLeftGutterWidth, maxLeftLabel + this.axisLabelPadding * 2);
    const rightGutterWidth = Math.max(this.baseRightGutterWidth, maxRightLabel + this.axisLabelPadding * 2);

    const timePixelWidth = this.timeAxisConfig.tickCount
      ? this.timeAxisConfig.tickCount * 90
      : pane.plotArea.width;
    const timeTicksRaw = generateTimeTicks(
      pane.visibleRange,
      timePixelWidth,
      this.timeAxisConfig.labelFormatter
    );
    const timeTicks = this.filterTimeTicks(pane, timeTicksRaw);

    return {
      axisTicks,
      timeTicks,
      leftGutterWidth,
      rightGutterWidth,
      primaryScaleId
    };
  }

  private filterTimeTicks(pane: PaneState, ticks: AxisTick[]): AxisTick[] {
    if (ticks.length <= 2) return ticks;
    const minGap = Math.max(4, this.axisLabelPadding);
    let lastRight = -Infinity;
    const result: AxisTick[] = [];
    for (const tick of ticks) {
      const x = timeToX(pane.visibleRange, pane.plotArea, tick.value);
      if (x === null) continue;
      const width = this.measureLabelWidth(tick.label);
      const left = x - width / 2;
      const right = x + width / 2;
      if (left >= lastRight + minGap) {
        result.push(tick);
        lastRight = right;
      }
    }
    return result;
  }

  private filterNumericTicks(pane: PaneState, scaleId: string, ticks: AxisTick[]): AxisTick[] {
    if (ticks.length <= 2) return ticks;
    const domain = pane.scaleDomains.get(scaleId);
    if (!domain) return ticks;
    const labelHeight = Math.max(8, this.axisLabelHeight);
    const minGap = labelHeight + this.axisLabelPadding;
    const candidates: { tick: AxisTick; y: number }[] = [];
    for (const tick of ticks) {
      const y = priceToY(domain, pane.plotArea, tick.value);
      if (y === null) continue;
      candidates.push({ tick, y });
    }
    if (candidates.length <= 2) return ticks;
    candidates.sort((a, b) => a.y - b.y);
    const kept = new Set<AxisTick>();
    let lastBottom = -Infinity;
    for (const candidate of candidates) {
      const top = candidate.y - labelHeight / 2;
      const bottom = candidate.y + labelHeight / 2;
      if (top >= lastBottom + minGap) {
        kept.add(candidate.tick);
        lastBottom = bottom;
      }
    }
    return ticks.filter((tick) => kept.has(tick));
  }

  private enforceSingleScalePerSide(
    pane: PaneState,
    left: PaneRenderState["axis"]["left"],
    right: PaneRenderState["axis"]["right"]
  ): { left: PaneRenderState["axis"]["left"]; right: PaneRenderState["axis"]["right"] } {
    const leftVisible = left.filter((item) => item.visible);
    const rightVisible = right.filter((item) => item.visible);
    const nextConflictState = {
      left: leftVisible.map((item) => item.scaleId),
      right: rightVisible.map((item) => item.scaleId)
    };
    if (
      pane.lastScaleConflict === null ||
      !arraysEqual(pane.lastScaleConflict.left, nextConflictState.left) ||
      !arraysEqual(pane.lastScaleConflict.right, nextConflictState.right)
    ) {
      if (leftVisible.length > 1) {
        const kept = this.pickScaleToKeep(leftVisible, pane.primaryScaleId);
        this.diagnostics.addWarn("axis.scale.overlap", "multiple visible scales on left side; hiding extras", {
          paneId: pane.id,
          side: "left",
          visibleScaleIds: nextConflictState.left,
          keptScaleId: kept
        });
        this.diagnosticsEmitter.emit();
        for (const item of left) {
          item.visible = item.scaleId === kept;
        }
      }
      if (rightVisible.length > 1) {
        const kept = this.pickScaleToKeep(rightVisible, pane.primaryScaleId);
        this.diagnostics.addWarn("axis.scale.overlap", "multiple visible scales on right side; hiding extras", {
          paneId: pane.id,
          side: "right",
          visibleScaleIds: nextConflictState.right,
          keptScaleId: kept
        });
        this.diagnosticsEmitter.emit();
        for (const item of right) {
          item.visible = item.scaleId === kept;
        }
      }
      pane.lastScaleConflict = nextConflictState;
    }
    return { left, right };
  }

  private pickScaleToKeep(scales: Array<{ scaleId: string }>, primaryScaleId: string): string {
    const preferred = scales.find((scale) => scale.scaleId === primaryScaleId);
    return preferred?.scaleId ?? scales[0]?.scaleId ?? primaryScaleId;
  }

  private measureLabelWidth(text: string): number {
    if (this.axisLabelMeasure) {
      const measured = this.axisLabelMeasure(text);
      if (Number.isFinite(measured)) return Math.max(0, measured);
    }
    return text.length * this.axisLabelCharWidth;
  }

  private emitVisibleRange(paneId: string, range: Range): void {
    const pane = this.ensurePane(paneId);
    if (!rangesEqual(pane.lastEmittedRange, range)) {
      pane.lastEmittedRange = { ...range };
      this.visibleRangeEmitter.emit({ paneId, range });
      this.transformEmitter.emit({ paneId });
      this.recordLog("info", "visible_range_changed", { paneId, range: { ...range } });
    }
    this.updateRenderWindow(pane, range);
    this.maybeRequestDataWindow(pane);
    this.updateScaleDomain(paneId);
    this.requestRender();
  }

  private updateRenderWindow(pane: PaneState, range: Range): void {
    if (!this.shouldUpdateRenderWindow(pane, range)) return;
    const dataWindow = computeDataWindow(range, this.prefetchRatio);
    const previous = pane.renderWindow ? { ...pane.renderWindow } : null;
    pane.renderWindow = { ...dataWindow.range };
    if (!rangesEqual(previous, pane.renderWindow)) {
      this.recordLog("info", "render_window_shifted", {
        paneId: pane.id,
        previous,
        next: { ...pane.renderWindow }
      });
    }
  }

  private shouldUpdateRenderWindow(pane: PaneState, range: Range): boolean {
    const renderWindow = pane.renderWindow;
    if (!renderWindow) return true;
    const renderSpan = rangeSpan(renderWindow);
    if (!Number.isFinite(renderSpan) || renderSpan <= 0) return true;
    const ratio = 1 + 2 * this.prefetchRatio;
    const baseSpan = ratio > 0 ? renderSpan / ratio : renderSpan;
    if (!Number.isFinite(baseSpan) || baseSpan <= 0) return true;
    const span = rangeSpan(range);
    if (Math.abs(span - baseSpan) > baseSpan * RENDER_WINDOW_SPAN_TOLERANCE) return true;
    if (!rangeContains(renderWindow, range)) return true;
    const margin = baseSpan * this.prefetchRatio;
    const guard = margin * RENDER_WINDOW_GUARD_RATIO;
    if (guard <= 0) return false;
    if (range.startMs <= renderWindow.startMs + guard) return true;
    if (range.endMs >= renderWindow.endMs - guard) return true;
    return false;
  }

  private maybeRequestDataWindow(pane: PaneState): void {
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
      this.dataWindowEmitter.emit({ paneId: pane.id, range: target, prefetchRatio: this.prefetchRatio });
      this.recordLog("info", "data_window_requested", {
        paneId: pane.id,
        range: { ...target },
        prefetchRatio: this.prefetchRatio
      });
    }
  }

  private updateDataWindowCoverage(paneId: string): void {
    const pane = this.ensurePane(paneId);
    const primary = this.getPrimarySeries(paneId);
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
      this.diagnostics.addWarn("data.window.incomplete", "data window coverage is smaller than requested", {
        paneId,
        requested: { ...pane.pendingDataWindow },
        coverage: { ...coverage }
      });
      this.diagnosticsEmitter.emit();
    }
  }

  private requestRender(): void {
    this.scheduler.requestFrame();
  }

  private recordLog(level: LogLevel, eventType: string, context?: Record<string, unknown>): void {
    this.logStore.add({
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      chartId: this.chartId,
      engineVersion: ENGINE_VERSION,
      engineContractVersion: ENGINE_CONTRACT_VERSION,
      level,
      eventType,
      context
    });
  }

  private recordDiagnostic(diagnostic: Diagnostic): void {
    const level = diagnostic.severity === "fatal" ? "fatal" : diagnostic.severity;
    this.recordLog(level, "diagnostic_emitted", {
      code: diagnostic.code,
      message: diagnostic.message,
      severity: diagnostic.severity,
      recoverable: diagnostic.recoverable,
      context: diagnostic.context
    });
  }
                                                                                                            
  private snapshotOptions(): ReproBundle["options"] {
    return {
      width: this.width,
      height: this.height,
      devicePixelRatio: this.devicePixelRatio,
      rightGutterWidth: this.baseRightGutterWidth,
      leftGutterWidth: this.baseLeftGutterWidth,
      axisLabelCharWidth: this.axisLabelCharWidth,
      axisLabelPadding: this.axisLabelPadding,
      axisLabelHeight: this.axisLabelHeight,
      prefetchRatio: this.prefetchRatio,
      paneGap: this.paneGap,
      hitTestRadiusPx: this.hitTestRadiusPx,
      lodHysteresisRatio: this.lodHysteresisRatio,
      lodCacheEntries: this.lodCacheEntries,
      crosshairSync: this.crosshairSync,
      keyboardPanFraction: this.keyboardPanFraction,
      keyboardZoomFactor: this.keyboardZoomFactor,
      timeAxisConfig: this.timeAxisConfig.tickCount !== undefined ? { tickCount: this.timeAxisConfig.tickCount } : undefined,
      chartId: this.chartId,
      sessionId: this.sessionId,
      logEventLimit: this.logEventLimit
    };
  }

  private snapshotToSeriesData(type: SeriesState["type"], snapshot: SeriesSnapshot): SeriesData {
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

  private queueCrosshairMove(event: CrosshairEvent): void {
    this.pendingCrosshairMove = event;
    if (this.crosshairMoveScheduled) return;
    this.crosshairMoveScheduled = true;
    const emit = () => {
      this.crosshairMoveScheduled = false;
      const pending = this.pendingCrosshairMove;
      this.pendingCrosshairMove = null;
      if (pending) {
        this.crosshairMoveEmitter.emit(pending);
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(emit);
    } else {
      queueMicrotask(emit);
    }
  }

  private queueHitTest(event: HitTestEvent): void {
    this.pendingHitTest = event;
    if (this.hitTestScheduled) return;
    this.hitTestScheduled = true;
    const emit = () => {
      this.hitTestScheduled = false;
      const pending = this.pendingHitTest;
      this.pendingHitTest = null;
      if (pending) {
        this.hitTestEmitter.emit(pending);
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(emit);
    } else {
      queueMicrotask(emit);
    }
  }

  private flushPendingCrosshairMove(): void {
    const pending = this.pendingCrosshairMove;
    if (!pending) {
      this.crosshairMoveScheduled = false;
      return;
    }
    this.pendingCrosshairMove = null;
    this.crosshairMoveScheduled = false;
    this.crosshairMoveEmitter.emit(pending);
  }

  private ensurePane(paneId: string): PaneState {
    const existing = this.panes.get(paneId);
    if (existing) return existing;
    const leftGutter = this.baseLeftGutterWidth;
    const rightGutter = this.baseRightGutterWidth;
    const pane: PaneState = {
      id: paneId,
      order: this.paneOrderCounter++,
      layoutWeight: 1,
      plotArea: {
        x: leftGutter,
        y: 0,
        width: Math.max(0, this.width - leftGutter - rightGutter),
        height: this.height
      },
      visibleRange: { startMs: 0, endMs: 1 },
      scaleDomains: new Map([["price", { min: 0, max: 1 }]]),
      autoScale: new Map([["price", true]]),
      scaleConfigs: new Map([["price", { position: "right", visible: true }]]),
      leftGutterWidth: leftGutter,
      rightGutterWidth: rightGutter,
      axisTicks: new Map(),
      timeTicks: [],
      primaryScaleId: "price",
      lastEmittedRange: null,
      renderWindow: null,
      dataWindowCoverage: null,
      pendingDataWindow: null,
      lastRequestedDataWindow: null,
      lastCoverageWarning: null,
      lastScaleConflict: null
    };
    this.panes.set(paneId, pane);
    this.recomputeLayout();
    this.updateAxisLayout(paneId);
    return pane;
  }

  private ensureScale(paneId: string, scaleId: string): void {
    const pane = this.ensurePane(paneId);
    if (!pane.scaleDomains.has(scaleId)) {
      pane.scaleDomains.set(scaleId, { min: 0, max: 1 });
    }
    if (!pane.autoScale.has(scaleId)) {
      pane.autoScale.set(scaleId, true);
    }
    if (!pane.scaleConfigs.has(scaleId)) {
      pane.scaleConfigs.set(scaleId, { position: "right", visible: true });
    }
  }

  private recomputeLayout(): void {
    const panes = this.getOrderedPanes();
    if (panes.length === 0) return;
    const totalGap = this.paneGap * Math.max(0, panes.length - 1);
    const availableHeight = Math.max(1, this.height - totalGap);
    let weightSum = 0;
    for (const pane of panes) {
      weightSum += pane.layoutWeight;
    }
    if (weightSum <= 0) weightSum = panes.length;
    let yOffset = 0;
    for (let i = 0; i < panes.length; i += 1) {
      const pane = panes[i];
      const weight = pane.layoutWeight > 0 ? pane.layoutWeight : 1;
      const height = i === panes.length - 1
        ? Math.max(1, this.height - yOffset)
        : Math.max(1, Math.round((availableHeight * weight) / weightSum));
      const left = pane.leftGutterWidth;
      const right = pane.rightGutterWidth;
      pane.plotArea = {
        x: left,
        y: yOffset,
        width: Math.max(0, this.width - left - right),
        height
      };
      yOffset += height + this.paneGap;
      this.layoutEmitter.emit({ paneId: pane.id, plotArea: pane.plotArea, index: i, count: panes.length });
      this.transformEmitter.emit({ paneId: pane.id });
    }
  }

  private getOrderedPanes(): PaneState[] {
    return Array.from(this.panes.values()).sort((a, b) => a.order - b.order);
  }

  private getPrimarySeries(paneId: string): SeriesState | null {
    for (const series of this.series.values()) {
      if (series.paneId === paneId) return series;
    }
    return null;
  }

  private getPrimaryScaleId(paneId: string): string {
    const series = this.getPrimarySeries(paneId);
    return series?.scaleId ?? "price";
  }

  private findNearestTime(paneId: string, timeMs: TimeMs): TimeMs | null {
    const series = this.getPrimarySeries(paneId);
    const snapshot = series?.snapshot;
    if (!snapshot || snapshot.timeMs.length === 0) return null;
    const times = snapshot.timeMs;
    let low = 0;
    let high = times.length - 1;
    let maxIndex = high;
    const cutoff = this.getCutoffTime();
    if (cutoff !== undefined) {
      const lastIndex = upperBound(times, cutoff) - 1;
      if (lastIndex < 0) return null;
      maxIndex = Math.min(high, lastIndex);
      high = maxIndex;
    }
    while (low <= high) {
      const mid = (low + high) >> 1;
      const value = times[mid];
      if (value === timeMs) return value;
      if (value < timeMs) low = mid + 1;
      else high = mid - 1;
    }
    const left = clamp(high, 0, maxIndex);
    const right = clamp(low, 0, maxIndex);
    const leftDiff = Math.abs(times[left] - timeMs);
    const rightDiff = Math.abs(times[right] - timeMs);
    return leftDiff <= rightDiff ? times[left] : times[right];
  }

  private getCutoffTime(): TimeMs | undefined {
    if (this.replayState.mode === "paused" || this.replayState.mode === "playing") {
      return this.replayState.cutoffTimeMs;
    }
    return undefined;
  }

  private clampRangeToReplay(range: Range, series: SeriesState | null): Range {
    const cutoff = this.getCutoffTime();
    if (!cutoff) return range;
    const paddingBars = this.replayState.paddingBars ?? 2;
    const barInterval = series?.approxBarIntervalMs ?? 0;
    const paddingMs = barInterval * paddingBars;
    const maxEnd = cutoff + paddingMs;
    const span = range.endMs - range.startMs;
    const endMs = Math.min(range.endMs, maxEnd);
    const startMs = Math.min(range.startMs, endMs - span);
    return { startMs, endMs };
  }

  private clampZoomSpan(span: number, series: SeriesState | null): number {
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

  private panByFraction(pane: PaneState, fraction: number): void {
    if (!Number.isFinite(fraction) || fraction === 0) return;
    const span = pane.visibleRange.endMs - pane.visibleRange.startMs;
    const delta = span * fraction;
    const range: Range = {
      startMs: pane.visibleRange.startMs + delta,
      endMs: pane.visibleRange.endMs + delta
    };
    pane.visibleRange = this.clampRangeToReplay(range, this.getPrimarySeries(pane.id));
    this.emitVisibleRange(pane.id, pane.visibleRange);
  }

  private computeHitTest(paneId: string, timeMs: TimeMs, x: number, y: number): HitTestEvent {
    const pane = this.ensurePane(paneId);
    const seriesHits: SeriesHit[] = [];
    for (const series of this.series.values()) {
      if (series.paneId !== paneId || !series.snapshot) continue;
      const hit = this.hitTestSeries(series, pane, timeMs, x, y);
      if (hit) {
        seriesHits.push(hit);
      }
    }
    seriesHits.sort((a, b) => (a.distancePx ?? 0) - (b.distancePx ?? 0));

    const overlayHits: OverlayHit[] = [];
    for (const overlay of this.overlays.getAll()) {
      if ((overlay.paneId ?? "price") !== paneId) continue;
      const clipped = clipOverlay(overlay, this.getCutoffTime()).clippedData;
      const hit = this.hitTestOverlay(overlay, clipped, pane, timeMs, x, y);
      if (hit) {
        overlayHits.push(hit);
      }
    }
    overlayHits.sort((a, b) => (a.distancePx ?? 0) - (b.distancePx ?? 0));

    return {
      paneId,
      timeMs,
      screen: { x, y },
      series: seriesHits,
      overlays: overlayHits
    };
  }

  private hitTestSeries(
    series: SeriesState,
    pane: PaneState,
    timeMs: TimeMs,
    x: number,
    y: number
  ): SeriesHit | null {
    const snapshot = series.snapshot;
    if (!snapshot) return null;
    const index = findNearestIndex(snapshot.timeMs, timeMs, this.getCutoffTime());
    if (index === null) return null;
    const timeValue = snapshot.timeMs[index];
    const xValue = timeToX(pane.visibleRange, pane.plotArea, timeValue);
    if (xValue === null) return null;
    const distanceX = Math.abs(xValue - x);
    if (distanceX > this.hitTestRadiusPx) return null;
    const domain = pane.scaleDomains.get(series.scaleId);
    const baseHit: SeriesHit = {
      seriesId: series.id,
      paneId: series.paneId,
      scaleId: series.scaleId,
      timeMs: timeValue,
      index,
      distancePx: distanceX
    };
    if (!domain) return baseHit;

    if (series.type === "candles") {
      const open = snapshot.fields.open?.[index];
      const high = snapshot.fields.high?.[index];
      const low = snapshot.fields.low?.[index];
      const close = snapshot.fields.close?.[index];
      if (
        open === undefined ||
        high === undefined ||
        low === undefined ||
        close === undefined
      ) {
        return baseHit;
      }
      const highY = priceToY(domain, pane.plotArea, high);
      const lowY = priceToY(domain, pane.plotArea, low);
      if (highY !== null && lowY !== null) {
        const minY = Math.min(highY, lowY) - this.hitTestRadiusPx;
        const maxY = Math.max(highY, lowY) + this.hitTestRadiusPx;
        if (y < minY || y > maxY) return null;
      }
      return {
        ...baseHit,
        open,
        high,
        low,
        close
      };
    }

    const value = snapshot.fields.value?.[index];
    if (value === undefined) return baseHit;
    const valueY = priceToY(domain, pane.plotArea, value);
    if (valueY !== null) {
      const distanceY = Math.abs(valueY - y);
      const distance = Math.hypot(distanceX, distanceY);
      if (distance > this.hitTestRadiusPx) return null;
      baseHit.distancePx = distance;
    }
    return { ...baseHit, value };
  }

  private hitTestOverlay(
    overlay: { id: string; type: string; paneId?: string; scaleId?: string },
    data: unknown,
    pane: PaneState,
    timeMs: TimeMs,
    x: number,
    y: number
  ): OverlayHit | null {
    const scaleId = overlay.scaleId ?? "price";
    const domain = pane.scaleDomains.get(scaleId);
    if (!domain) return null;
    if (!data || typeof data !== "object") return null;
    const type = overlay.type;
    if (type === "marker" || type === "label" || type === "line" || type === "area" || type === "histogram") {
      const points = (data as { points?: { timeMs: TimeMs; value: number; text?: string }[] }).points;
      if (!Array.isArray(points) || points.length === 0) return null;
      const nearest = findNearestPoint(points, timeMs);
      if (!nearest) return null;
      const xValue = timeToX(pane.visibleRange, pane.plotArea, nearest.timeMs);
      const yValue = priceToY(domain, pane.plotArea, nearest.value);
      if (xValue === null || yValue === null) return null;
      const distance = Math.hypot(xValue - x, yValue - y);
      if (distance > this.hitTestRadiusPx) return null;
      return {
        overlayId: overlay.id,
        paneId: pane.id,
        scaleId,
        type: overlay.type as OverlayHit["type"],
        timeMs: nearest.timeMs,
        value: nearest.value,
        text: nearest.text,
        distancePx: distance
      };
    }
    if (type === "hline") {
      const value = (data as { value?: number }).value;
      if (value === undefined) return null;
      const yValue = priceToY(domain, pane.plotArea, value);
      if (yValue === null) return null;
      const distance = Math.abs(yValue - y);
      if (distance > this.hitTestRadiusPx) return null;
      return {
        overlayId: overlay.id,
        paneId: pane.id,
        scaleId,
        type: overlay.type as OverlayHit["type"],
        value,
        distancePx: distance
      };
    }
    if (type === "zone") {
      const points = (data as { points?: { timeMs: TimeMs; top: number; bottom: number }[] }).points;
      if (!Array.isArray(points) || points.length === 0) return null;
      const nearest = findNearestZone(points, timeMs);
      if (!nearest) return null;
      const xValue = timeToX(pane.visibleRange, pane.plotArea, nearest.timeMs);
      if (xValue === null) return null;
      const topY = priceToY(domain, pane.plotArea, nearest.top);
      const bottomY = priceToY(domain, pane.plotArea, nearest.bottom);
      if (topY === null || bottomY === null) return null;
      const minY = Math.min(topY, bottomY) - this.hitTestRadiusPx;
      const maxY = Math.max(topY, bottomY) + this.hitTestRadiusPx;
      if (y < minY || y > maxY) return null;
      const distance = Math.abs(xValue - x);
      if (distance > this.hitTestRadiusPx) return null;
      return {
        overlayId: overlay.id,
        paneId: pane.id,
        scaleId,
        type: overlay.type as OverlayHit["type"],
        timeMs: nearest.timeMs,
        value: nearest.top,
        distancePx: distance
      };
    }
    return null;
  }
}

type PaneState = {
  id: string;
  order: number;
  layoutWeight: number;
  plotArea: PlotArea;
  visibleRange: Range;
  scaleDomains: Map<string, ScaleDomain>;
  autoScale: Map<string, boolean>;
  scaleConfigs: Map<string, ScaleConfigState>;
  leftGutterWidth: number;
  rightGutterWidth: number;
  axisTicks: Map<string, AxisTick[]>;
  timeTicks: AxisTick[];
  primaryScaleId: string;
  lastEmittedRange: Range | null;
  renderWindow: Range | null;
  dataWindowCoverage: Range | null;
  pendingDataWindow: Range | null;
  lastRequestedDataWindow: Range | null;
  lastCoverageWarning: Range | null;
  lastScaleConflict: { left: string[]; right: string[] } | null;
};

type ScaleConfigState = {
  position: "left" | "right";
  visible: boolean;
  tickCount?: number;
  labelFormatter?: ScaleConfig["labelFormatter"];
};

type PaneRenderState = {
  paneId: string;
  plotArea: PlotArea;
  visibleRange: Range;
  scaleDomains: Record<string, ScaleDomain>;
  series: RenderSeries[];
  axis: {
    left: { scaleId: string; position: "left"; ticks: AxisTick[]; visible: boolean }[];
    right: { scaleId: string; position: "right"; ticks: AxisTick[]; visible: boolean }[];
    time: AxisTick[];
    primaryScaleId: string;
    leftGutterWidth: number;
    rightGutterWidth: number;
  };
};

type RenderSeriesCache = {
  version: number;
  windowStartMs: TimeMs;
  windowEndMs: TimeMs;
  maxPoints: number;
  cutoffTime?: TimeMs;
  series: RenderSeries;
};

type LodState = {
  level: LodLevel;
  density: number;
  pointsPerPixel: number;
};

function rangesEqual(a: Range | null, b: Range | null): boolean {
  if (!a || !b) return false;
  return a.startMs === b.startMs && a.endMs === b.endMs;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Math.random().toString(36).slice(2, 10)}`;
}

function getPlatform(): string {
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    return navigator.userAgent;
  }
  return "node";
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

function isPointInside(plotArea: PlotArea, x: number, y: number): boolean {
  return (
    x >= plotArea.x &&
    x <= plotArea.x + plotArea.width &&
    y >= plotArea.y &&
    y <= plotArea.y + plotArea.height
  );
}

function findExactIndex(times: Float64Array, timeMs: TimeMs): number {
  let low = 0;
  let high = times.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = times[mid];
    if (value === timeMs) return mid;
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

function findNearestIndex(times: Float64Array, timeMs: TimeMs, cutoff?: TimeMs): number | null {
  if (times.length === 0) return null;
  let low = 0;
  let high = times.length - 1;
  let maxIndex = high;
  if (cutoff !== undefined) {
    const lastIndex = upperBound(times, cutoff) - 1;
    if (lastIndex < 0) return null;
    maxIndex = Math.min(high, lastIndex);
    high = maxIndex;
  }
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = times[mid];
    if (value === timeMs) return mid;
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  const left = clamp(high, 0, maxIndex);
  const right = clamp(low, 0, maxIndex);
  const leftDiff = Math.abs(times[left] - timeMs);
  const rightDiff = Math.abs(times[right] - timeMs);
  return leftDiff <= rightDiff ? left : right;
}

function findNearestPoint(
  points: { timeMs: TimeMs; value: number; text?: string }[],
  timeMs: TimeMs
): { timeMs: TimeMs; value: number; text?: string } | null {
  if (points.length === 0) return null;
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = points[mid].timeMs;
    if (value === timeMs) return points[mid];
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  const left = clamp(high, 0, points.length - 1);
  const right = clamp(low, 0, points.length - 1);
  const leftDiff = Math.abs(points[left].timeMs - timeMs);
  const rightDiff = Math.abs(points[right].timeMs - timeMs);
  return leftDiff <= rightDiff ? points[left] : points[right];
}

function findNearestZone(
  points: { timeMs: TimeMs; top: number; bottom: number }[],
  timeMs: TimeMs
): { timeMs: TimeMs; top: number; bottom: number } | null {
  if (points.length === 0) return null;
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = points[mid].timeMs;
    if (value === timeMs) return points[mid];
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  const left = clamp(high, 0, points.length - 1);
  const right = clamp(low, 0, points.length - 1);
  const leftDiff = Math.abs(points[left].timeMs - timeMs);
  const rightDiff = Math.abs(points[right].timeMs - timeMs);
  return leftDiff <= rightDiff ? points[left] : points[right];
}
