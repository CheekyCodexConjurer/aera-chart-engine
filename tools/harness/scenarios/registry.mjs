const BASE_TIME_MS = 1_700_000_000_000;
const ONE_MINUTE_MS = 60_000;
const DEFAULT_LAYOUT = [
  { paneId: "price", weight: 1 }
];

function buildReplayTrace(barCount, stepMs) {
  const lastTime = BASE_TIME_MS + (barCount - 1) * stepMs;
  const midTime = BASE_TIME_MS + Math.floor(barCount * 0.6) * stepMs;
  const lateTime = BASE_TIME_MS + Math.floor(barCount * 0.85) * stepMs;
  const previewTime = Math.min(lastTime, lateTime + stepMs * 50);
  return [
    { mode: "paused", cutoffTimeMs: midTime },
    { mode: "paused", cutoffTimeMs: lateTime },
    { mode: "paused", cutoffTimeMs: lateTime, previewTimeMs: previewTime },
    { mode: "off" }
  ];
}

export const SCENARIOS = {
  "baseline-10k": {
    id: "baseline-10k",
    seed: 10101,
    barCount: 10_000,
    visibleTarget: 2_000,
    stepMs: ONE_MINUTE_MS,
    startTimeMs: BASE_TIME_MS,
    pattern: "baseline",
    overlayProfile: "basic",
    paneLayout: DEFAULT_LAYOUT
  },
  "baseline-100k": {
    id: "baseline-100k",
    seed: 20202,
    barCount: 100_000,
    visibleTarget: 2_000,
    stepMs: ONE_MINUTE_MS,
    startTimeMs: BASE_TIME_MS,
    pattern: "baseline",
    overlayProfile: "none",
    paneLayout: DEFAULT_LAYOUT
  },
  "baseline-1m": {
    id: "baseline-1m",
    seed: 30303,
    barCount: 1_000_000,
    visibleTarget: 2_000,
    stepMs: ONE_MINUTE_MS,
    startTimeMs: BASE_TIME_MS,
    pattern: "baseline",
    overlayProfile: "none",
    paneLayout: DEFAULT_LAYOUT
  },
  "gaps-sessions": {
    id: "gaps-sessions",
    seed: 40404,
    barCount: 100_000,
    visibleTarget: 2_000,
    stepMs: ONE_MINUTE_MS,
    startTimeMs: BASE_TIME_MS,
    pattern: "gaps",
    overlayProfile: "basic",
    paneLayout: DEFAULT_LAYOUT
  },
  "burst-append": {
    id: "burst-append",
    seed: 50505,
    barCount: 100_000,
    visibleTarget: 2_000,
    stepMs: ONE_MINUTE_MS,
    startTimeMs: BASE_TIME_MS,
    pattern: "baseline",
    overlayProfile: "none",
    paneLayout: DEFAULT_LAYOUT
  },
  "streaming-50hz": {
    id: "streaming-50hz",
    seed: 60606,
    barCount: 10_000,
    visibleTarget: 1_000,
    stepMs: ONE_MINUTE_MS,
    startTimeMs: BASE_TIME_MS,
    pattern: "baseline",
    overlayProfile: "none",
    paneLayout: DEFAULT_LAYOUT
  },
  "overlay-storm": {
    id: "overlay-storm",
    seed: 70707,
    barCount: 100_000,
    visibleTarget: 2_000,
    stepMs: ONE_MINUTE_MS,
    startTimeMs: BASE_TIME_MS,
    pattern: "baseline",
    overlayProfile: "storm",
    paneLayout: DEFAULT_LAYOUT
  },
  "replay-scrub": {
    id: "replay-scrub",
    seed: 80808,
    barCount: 100_000,
    visibleTarget: 2_000,
    stepMs: ONE_MINUTE_MS,
    startTimeMs: BASE_TIME_MS,
    pattern: "baseline",
    overlayProfile: "basic",
    paneLayout: DEFAULT_LAYOUT,
    replayTrace: buildReplayTrace(100_000, ONE_MINUTE_MS)
  }
};

export function listScenarioIds() {
  return Object.keys(SCENARIOS);
}

export function getScenarioSpec(id) {
  const spec = SCENARIOS[id];
  if (!spec) {
    throw new Error(`Unknown scenario: ${id}`);
  }
  return spec;
}
