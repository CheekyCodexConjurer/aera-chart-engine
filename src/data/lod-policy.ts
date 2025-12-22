import { SeriesType } from "../api/public-types.js";

export type LodLevel = "coarse" | "fine";

export type LodPolicy = {
  coarsePointsPerPixel: number;
  finePointsPerPixel: number;
  hysteresisRatio: number;
};

export type LodSelection = {
  level: LodLevel;
  pointsPerPixel: number;
  maxPoints: number;
  density: number;
  threshold: number;
};

export function policyForSeries(type: SeriesType, hysteresisRatio: number): LodPolicy {
  const ratio = clampRatio(hysteresisRatio);
  if (type === "candles" || type === "histogram") {
    return {
      coarsePointsPerPixel: 0.5,
      finePointsPerPixel: 1,
      hysteresisRatio: ratio
    };
  }
  return {
    coarsePointsPerPixel: 1,
    finePointsPerPixel: 2,
    hysteresisRatio: ratio
  };
}

export function selectLod(
  visibleCount: number,
  width: number,
  policy: LodPolicy,
  previousLevel?: LodLevel
): LodSelection {
  const safeWidth = Math.max(1, width);
  const density = visibleCount / safeWidth;
  const threshold = (policy.coarsePointsPerPixel + policy.finePointsPerPixel) * 0.5;
  let desired: LodLevel = density >= threshold ? "coarse" : "fine";
  if (previousLevel) {
    if (previousLevel === "coarse") {
      const release = threshold * (1 - policy.hysteresisRatio);
      if (density > release) desired = "coarse";
      else desired = "fine";
    } else {
      const engage = threshold * (1 + policy.hysteresisRatio);
      if (density < engage) desired = "fine";
      else desired = "coarse";
    }
  }
  const pointsPerPixel = desired === "coarse" ? policy.coarsePointsPerPixel : policy.finePointsPerPixel;
  const maxPoints = Math.max(2, Math.floor(safeWidth * pointsPerPixel));
  return {
    level: desired,
    pointsPerPixel,
    maxPoints,
    density,
    threshold
  };
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.15;
  return Math.min(0.5, Math.max(0.05, value));
}
