import type { PaneId, ScaleId } from "./core.js";

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
