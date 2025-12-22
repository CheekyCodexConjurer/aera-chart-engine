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

export type EngineInfo = {
  engineVersion: string;
  engineContractVersion: string;
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
  chartId?: string;
  sessionId?: string;
  logEventLimit?: number;
};
