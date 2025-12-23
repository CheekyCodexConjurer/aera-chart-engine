import type {
  AxisLabelMeasure,
  CrosshairEvent,
  DataWindowRequestEvent,
  EngineMetrics,
  HitTestEvent,
  LayoutChangeEvent,
  OverlayLayoutEvent,
  Range,
  ReplayState,
  TransformEvent,
  TimeAxisConfig,
  VisibleRangeEvent
} from "../../api/public-types.js";
import type { LruCache } from "../../data/cache.js";
import type { ComputePipeline } from "../../compute/pipeline.js";
import type { PointerState } from "../../interaction/pointer.js";
import type { InteractionStateMachine } from "../../interaction/state-machine.js";
import type { RenderSeries, Renderer } from "../../rendering/renderer.js";
import type { DiagnosticsStore } from "../diagnostics.js";
import type { EventEmitter } from "../events.js";
import type { LogStore } from "../log-store.js";
import type { FrameScheduler } from "../scheduler.js";
import type { OverlayStore } from "../overlays.js";
import type { SeriesState } from "../series.js";
import type { ChartEngine } from "../chart-engine.js";
import type { LodState, PaneState, RenderSeriesCache } from "./state.js";

export type PanAnchor = { paneId: string; range: Range; screenX: number };

export type EngineContext = {
  diagnostics: DiagnosticsStore;
  logStore: LogStore;
  chartId: string;
  sessionId: string;
  logEventLimit: number;
  renderer: Renderer;
  scheduler: FrameScheduler;
  panes: Map<string, PaneState>;
  series: Map<string, SeriesState>;
  overlays: OverlayStore;
  computePipeline: ComputePipeline;
  renderCache: Map<string, RenderSeriesCache>;
  lodCache: LruCache<string, RenderSeries>;
  lodState: Map<string, LodState>;
  replayState: ReplayState;
  frameId: number;
  interaction: InteractionStateMachine;
  pointer: PointerState;
  pointerCapturePaneId: string | null;
  panAnchor: PanAnchor | null;
  pendingCrosshairMove: CrosshairEvent | null;
  crosshairMoveScheduled: boolean;
  crosshairState: CrosshairEvent | null;
  engineMetrics: EngineMetrics;

  visibleRangeEmitter: EventEmitter<VisibleRangeEvent>;
  transformEmitter: EventEmitter<TransformEvent>;
  layoutEmitter: EventEmitter<LayoutChangeEvent>;
  overlayLayoutEmitter: EventEmitter<OverlayLayoutEvent>;
  crosshairMoveEmitter: EventEmitter<CrosshairEvent>;
  crosshairClickEmitter: EventEmitter<CrosshairEvent>;
  hitTestEmitter: EventEmitter<HitTestEvent>;
  diagnosticsEmitter: EventEmitter<void>;
  dataWindowEmitter: EventEmitter<DataWindowRequestEvent>;

  width: number;
  height: number;
  devicePixelRatio: number;
  baseRightGutterWidth: number;
  baseLeftGutterWidth: number;
  axisLabelCharWidth: number;
  axisLabelPadding: number;
  axisLabelHeight: number;
  axisLabelMeasure?: AxisLabelMeasure;
  timeAxisConfig: TimeAxisConfig;
  prefetchRatio: number;
  paneGap: number;
  paneOrderCounter: number;
  hitTestRadiusPx: number;
  pendingHitTest: HitTestEvent | null;
  hitTestScheduled: boolean;
  lodHysteresisRatio: number;
  lodCacheEntries: number;
  crosshairSync: boolean;
  keyboardPanFraction: number;
  keyboardZoomFactor: number;
  dataWindowRequestId: number;
  dataWindowMaxPending: number;
  gapThresholdRatio: number;
};

export function getEngineContext(engine: ChartEngine): EngineContext {
  return engine as unknown as EngineContext;
}
