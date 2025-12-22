import type { OverlayBatch } from "./overlays.js";

export type ComputePriority = "low" | "normal" | "high";

export type ComputeRequest = {
  indicatorId: string;
  windowId: string;
  version: number;
  payload: unknown;
  seriesId?: string;
  priority?: ComputePriority;
};

export type ComputeResult = {
  indicatorId: string;
  windowId: string;
  version: number;
  batch: OverlayBatch;
  seriesId?: string;
};
