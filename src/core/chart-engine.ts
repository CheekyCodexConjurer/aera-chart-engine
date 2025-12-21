import {
  ChartEngineOptions,
  CrosshairEvent,
  OverlayBatch,
  Range,
  ReplayState,
  SeriesData,
  SeriesDefinition,
  SeriesUpdate,
  SeriesUpdateType,
  TimeMs,
  VisibleRangeEvent
} from "../api/public-types.js";
import { DiagnosticsStore } from "./diagnostics.js";
import { EventEmitter } from "./events.js";
import { FrameScheduler } from "./scheduler.js";
import { computeDataWindow } from "../data/window.js";
import { validateSeriesData } from "../data/validation.js";
import { appendSnapshot, createSnapshot, patchSnapshot, prependSnapshot } from "../data/snapshot.js";
import { computeSeriesDomain, normalizeSeries, SeriesState, updateApproxBarInterval } from "./series.js";
import { InteractionStateMachine } from "../interaction/state-machine.js";
import { PointerState } from "../interaction/pointer.js";
import { clipOverlay, isOverlaySupported, OverlayStore } from "./overlays.js";
import { PlotArea, ScaleDomain, timeToX, xToTime, priceToY, yToPrice } from "./transform.js";
import { Renderer, RenderFrame, RenderSeries } from "../rendering/renderer.js";
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
  private replayState: ReplayState = { mode: "off" };
  private frameId = 0;
  private interaction = new InteractionStateMachine();
  private pointer = new PointerState();
  private panAnchor: { paneId: string; range: Range; screenX: number } | null = null;

  private visibleRangeEmitter = new EventEmitter<VisibleRangeEvent>();
  private transformEmitter = new EventEmitter<{ paneId: string }>();
  private crosshairMoveEmitter = new EventEmitter<CrosshairEvent>();
  private crosshairClickEmitter = new EventEmitter<CrosshairEvent>();
  private diagnosticsEmitter = new EventEmitter<void>();
  private dataWindowEmitter = new EventEmitter<DataWindowRequestEvent>();

  private width: number;
  private height: number;
  private devicePixelRatio: number;
  private rightGutterWidth: number;
  private prefetchRatio: number;

  constructor(options: ChartEngineInitOptions = {}) {
    this.width = options.width ?? 800;
    this.height = options.height ?? 600;
    this.devicePixelRatio = options.devicePixelRatio ?? 1;
    this.rightGutterWidth = options.rightGutterWidth ?? 60;
    this.prefetchRatio = options.prefetchRatio ?? 0.2;
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

  onCrosshairMove(listener: (event: CrosshairEvent) => void): () => void {
    return this.crosshairMoveEmitter.subscribe(listener);
  }

  onCrosshairClick(listener: (event: CrosshairEvent) => void): () => void {
    return this.crosshairClickEmitter.subscribe(listener);
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
  }

  setViewportSize(width: number, height: number, devicePixelRatio?: number): void {
    this.width = width;
    this.height = height;
    if (devicePixelRatio !== undefined) {
      this.devicePixelRatio = devicePixelRatio;
    }
    for (const pane of this.panes.values()) {
      pane.plotArea = this.computePlotArea();
    }
    this.renderer.resize?.(this.width, this.height, this.devicePixelRatio);
    this.transformEmitter.emit({ paneId: "price" });
    this.requestRender();
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
    this.requestRender();
  }

  setOverlays(batch: OverlayBatch): void {
    for (const overlay of batch.overlays) {
      if (!isOverlaySupported(overlay.type)) {
        this.diagnostics.addWarn("overlay.unsupported", "overlay type is not supported", {
          batchId: batch.batchId,
          overlayId: overlay.id,
          type: overlay.type
        });
      }
    }
    this.overlays.setBatch(batch);
    this.requestRender();
  }

  removeOverlayBatch(batchId: string): void {
    this.overlays.removeBatch(batchId);
    this.requestRender();
  }

  setReplayState(state: ReplayState): void {
    this.replayState = state;
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
    this.interaction.setState("hover");
    this.pointer.update({ x, y });
    const timeMs = this.xToTime(paneId, x);
    if (timeMs === null) return;
    const price = this.yToPrice(paneId, this.getPrimaryScaleId(paneId), y);
    const nearest = this.findNearestTime(paneId, timeMs);
    this.crosshairMoveEmitter.emit({
      paneId,
      timeMs,
      nearestTimeMs: nearest,
      price,
      screen: { x, y }
    });
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

  endPan(): void {
    if (this.interaction.getState() === "active-drag") {
      this.interaction.setState("idle");
    }
    this.panAnchor = null;
  }

  setScaleDomain(paneId: string, scaleId: string, domain: ScaleDomain): void {
    const pane = this.ensurePane(paneId);
    pane.scaleDomains.set(scaleId, domain);
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
        scaleDomain: pane.scaleDomains.get(this.getPrimaryScaleId(pane.id)) ?? { min: 0, max: 1 },
        series: this.collectSeriesForPane(pane.id)
      });
    }

    const frame: RenderFrame = {
      frameId: this.frameId,
      panes,
      overlays
    };
    this.renderer.render(frame);
  }

  private collectSeriesForPane(paneId: string): RenderSeries[] {
    const result: RenderSeries[] = [];
    for (const series of this.series.values()) {
      if (series.paneId !== paneId || !series.snapshot) continue;
      result.push({
        id: series.id,
        type: series.type,
        paneId: series.paneId,
        scaleId: series.scaleId,
        timeMs: series.snapshot.timeMs,
        fields: series.snapshot.fields
      });
    }
    return result;
  }

  private updateScaleDomain(paneId: string): void {
    const pane = this.ensurePane(paneId);
    const series = this.getPrimarySeries(paneId);
    if (!series) return;
    const domain = computeSeriesDomain(series, pane.visibleRange);
    if (domain) {
      pane.scaleDomains.set(series.scaleId, domain);
      this.transformEmitter.emit({ paneId });
    }
  }

  private emitVisibleRange(paneId: string, range: Range): void {
    this.visibleRangeEmitter.emit({ paneId, range });
    const dataWindow = computeDataWindow(range, this.prefetchRatio);
    this.dataWindowEmitter.emit({ paneId, range: dataWindow.range, prefetchRatio: dataWindow.prefetchRatio });
    this.requestRender();
  }

  private requestRender(): void {
    this.scheduler.requestFrame();
  }

  private ensurePane(paneId: string): PaneState {
    const existing = this.panes.get(paneId);
    if (existing) return existing;
    const pane: PaneState = {
      id: paneId,
      plotArea: this.computePlotArea(),
      visibleRange: { startMs: 0, endMs: 1 },
      scaleDomains: new Map([["price", { min: 0, max: 1 }]])
    };
    this.panes.set(paneId, pane);
    return pane;
  }

  private computePlotArea(): PlotArea {
    return {
      x: 0,
      y: 0,
      width: Math.max(0, this.width - this.rightGutterWidth),
      height: this.height
    };
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
}

type PaneState = {
  id: string;
  plotArea: PlotArea;
  visibleRange: Range;
  scaleDomains: Map<string, ScaleDomain>;
};

type PaneRenderState = {
  paneId: string;
  plotArea: PlotArea;
  scaleDomain: ScaleDomain;
  series: RenderSeries[];
};
