import type { PaneId, PlotArea, Point, Range, ScaleId, TimeMs } from "./core.js";
import type { OverlayPrimitiveType } from "./overlays.js";

export type VisibleRangeEvent = {
  paneId: PaneId;
  range: Range;
};

export type DataWindowRequestReason = "render-window" | "coverage-gap" | "backpressure";

export type DataWindowRequestEvent = {
  paneId: PaneId;
  range: Range;
  prefetchRatio: number;
  requestId: number;
  reason: DataWindowRequestReason;
  pendingCount: number;
};

export type TransformEvent = {
  paneId: PaneId;
  plotArea: PlotArea;
  visibleRange: Range;
  leftGutterWidth: number;
  rightGutterWidth: number;
  devicePixelRatio: number;
};

export type LayoutChangeEvent = {
  paneId: PaneId;
  plotArea: PlotArea;
  index: number;
  count: number;
  leftGutterWidth: number;
  rightGutterWidth: number;
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
