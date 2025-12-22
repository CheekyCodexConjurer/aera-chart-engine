import type { PaneId, PlotArea, ScaleId, TimeMs } from "./core.js";

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
