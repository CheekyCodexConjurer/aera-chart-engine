import type { TimeMs } from "./core.js";

export type ReplayMode = "off" | "arming" | "paused" | "playing";

export type ReplayState = {
  mode: ReplayMode;
  cutoffTimeMs?: TimeMs;
  previewTimeMs?: TimeMs;
  anchorTimeMs?: TimeMs;
  paddingBars?: number;
};
