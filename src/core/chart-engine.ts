import {
  ChartEngineOptions,
  CrosshairEvent,
  HitTestEvent,
  KeyCommand,
  LayoutChangeEvent,
  OverlayBatch,
  OverlayLayoutEvent,
  OverlayLayoutItem,
  PaneLayout,
  Range,
  RightLabelOverlayData,
  ReplayState,
  SeriesHit,
  SeriesData,
  SeriesDefinition,
  OverlayHit,
  SeriesUpdate,
  SeriesUpdateType,
  TableOverlayData,
  TimeMs,
  VisibleRangeEvent
} from "../api/public-types.js";
import { DiagnosticsStore } from "./diagnostics.js";
import { EventEmitter } from "./events.js";
import { FrameScheduler } from "./scheduler.js";
import { computeDataWindow, sliceSnapshot } from "../data/window.js";
import { validateSeriesData } from "../data/validation.js";
import { appendSnapshot, createSnapshot, patchSnapshot, prependSnapshot } from "../data/snapshot.js";
import { computeSeriesDomain, normalizeSeries, SeriesState, updateApproxBarInterval } from "./series.js";
import { decimateCandles, decimateMinMax } from "../data/lod.js";
import { LruCache } from "../data/cache.js";
import { LodLevel, LodSelection, policyForSeries, selectLod } from "../data/lod-policy.js";
import { InteractionStateMachine } from "../interaction/state-machine.js";
import { PointerState } from "../interaction/pointer.js";
import { clipOverlay, isOverlaySupported, OverlayRenderItem, OverlayStore, validateOverlay } from "./overlays.js";
import { PlotArea, ScaleDomain, timeToX, xToTime, priceToY, yToPrice } from "./transform.js";
import { RenderCrosshair, Renderer, RenderFrame, RenderSeries } from "../rendering/renderer.js";
import { NullRenderer } from "../rendering/null-renderer.js";
import { clamp } from "../util/math.js";

export type ChartEngineInitOptions = ChartEngineOptions & {
  renderer?: Renderer;
};

export type DataWindowRequestEvent = {
  paneId: string;
  range: Range;
  prefetchRatio: number;
};

export class ChartEngine {
  private diagnostics = new DiagnosticsStore();
  private renderer: Renderer;
  private scheduler: FrameScheduler;
  private panes = new Map<string, PaneState>();
  private series = new Map<string, SeriesState>();
  private overlays = new OverlayStore();
  private renderCache = new Map<string, RenderSeriesCache>();
  private lodCache: LruCache<string, RenderSeries>;
  private lodState = new Map<string, LodState>();
  private replayState: ReplayState = { mode: "off" };
  private frameId = 0;
  private interaction = new InteractionStateMachine();
  private pointer = new PointerState();
  private panAnchor: { paneId: string; range: Range; screenX: number } | null = null;
  private pendingCrosshairMove: CrosshairEvent | null = null;
  private crosshairMoveScheduled = false;
  private crosshairState: CrosshairEvent | null = null;

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
  private rightGutterWidth: number;
  private prefetchRatio: number;
  private paneGap: number;
  private paneOrderCounter = 0;
  private hitTestRadiusPx: number;
  private pendingHitTest: HitTestEvent | null = null;
  private hitTestScheduled = false;
  private lodHysteresisRatio: number;
  private crosshairSync: boolean;
  private keyboardPanFraction: number;
  private keyboardZoomFactor: number;

  constructor(options: ChartEngineInitOptions = {}) {
    this.width = options.width ?? 800;
    this.height = options.height ?? 600;
    this.devicePixelRatio = options.devicePixelRatio ?? 1;
    this.rightGutterWidth = options.rightGutterWidth ?? 60;
    this.prefetchRatio = options.prefetchRatio ?? 0.2;
    this.paneGap = options.paneGap ?? 0;
    this.hitTestRadiusPx = options.hitTestRadiusPx ?? 8;
    this.lodHysteresisRatio = options.lodHysteresisRatio ?? 0.15;
    this.lodCache = new LruCache<string, RenderSeries>(options.lodCacheEntries ?? 64);
    this.crosshairSync = options.crosshairSync ?? true;
    this.keyboardPanFraction = options.keyboardPanFraction ?? 0.1;
    this.keyboardZoomFactor = options.keyboardZoomFactor ?? 1.2;
    this.renderer = options.renderer ?? new NullRenderer();

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
    this.renderer.resize?.(this.width, this.height, this.devicePixelRatio);
    this.transformEmitter.emit({ paneId: "price" });
    this.requestRender();
  }

  setAutoScale(paneId: string, scaleId: string, enabled: boolean): void {
    const pane = this.ensurePane(paneId);
    pane.autoScale.set(scaleId, enabled);
    if (enabled) {
      this.updateScaleDomain(paneId);
    }
  }

  setCrosshairSync(enabled: boolean): void {
    this.crosshairSync = enabled;
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
  }

  getPlotArea(paneId: string): PlotArea {
    const pane = this.ensurePane(paneId);
    return { ...pane.plotArea };
  }

  getRightGutterWidth(_paneId: string): number {
    return this.rightGutterWidth;
  }

  defineSeries(definition: SeriesDefinition): void {
    const normalized = normalizeSeries(definition);
    this.series.set(definition.id, normalized);
    this.ensurePane(normalized.paneId);
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
    this.updateScaleDomain(series.paneId);
    this.requestRender();
  }

  updateSeries(seriesId: string, update: SeriesUpdate): void {
    this.setSeriesData(seriesId, update.data, update.type);
  }

  removeSeries(seriesId: string): void {
    this.series.delete(seriesId);
    this.renderCache.delete(seriesId);
    this.requestRender();
  }

  setOverlays(batch: OverlayBatch): void {
    const accepted: typeof batch.overlays = [];
    for (const overlay of batch.overlays) {
      if (!isOverlaySupported(overlay.type)) {
        this.diagnostics.addWarn("overlay.unsupported", "overlay type is not supported", {
          batchId: batch.batchId,
          overlayId: overlay.id,
          type: overlay.type
        });
        continue;
      }
      const issues = validateOverlay(overlay);
      if (issues.length > 0) {
        for (const issue of issues) {
          this.diagnostics.addError(issue.code, issue.message, {
            batchId: batch.batchId,
            overlayId: overlay.id,
            type: overlay.type,
            ...issue.context
          });
        }
        continue;
      }
      const paneId = overlay.paneId ?? "price";
      const pane = this.panes.get(paneId);
      if (!pane) {
        this.diagnostics.addError("overlay.pane.missing", "overlay pane does not exist", {
          batchId: batch.batchId,
          overlayId: overlay.id,
          paneId
        });
        continue;
      }
      const scaleId = overlay.scaleId ?? this.getPrimaryScaleId(paneId);
      if (!pane.scaleDomains.has(scaleId)) {
        this.diagnostics.addError("overlay.scale.missing", "overlay scale does not exist", {
          batchId: batch.batchId,
          overlayId: overlay.id,
          paneId,
          scaleId
        });
        continue;
      }
      accepted.push({ ...overlay, paneId, scaleId });
    }
    this.overlays.setBatch({ ...batch, overlays: accepted });
    this.requestRender();
  }

  removeOverlayBatch(batchId: string): void {
    this.overlays.removeBatch(batchId);
    this.requestRender();
  }

  setReplayState(state: ReplayState): void {
    this.replayState = state;
    for (const pane of this.panes.values()) {
      pane.visibleRange = this.clampRangeToReplay(pane.visibleRange, this.getPrimarySeries(pane.id));
      this.emitVisibleRange(pane.id, pane.visibleRange);
    }
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
    if (!isPointInside(pane.plotArea, x, y)) {
      this.clearPointer(paneId);
      return;
    }
    this.interaction.setState("hover");
    this.pointer.update({ x, y });
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
  }

  setScaleDomain(paneId: string, scaleId: string, domain: ScaleDomain): void {
    const pane = this.ensurePane(paneId);
    pane.scaleDomains.set(scaleId, domain);
    pane.autoScale.set(scaleId, false);
    this.transformEmitter.emit({ paneId });
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
        series: this.collectSeriesForPane(pane.id)
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

  private buildRenderSeries(series: SeriesState, pane: PaneState): RenderSeries | null {
    const snapshot = series.snapshot;
    if (!snapshot) return null;
    const cutoffTime = this.getCutoffTime();
    const effectiveRange: Range = {
      startMs: pane.visibleRange.startMs,
      endMs: cutoffTime !== undefined ? Math.min(pane.visibleRange.endMs, cutoffTime) : pane.visibleRange.endMs
    };
    const cache = this.renderCache.get(series.id);
    const slice = sliceSnapshot(snapshot, effectiveRange, cutoffTime);
    if (!slice || slice.timeMs.length === 0) return null;
    const selection = this.selectLod(series, pane.plotArea.width, slice.timeMs.length);
    const maxPoints = selection.maxPoints;
    if (
      cache &&
      cache.version === snapshot.version &&
      cache.startMs === effectiveRange.startMs &&
      cache.endMs === effectiveRange.endMs &&
      cache.maxPoints === maxPoints &&
      cache.cutoffTime === cutoffTime
    ) {
      return cache.series;
    }

    const cacheKey = `${series.id}|${snapshot.version}|${effectiveRange.startMs}|${effectiveRange.endMs}|${maxPoints}`;
    const cachedSeries = this.lodCache.get(cacheKey);
    if (cachedSeries) {
      this.renderCache.set(series.id, {
        version: snapshot.version,
        startMs: effectiveRange.startMs,
        endMs: effectiveRange.endMs,
        maxPoints,
        cutoffTime,
        series: cachedSeries
      });
      return cachedSeries;
    }

    let timeMs = slice.timeMs;
    let fields: Record<string, Float64Array> = {};

    if (series.type === "candles") {
      const open = slice.fields.open ?? new Float64Array();
      const high = slice.fields.high ?? new Float64Array();
      const low = slice.fields.low ?? new Float64Array();
      const close = slice.fields.close ?? new Float64Array();
      const volume = slice.fields.volume ?? new Float64Array();
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
      const values = slice.fields.value ?? new Float64Array();
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
      startMs: effectiveRange.startMs,
      endMs: effectiveRange.endMs,
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
          rightGutterWidth: this.rightGutterWidth,
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
            rightGutterWidth: this.rightGutterWidth,
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
    const series = this.getPrimarySeries(paneId);
    if (!series) return;
    if (pane.autoScale.get(series.scaleId) === false) return;
    const cutoffTime = this.getCutoffTime();
    const range: Range = {
      startMs: pane.visibleRange.startMs,
      endMs: cutoffTime !== undefined ? Math.min(pane.visibleRange.endMs, cutoffTime) : pane.visibleRange.endMs
    };
    const domain = computeSeriesDomain(series, range);
    if (domain) {
      pane.scaleDomains.set(series.scaleId, domain);
      this.transformEmitter.emit({ paneId });
    }
  }

  private emitVisibleRange(paneId: string, range: Range): void {
    const pane = this.ensurePane(paneId);
    if (!rangesEqual(pane.lastEmittedRange, range)) {
      pane.lastEmittedRange = { ...range };
      this.visibleRangeEmitter.emit({ paneId, range });
      this.transformEmitter.emit({ paneId });
    }
    const dataWindow = computeDataWindow(range, this.prefetchRatio);
    if (!rangesEqual(pane.lastEmittedDataWindow, dataWindow.range)) {
      pane.lastEmittedDataWindow = { ...dataWindow.range };
      this.dataWindowEmitter.emit({ paneId, range: dataWindow.range, prefetchRatio: dataWindow.prefetchRatio });
    }
    this.updateScaleDomain(paneId);
    this.requestRender();
  }

  private requestRender(): void {
    this.scheduler.requestFrame();
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
    const pane: PaneState = {
      id: paneId,
      order: this.paneOrderCounter++,
      layoutWeight: 1,
      plotArea: {
        x: 0,
        y: 0,
        width: Math.max(0, this.width - this.rightGutterWidth),
        height: this.height
      },
      visibleRange: { startMs: 0, endMs: 1 },
      scaleDomains: new Map([["price", { min: 0, max: 1 }]]),
      autoScale: new Map([["price", true]]),
      lastEmittedRange: null,
      lastEmittedDataWindow: null
    };
    this.panes.set(paneId, pane);
    this.recomputeLayout();
    return pane;
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
      pane.plotArea = {
        x: 0,
        y: yOffset,
        width: Math.max(0, this.width - this.rightGutterWidth),
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
    const cutoff = this.getCutoffTime();
    if (cutoff !== undefined) {
      const lastIndex = upperBound(times, cutoff) - 1;
      if (lastIndex < 0) return null;
      high = Math.min(high, lastIndex);
    }
    while (low <= high) {
      const mid = (low + high) >> 1;
      const value = times[mid];
      if (value === timeMs) return value;
      if (value < timeMs) low = mid + 1;
      else high = mid - 1;
    }
    const left = clamp(high, 0, times.length - 1);
    const right = clamp(low, 0, times.length - 1);
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
  lastEmittedRange: Range | null;
  lastEmittedDataWindow: Range | null;
};

type PaneRenderState = {
  paneId: string;
  plotArea: PlotArea;
  visibleRange: Range;
  scaleDomains: Record<string, ScaleDomain>;
  series: RenderSeries[];
};

type RenderSeriesCache = {
  version: number;
  startMs: TimeMs;
  endMs: TimeMs;
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

function findNearestIndex(times: Float64Array, timeMs: TimeMs, cutoff?: TimeMs): number | null {
  if (times.length === 0) return null;
  let low = 0;
  let high = times.length - 1;
  if (cutoff !== undefined) {
    const lastIndex = upperBound(times, cutoff) - 1;
    if (lastIndex < 0) return null;
    high = Math.min(high, lastIndex);
  }
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = times[mid];
    if (value === timeMs) return mid;
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  const left = clamp(high, 0, times.length - 1);
  const right = clamp(low, 0, times.length - 1);
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
