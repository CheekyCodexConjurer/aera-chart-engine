import { PlotArea, ScaleDomain } from "../core/transform.js";
import { OverlayRenderItem } from "../core/overlays.js";
import { CrosshairEvent, Range, SeriesType } from "../api/public-types.js";

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
  crosshair?: CrosshairEvent | null;
};

export interface Renderer {
  initialize?(): void;
  resize?(width: number, height: number, devicePixelRatio: number): void;
  render(frame: RenderFrame): void;
}
