import type { AxisPosition, PaneId, Range, ScaleId } from "./core.js";
import type { OverlayBatch } from "./overlays.js";
import type { ReplayState } from "./replay.js";
import type { SeriesData, SeriesDefinition } from "./series.js";

export type DiagnosticSeverity = "info" | "warn" | "error" | "fatal";

export type Diagnostic = {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  recoverable: boolean;
  context?: Record<string, unknown>;
};

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type LogEvent = {
  timestamp: string;
  sessionId: string;
  chartId: string;
  engineVersion: string;
  engineContractVersion: string;
  level: LogLevel;
  eventType: string;
  context?: Record<string, unknown>;
};

export type RendererMetrics = {
  frameCount: number;
  lastFrame: {
    drawCalls: number;
    batchCount: number;
    stateChanges: number;
    bufferUploads: number;
    bufferAllocations: number;
    bufferBytes: number;
    bufferReuses: number;
  };
  totals: {
    drawCalls: number;
    batchCount: number;
    stateChanges: number;
    bufferUploads: number;
    bufferAllocations: number;
    bufferBytes: number;
    bufferReuses: number;
  };
  textAtlas: {
    pages: number;
    glyphs: number;
    capacity: number;
    occupancy: number;
    evictions: number;
  };
};

export type EngineMetrics = {
  lodCacheHits: number;
  lodCacheMisses: number;
  lodCacheEvictions: number;
  lodSelectionChanges: number;
  renderCacheHits: number;
  renderCacheMisses: number;
};

export type EngineMetricsSnapshot = {
  renderer: RendererMetrics | null;
  engine: EngineMetrics;
};

export type ReproTimeAxisConfig = {
  tickCount?: number;
};

export type ReproScaleSnapshot = {
  scaleId: ScaleId;
  position: AxisPosition;
  visible: boolean;
  tickCount?: number;
  autoScale: boolean;
  domain?: { min: number; max: number };
};

export type ReproPaneSnapshot = {
  paneId: PaneId;
  layoutWeight: number;
  visibleRange: Range;
  renderWindow?: Range | null;
  primaryScaleId: ScaleId;
  scales: ReproScaleSnapshot[];
};

export type ReproSeriesSnapshot = {
  definition: SeriesDefinition;
  data: SeriesData;
  version: number;
};

export type ReproEngineOptions = {
  width?: number;
  height?: number;
  devicePixelRatio?: number;
  rightGutterWidth?: number;
  leftGutterWidth?: number;
  axisLabelCharWidth?: number;
  axisLabelPadding?: number;
  axisLabelHeight?: number;
  prefetchRatio?: number;
  dataWindowMaxPending?: number;
  gapThresholdRatio?: number;
  paneGap?: number;
  hitTestRadiusPx?: number;
  lodHysteresisRatio?: number;
  lodCacheEntries?: number;
  crosshairSync?: boolean;
  keyboardPanFraction?: number;
  keyboardZoomFactor?: number;
  timeAxisConfig?: ReproTimeAxisConfig;
  chartId?: string;
  sessionId?: string;
  logEventLimit?: number;
};

export type ReproBundle = {
  bundleFormatVersion: string;
  meta: {
    engineVersion: string;
    engineContractVersion: string;
    timestamp: string;
    sessionId: string;
    chartId: string;
    platform: string;
  };
  options: ReproEngineOptions;
  view: {
    panes: ReproPaneSnapshot[];
    replayState: ReplayState;
  };
  inputs: {
    series: ReproSeriesSnapshot[];
    overlays: OverlayBatch[];
  };
  events: LogEvent[];
  diagnostics: Diagnostic[];
  metrics: EngineMetricsSnapshot;
};
