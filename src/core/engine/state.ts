import type { Range, ScaleConfig, TimeMs } from "../../api/public-types.js";
import type { LodLevel } from "../../data/lod-policy.js";
import type { RenderSeries } from "../../rendering/renderer.js";
import type { AxisTick } from "../axis.js";
import type { PlotArea, ScaleDomain } from "../transform.js";

export type PaneState = {
  id: string;
  order: number;
  layoutWeight: number;
  plotArea: PlotArea;
  visibleRange: Range;
  scaleDomains: Map<string, ScaleDomain>;
  autoScale: Map<string, boolean>;
  scaleConfigs: Map<string, ScaleConfigState>;
  leftGutterWidth: number;
  rightGutterWidth: number;
  axisTicks: Map<string, AxisTick[]>;
  timeTicks: AxisTick[];
  primaryScaleId: string;
  lastEmittedRange: Range | null;
  renderWindow: Range | null;
  dataWindowCoverage: Range | null;
  pendingDataWindow: Range | null;
  lastRequestedDataWindow: Range | null;
  lastCoverageWarning: Range | null;
  lastScaleConflict: { left: string[]; right: string[] } | null;
};

export type ScaleConfigState = {
  position: "left" | "right";
  visible: boolean;
  tickCount?: number;
  labelFormatter?: ScaleConfig["labelFormatter"];
};

export type PaneRenderState = {
  paneId: string;
  plotArea: PlotArea;
  visibleRange: Range;
  scaleDomains: Record<string, ScaleDomain>;
  series: RenderSeries[];
  axis: {
    left: { scaleId: string; position: "left"; ticks: AxisTick[]; visible: boolean }[];
    right: { scaleId: string; position: "right"; ticks: AxisTick[]; visible: boolean }[];
    time: AxisTick[];
    primaryScaleId: string;
    leftGutterWidth: number;
    rightGutterWidth: number;
  };
};

export type RenderSeriesCache = {
  version: number;
  windowStartMs: TimeMs;
  windowEndMs: TimeMs;
  maxPoints: number;
  cutoffTime?: TimeMs;
  series: RenderSeries;
};

export type LodState = {
  level: LodLevel;
  density: number;
  pointsPerPixel: number;
};
