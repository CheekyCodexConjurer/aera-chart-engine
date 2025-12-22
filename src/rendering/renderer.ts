import { PlotArea, ScaleDomain } from "../core/transform.js";
import { OverlayRenderItem } from "../core/overlays.js";
import { Range, SeriesType, TimeMs } from "../api/public-types.js";

export type RenderSeries = {
  id: string;
  type: SeriesType;
  paneId: string;
  scaleId: string;
  timeMs: Float64Array;
  fields: Record<string, Float64Array>;
};

export type PaneRenderState = {
  paneId: string;
  plotArea: PlotArea;
  visibleRange: Range;
  scaleDomains: Record<string, ScaleDomain>;
  series: RenderSeries[];
};

export type RenderFrame = {
  frameId: number;
  panes: PaneRenderState[];
  overlays: OverlayRenderItem[];
  crosshairs?: RenderCrosshair[];
};

export type RenderCrosshair = {
  paneId: string;
  timeMs: TimeMs;
  x: number;
  y?: number;
  price?: number | null;
  showVertical: boolean;
  showHorizontal: boolean;
  showTimeLabel: boolean;
  showPriceLabel: boolean;
};

export interface Renderer {
  initialize?(): void;
  resize?(width: number, height: number, devicePixelRatio: number): void;
  render(frame: RenderFrame): void;
}
