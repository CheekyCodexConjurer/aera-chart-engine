export type TimeMs = number;
export type PaneId = string;
export type ScaleId = string;

export type AxisPosition = "left" | "right";

export type AxisLabelFormatter = (value: number) => string;

export type TimeAxisLabelFormatter = (timeMs: TimeMs, stepMs: number) => string;

export type ScaleConfig = {
  position?: AxisPosition;
  visible?: boolean;
  tickCount?: number;
  labelFormatter?: AxisLabelFormatter;
};

export type TimeAxisConfig = {
  tickCount?: number;
  labelFormatter?: TimeAxisLabelFormatter;
};

export type AxisLabelMeasure = (text: string) => number;

export type Range = {
  startMs: TimeMs;
  endMs: TimeMs;
};

export type Point = {
  x: number;
  y: number;
};

export type PlotArea = {
  x: number;
  y: number;
  width: number;
  height: number;
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

export type LayoutChangeEvent = {
  paneId: PaneId;
  plotArea: PlotArea;
  index: number;
  count: number;
};

export type CrosshairEvent = {
  paneId: PaneId;
  timeMs: TimeMs;
  nearestTimeMs: TimeMs | null;
  price: number | null;
  screen: Point;
};

export type SeriesHit = {
  seriesId: string;
  paneId: PaneId;
  scaleId: ScaleId;
  timeMs: TimeMs;
  index: number;
  value?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  distancePx?: number;
};

export type OverlayHit = {
  overlayId: string;
  paneId: PaneId;
  scaleId: ScaleId;
  type: OverlayPrimitiveType;
  timeMs?: TimeMs;
  value?: number;
  text?: string;
  distancePx?: number;
};

export type HitTestEvent = {
  paneId: PaneId;
  timeMs: TimeMs;
  screen: Point;
  series: SeriesHit[];
  overlays: OverlayHit[];
};

export type KeyCommand =
  | "pan-left"
  | "pan-right"
  | "zoom-in"
  | "zoom-out"
  | "reset-latest"
  | "reset-anchor";

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

export type TableOverlayPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "bottom-center"
  | "middle-left"
  | "middle-right"
  | "middle-center";

export type TableOverlayCell = {
  id?: string;
  text: string;
  role?: "label" | "value";
  variant?: string;
};

export type TableOverlayRow = {
  id?: string;
  cells: TableOverlayCell[];
};

export type TableOverlayData = {
  position?: TableOverlayPosition;
  anchorTimeMs?: TimeMs;
  rows: TableOverlayRow[];
};

export type RightLabelEntry = {
  id?: string;
  price: number;
  text: string;
  timeMs?: TimeMs;
  color?: string;
  sizePx?: number;
};

export type RightLabelOverlayData = {
  labels: RightLabelEntry[];
};

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

export type AreaOverlayData = {
  points: OverlayPoint[];
  step?: boolean;
  baseValue?: number;
};

export type HistogramOverlayData = {
  points: OverlayPoint[];
  baseValue?: number;
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

export type OverlayLayoutItem =
  | {
      type: "table";
      overlayId: string;
      paneId: PaneId;
      position: TableOverlayPosition;
      plotArea: PlotArea;
      rightGutterWidth: number;
      rows: TableOverlayRow[];
      anchorTimeMs?: TimeMs;
      layer?: OverlayLayer;
      zIndex?: number;
    }
  | {
      type: "right-label";
      overlayId: string;
      labelId?: string;
      paneId: PaneId;
      scaleId: ScaleId;
      plotArea: PlotArea;
      rightGutterWidth: number;
      price: number;
      text: string;
      timeMs?: TimeMs;
      color?: string;
      sizePx?: number;
      y: number;
      layer?: OverlayLayer;
      zIndex?: number;
    };

export type OverlayLayoutEvent = {
  frameId: number;
  items: OverlayLayoutItem[];
};

export type PaneLayoutEntry = {
  paneId: PaneId;
  weight?: number;
};

export type PaneLayout = PaneLayoutEntry[];

export type ChartEngineOptions = {
  width?: number;
  height?: number;
  devicePixelRatio?: number;
  rightGutterWidth?: number;
  leftGutterWidth?: number;
  axisLabelCharWidth?: number;
  axisLabelPadding?: number;
  axisLabelHeight?: number;
  axisLabelMeasure?: AxisLabelMeasure;
  timeAxisConfig?: TimeAxisConfig;
  prefetchRatio?: number;
  paneGap?: number;
  hitTestRadiusPx?: number;
  lodHysteresisRatio?: number;
  lodCacheEntries?: number;
  crosshairSync?: boolean;
  keyboardPanFraction?: number;
  keyboardZoomFactor?: number;
};
