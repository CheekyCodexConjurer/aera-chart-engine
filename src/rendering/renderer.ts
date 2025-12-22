import { PlotArea, ScaleDomain } from "../core/transform.js";
import { OverlayRenderItem } from "../core/overlays.js";
import { AxisPosition, Diagnostic, Range, RendererMetrics, SeriesType, TimeMs } from "../api/public-types.js";
import { AxisTick } from "../core/axis.js";

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
  axis: AxisRenderState;
};

export type AxisScaleRender = {
  scaleId: string;
  position: AxisPosition;
  ticks: AxisTick[];
  visible: boolean;
};

export type AxisRenderState = {
  left: AxisScaleRender[];
  right: AxisScaleRender[];
  time: AxisTick[];
  primaryScaleId: string;
  leftGutterWidth: number;
  rightGutterWidth: number;
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
  removeSeries?(seriesId: string): void;
  setDiagnostics?(handler: (diag: Diagnostic) => void): void;
  getMetrics?(): RendererMetrics;
}
