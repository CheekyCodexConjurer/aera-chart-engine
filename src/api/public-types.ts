export type TimeMs = number;
export type PaneId = string;
export type ScaleId = string;

export type Range = {
  startMs: TimeMs;
  endMs: TimeMs;
};

export type Point = {
  x: number;
  y: number;
};

export type DiagnosticSeverity = "info" | "warn" | "error" | "fatal";

export type Diagnostic = {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  recoverable: boolean;
  context?: Record<string, unknown>;
};

export type ReplayMode = "off" | "arming" | "paused" | "playing";

export type ReplayState = {
  mode: ReplayMode;
  cutoffTimeMs?: TimeMs;
  previewTimeMs?: TimeMs;
  anchorTimeMs?: TimeMs;
  paddingBars?: number;
};

export type VisibleRangeEvent = {
  paneId: PaneId;
  range: Range;
};

export type TransformEvent = {
  paneId: PaneId;
};

export type CrosshairEvent = {
  paneId: PaneId;
  timeMs: TimeMs;
  nearestTimeMs: TimeMs | null;
  price: number | null;
  screen: Point;
};

export type SeriesType = "candles" | "line" | "area" | "histogram";

export type SeriesDefinition = {
  id: string;
  type: SeriesType;
  paneId?: PaneId;
  scaleId?: ScaleId;
};

export type CandleSeriesData = {
  timeMs: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume?: number[];
};

export type LineSeriesData = {
  timeMs: number[];
  value: number[];
};

export type SeriesData = CandleSeriesData | LineSeriesData;

export type SeriesUpdateType = "append" | "prepend" | "patch" | "replace";

export type SeriesUpdate = {
  type: SeriesUpdateType;
  data: SeriesData;
};

export type OverlayLayer = "below" | "above" | "ui";

export type OverlayPrimitiveType =
  | "line"
  | "hline"
  | "zone"
  | "marker"
  | "label"
  | "histogram"
  | "area"
  | "table"
  | "right-label";

export type OverlayPoint = {
  timeMs: TimeMs;
  value: number;
};

export type OverlayPrimitive = {
  id: string;
  type: OverlayPrimitiveType;
  paneId?: PaneId;
  scaleId?: ScaleId;
  layer?: OverlayLayer;
  zIndex?: number;
  data: unknown;
};

export type LineOverlayData = {
  points: OverlayPoint[];
  step?: boolean;
};

export type HLineOverlayData = {
  value: number;
  fromTimeMs?: TimeMs;
  toTimeMs?: TimeMs;
};

export type ZoneOverlayData = {
  points: { timeMs: TimeMs; top: number; bottom: number }[];
};

export type MarkerOverlayData = {
  points: OverlayPoint[];
  shape?: string;
};

export type LabelOverlayData = {
  points: { timeMs: TimeMs; value: number; text: string }[];
};

export type OverlayBatch = {
  batchId: string;
  overlays: OverlayPrimitive[];
};

export type ChartEngineOptions = {
  width?: number;
  height?: number;
  devicePixelRatio?: number;
  rightGutterWidth?: number;
  prefetchRatio?: number;
};
