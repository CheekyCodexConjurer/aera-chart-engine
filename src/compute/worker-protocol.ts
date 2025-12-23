import type {
  ComputeRequest,
  ComputeResult,
  Diagnostic,
  WorkerStatus
} from "../api/public-types.js";
import type { RenderFrame } from "../rendering/renderer.js";

export type RenderCommand =
  | { type: "initialize" }
  | { type: "resize"; width: number; height: number; devicePixelRatio: number }
  | { type: "render"; frame: RenderFrame }
  | { type: "removeSeries"; seriesId: string };

export type WorkerMessage =
  | { type: "compute_request"; request: ComputeRequest; requestId: number }
  | { type: "compute_result"; result: ComputeResult; requestId?: number }
  | { type: "compute_cancel_indicator"; indicatorId: string; version?: number }
  | { type: "compute_cancel_window"; windowId: string }
  | { type: "compute_cancel_request"; indicatorId: string; windowId: string; version: number }
  | { type: "render_command"; command: RenderCommand }
  | { type: "diagnostic"; diagnostic: Diagnostic }
  | { type: "status"; status: WorkerStatus };
