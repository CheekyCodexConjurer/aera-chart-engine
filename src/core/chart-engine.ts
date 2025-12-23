import {
  AxisLabelMeasure,
  ChartEngineOptions,
  ComputeRequest,
  ComputeResult,
  CrosshairEvent,
  DataWindowRequestEvent,
  EngineMetricsSnapshot,
  HitTestEvent,
  KeyCommand,
  LayoutChangeEvent,
  LogEvent,
  OverlayBatch,
  OverlayLayoutEvent,
  PaneLayout,
  Range,
  ReproBundle,
  ReplayState,
  ScaleConfig,
  SeriesData,
  SeriesDefinition,
  SeriesUpdate,
  SeriesUpdateType,
  TimeAxisConfig,
  TransformEvent,
  TimeMs,
  VisibleRangeEvent,
  WorkerAdapter,
  WorkerMode,
  WorkerStatus
} from "../api/public-types.js";
import type { ComputePipelineLike } from "../compute/pipeline.js";
import { LruCache } from "../data/cache.js";
import { PointerState } from "../interaction/pointer.js";
import { InteractionStateMachine } from "../interaction/state-machine.js";
import { NullRenderer } from "../rendering/null-renderer.js";
import type { RenderSeries, Renderer } from "../rendering/renderer.js";
import { DiagnosticsStore } from "./diagnostics.js";
import { EventEmitter } from "./events.js";
import { LogStore } from "./log-store.js";
import { OverlayStore } from "./overlays.js";
import { FrameScheduler } from "./scheduler.js";
import type { SeriesState } from "./series.js";
import { getEngineContext } from "./engine/context.js";
import { generateSessionId } from "./engine/util.js";
import { renderFrame } from "./engine/render.js";
import { captureReproBundle, applyReproBundle } from "./engine/repro.js";
import { getDiagnostics, getEngineInfo, getLogs, getMetrics, recordDiagnostic, recordLog } from "./engine/diagnostics.js";
import {
  ensurePane,
  getPlotArea,
  getRightGutterWidth,
  setAutoScale,
  setPaneLayout,
  setScaleConfig,
  setScaleDomain,
  setTimeAxisConfig,
  setViewportSize
} from "./engine/axis-layout.js";
import { defineSeries, removeSeries, setSeriesData, updateSeries } from "./engine/series.js";
import { removeOverlayBatch, setOverlays } from "./engine/overlays.js";
import {
  applyComputeResult,
  cancelComputeIndicator,
  cancelComputeWindow,
  getComputeStatus,
  postComputeRequest,
  setComputePipeline
} from "./engine/compute.js";
import { getWorkerStatus, setWorkerAdapter } from "./engine/worker.js";
import { focusTime, resetAroundAnchor, resetToLatest, setReplayState, setVisibleRange } from "./engine/replay.js";
import { priceToY, timeToX, xToTime, yToPrice } from "./engine/coordinates.js";
import {
  beginPan,
  clearPointer,
  endPan,
  flushPendingCrosshairMove,
  handleKeyCommand,
  handlePinchZoom,
  handlePointerClick,
  handlePointerMove,
  handleWheelZoom,
  updatePan,
  zoomAt
} from "./engine/interaction.js";
import { setDataWindowCoverage } from "./engine/windowing.js";
import type { LodState, PaneState, RenderSeriesCache } from "./engine/state.js";
import type { PlotArea, ScaleDomain } from "./transform.js";

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
  private computePipeline: ComputePipelineLike;
  private workerAdapter: WorkerAdapter | null = null;
  private workerMode: WorkerMode = "main";
  private workerStatus: WorkerStatus = { available: false, mode: "main", reason: "not-configured" };
  private workerRenderer: Renderer | null = null;
  private workerRendererFallback: Renderer | null = null;
  private workerPipelineFallback: ComputePipelineLike | null = null;
  private renderCache = new Map<string, RenderSeriesCache>();
  private lodCache: LruCache<string, RenderSeries>;
  private lodState = new Map<string, LodState>();
  private replayState: ReplayState = { mode: "off" };
  private frameId = 0;
  private interaction: InteractionStateMachine;
  private pointer = new PointerState();
  private pointerCapturePaneId: string | null = null;
  private panAnchor: { paneId: string; range: Range; screenX: number } | null = null;
  private pendingCrosshairMove: CrosshairEvent | null = null;
  private crosshairMoveScheduled = false;
  private crosshairState: CrosshairEvent | null = null;
  private engineMetrics = {
    lodCacheHits: 0,
    lodCacheMisses: 0,
    lodCacheEvictions: 0,
    lodSelectionChanges: 0,
    renderCacheHits: 0,
    renderCacheMisses: 0
  };

  private visibleRangeEmitter = new EventEmitter<VisibleRangeEvent>();
  private transformEmitter = new EventEmitter<TransformEvent>();
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
  private dataWindowRequestId = 0;
  private dataWindowMaxPending: number;
  private gapThresholdRatio: number;

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
    const maxPending = options.dataWindowMaxPending;
    this.dataWindowMaxPending =
      typeof maxPending === "number" && Number.isFinite(maxPending) && maxPending > 0
        ? Math.floor(maxPending)
        : 2;
    const gapRatio = options.gapThresholdRatio;
    this.gapThresholdRatio =
      typeof gapRatio === "number" && Number.isFinite(gapRatio) && gapRatio > 1
        ? Math.min(10, Math.max(1.5, gapRatio))
        : 3;
    this.paneGap = options.paneGap ?? 0;
    this.hitTestRadiusPx = options.hitTestRadiusPx ?? 8;
    this.lodHysteresisRatio = options.lodHysteresisRatio ?? 0.15;
    this.lodCacheEntries = options.lodCacheEntries ?? 64;
    this.lodCache = new LruCache<string, RenderSeries>(
      this.lodCacheEntries,
      (key) => {
        const ctx = getEngineContext(this);
        ctx.engineMetrics.lodCacheEvictions += 1;
        recordLog(ctx, "info", "cache_evicted", { cache: "lod", key });
      }
    );
    this.crosshairSync = options.crosshairSync ?? true;
    this.keyboardPanFraction = options.keyboardPanFraction ?? 0.1;
    this.keyboardZoomFactor = options.keyboardZoomFactor ?? 1.2;
    this.diagnostics = new DiagnosticsStore((diag) => recordDiagnostic(getEngineContext(this), diag));
    this.interaction = new InteractionStateMachine((from, to) => {
      this.diagnostics.addWarn("interaction.state.invalid", "interaction state transition is not allowed", {
        from,
        to
      });
      this.diagnosticsEmitter.emit();
    });
    this.renderer = options.renderer ?? new NullRenderer();
    this.renderer.setDiagnostics?.((diag) => {
      this.diagnostics.add(diag);
      this.diagnosticsEmitter.emit();
    });

    this.scheduler = new FrameScheduler(() => renderFrame(getEngineContext(this)));
    this.computePipeline = setComputePipeline(getEngineContext(this), null);
    ensurePane(getEngineContext(this), "price");
    this.renderer.initialize?.();
    this.renderer.resize?.(this.width, this.height, this.devicePixelRatio);
  }

  onVisibleRangeChange(listener: (event: VisibleRangeEvent) => void): () => void { return this.visibleRangeEmitter.subscribe(listener); }
  onTransformChange(listener: (event: TransformEvent) => void): () => void { return this.transformEmitter.subscribe(listener); }
  onLayoutChange(listener: (event: LayoutChangeEvent) => void): () => void { return this.layoutEmitter.subscribe(listener); }
  onOverlayLayoutChange(listener: (event: OverlayLayoutEvent) => void): () => void { return this.overlayLayoutEmitter.subscribe(listener); }
  onCrosshairMove(listener: (event: CrosshairEvent) => void): () => void { return this.crosshairMoveEmitter.subscribe(listener); }
  onCrosshairClick(listener: (event: CrosshairEvent) => void): () => void { return this.crosshairClickEmitter.subscribe(listener); }
  onHitTest(listener: (event: HitTestEvent) => void): () => void { return this.hitTestEmitter.subscribe(listener); }
  onDiagnostics(listener: () => void): () => void { return this.diagnosticsEmitter.subscribe(listener); }
  onDataWindowRequest(listener: (event: DataWindowRequestEvent) => void): () => void { return this.dataWindowEmitter.subscribe(listener); }

  getDiagnostics(): ReadonlyArray<ReturnType<DiagnosticsStore["getAll"]>[number]> { return getDiagnostics(getEngineContext(this)); }
  getEngineInfo(): { engineVersion: string; engineContractVersion: string } { return getEngineInfo(); }
  getLogs(): ReadonlyArray<LogEvent> { return getLogs(getEngineContext(this)); }
  getMetrics(): EngineMetricsSnapshot { return getMetrics(getEngineContext(this)); }
  captureReproBundle(): ReproBundle { return captureReproBundle(getEngineContext(this)); }
  applyReproBundle(bundle: ReproBundle): void { applyReproBundle(getEngineContext(this), bundle); }

  static fromReproBundle(bundle: ReproBundle): ChartEngine {
    const engine = new ChartEngine(bundle.options);
    engine.applyReproBundle(bundle);
    return engine;
  }

  flush(): void { this.scheduler.flush(); flushPendingCrosshairMove(getEngineContext(this)); }

  setViewportSize(width: number, height: number, devicePixelRatio?: number): void { setViewportSize(getEngineContext(this), width, height, devicePixelRatio); }
  setAutoScale(paneId: string, scaleId: string, enabled: boolean): void { setAutoScale(getEngineContext(this), paneId, scaleId, enabled); }
  setCrosshairSync(enabled: boolean): void { const ctx = getEngineContext(this); ctx.crosshairSync = enabled; ctx.scheduler.requestFrame(); }
  setScaleConfig(paneId: string, scaleId: string, config: ScaleConfig): void { setScaleConfig(getEngineContext(this), paneId, scaleId, config); }
  setTimeAxisConfig(config: TimeAxisConfig): void { setTimeAxisConfig(getEngineContext(this), config); }
  handleKeyCommand(paneId: string, command: KeyCommand, anchorTimeMs?: TimeMs): void { handleKeyCommand(getEngineContext(this), paneId, command, anchorTimeMs); }
  setPaneLayout(layout: PaneLayout): void { setPaneLayout(getEngineContext(this), layout); }
  getPlotArea(paneId: string): PlotArea { return getPlotArea(getEngineContext(this), paneId); }
  getRightGutterWidth(paneId: string): number { return getRightGutterWidth(getEngineContext(this), paneId); }
  defineSeries(definition: SeriesDefinition): void { defineSeries(getEngineContext(this), definition); }
  setSeriesData(seriesId: string, data: SeriesData, updateType: SeriesUpdateType = "replace"): void { setSeriesData(getEngineContext(this), seriesId, data, updateType); }
  updateSeries(seriesId: string, update: SeriesUpdate): void { updateSeries(getEngineContext(this), seriesId, update); }
  removeSeries(seriesId: string): void { removeSeries(getEngineContext(this), seriesId); }
  setOverlays(batch: OverlayBatch): void { setOverlays(getEngineContext(this), batch); }
  removeOverlayBatch(batchId: string): void { removeOverlayBatch(getEngineContext(this), batchId); }
  setComputePipeline(pipeline: ComputePipelineLike | null): void { setComputePipeline(getEngineContext(this), pipeline); }
  postComputeRequest(request: ComputeRequest): void { postComputeRequest(getEngineContext(this), request); }
  cancelComputeIndicator(indicatorId: string, version?: number): void { cancelComputeIndicator(getEngineContext(this), indicatorId, version); }
  cancelComputeWindow(windowId: string): void { cancelComputeWindow(getEngineContext(this), windowId); }
  applyComputeResult(result: ComputeResult): boolean { return applyComputeResult(getEngineContext(this), result); }
  getComputeStatus(): { pendingIndicators: number; pendingSeries: number } { return getComputeStatus(getEngineContext(this)); }
  setWorkerAdapter(adapter: WorkerAdapter | null, options?: { mode?: WorkerMode }): WorkerStatus {
    return setWorkerAdapter(getEngineContext(this), adapter, options);
  }
  getWorkerStatus(): WorkerStatus { return getWorkerStatus(getEngineContext(this)); }
  setReplayState(state: ReplayState): void { setReplayState(getEngineContext(this), state); }
  resetToLatest(paneId = "price"): void { resetToLatest(getEngineContext(this), paneId); }
  resetAroundAnchor(timeMs: TimeMs, paneId = "price"): void { resetAroundAnchor(getEngineContext(this), timeMs, paneId); }
  focusTime(timeMs: TimeMs, paneId = "price"): void { focusTime(getEngineContext(this), timeMs, paneId); }
  setVisibleRange(range: Range, paneId = "price"): void { setVisibleRange(getEngineContext(this), range, paneId); }
  setDataWindowCoverage(paneId: string, range: Range | null): void { setDataWindowCoverage(getEngineContext(this), paneId, range); }
  timeToX(paneId: string, timeMs: TimeMs): number | null { return timeToX(getEngineContext(this), paneId, timeMs); }
  xToTime(paneId: string, x: number): TimeMs | null { return xToTime(getEngineContext(this), paneId, x); }
  priceToY(paneId: string, scaleId: string, price: number): number | null { return priceToY(getEngineContext(this), paneId, scaleId, price); }
  yToPrice(paneId: string, scaleId: string, y: number): number | null { return yToPrice(getEngineContext(this), paneId, scaleId, y); }
  handlePointerMove(paneId: string, x: number, y: number): void { handlePointerMove(getEngineContext(this), paneId, x, y); }
  handlePointerClick(paneId: string, x: number, y: number): void { handlePointerClick(getEngineContext(this), paneId, x, y); }
  clearPointer(paneId?: string): void { clearPointer(getEngineContext(this), paneId); }
  beginPan(paneId: string, x: number): void { beginPan(getEngineContext(this), paneId, x); }
  updatePan(paneId: string, x: number): void { updatePan(getEngineContext(this), paneId, x); }
  handleWheelZoom(paneId: string, x: number, deltaY: number, zoomSpeed = 0.002): void { handleWheelZoom(getEngineContext(this), paneId, x, deltaY, zoomSpeed); }
  handlePinchZoom(paneId: string, x: number, scale: number): void { handlePinchZoom(getEngineContext(this), paneId, x, scale); }
  zoomAt(paneId: string, x: number, zoomFactor: number): void { zoomAt(getEngineContext(this), paneId, x, zoomFactor); }
  endPan(): void { endPan(getEngineContext(this)); }
  setScaleDomain(paneId: string, scaleId: string, domain: ScaleDomain): void { setScaleDomain(getEngineContext(this), paneId, scaleId, domain); }
}
