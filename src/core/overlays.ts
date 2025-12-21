import {
  HLineOverlayData,
  LabelOverlayData,
  LineOverlayData,
  MarkerOverlayData,
  OverlayBatch,
  OverlayPrimitive,
  OverlayPrimitiveType,
  TimeMs,
  ZoneOverlayData
} from "../api/public-types.js";

export type OverlayRenderItem = {
  overlay: OverlayPrimitive;
  clippedData: unknown;
};

const SUPPORTED_TYPES: Set<OverlayPrimitiveType> = new Set([
  "line",
  "hline",
  "zone",
  "marker",
  "label"
]);

export function isOverlaySupported(type: OverlayPrimitiveType): boolean {
  return SUPPORTED_TYPES.has(type);
}

export class OverlayStore {
  private batches = new Map<string, OverlayPrimitive[]>();

  setBatch(batch: OverlayBatch): void {
    this.batches.set(batch.batchId, batch.overlays);
  }

  removeBatch(batchId: string): void {
    this.batches.delete(batchId);
  }

  getAll(): OverlayPrimitive[] {
    const overlays: OverlayPrimitive[] = [];
    for (const batch of this.batches.values()) {
      overlays.push(...batch);
    }
    return overlays;
  }
}

function clipPoints(points: { timeMs: TimeMs }[], cutoffTimeMs?: TimeMs): { timeMs: TimeMs }[] {
  if (cutoffTimeMs === undefined) return points;
  return points.filter((point) => point.timeMs <= cutoffTimeMs);
}

export function clipOverlay(overlay: OverlayPrimitive, cutoffTimeMs?: TimeMs): OverlayRenderItem {
  switch (overlay.type) {
    case "line": {
      const data = overlay.data as LineOverlayData;
      const points = clipPoints(data.points, cutoffTimeMs) as LineOverlayData["points"];
      return { overlay, clippedData: { ...data, points } };
    }
    case "marker": {
      const data = overlay.data as MarkerOverlayData;
      const points = clipPoints(data.points, cutoffTimeMs) as MarkerOverlayData["points"];
      return { overlay, clippedData: { ...data, points } };
    }
    case "label": {
      const data = overlay.data as LabelOverlayData;
      const points = clipPoints(data.points, cutoffTimeMs) as LabelOverlayData["points"];
      return { overlay, clippedData: { ...data, points } };
    }
    case "zone": {
      const data = overlay.data as ZoneOverlayData;
      const points = clipPoints(data.points, cutoffTimeMs) as ZoneOverlayData["points"];
      return { overlay, clippedData: { ...data, points } };
    }
    case "hline": {
      const data = overlay.data as HLineOverlayData;
      if (cutoffTimeMs !== undefined && data.fromTimeMs && data.fromTimeMs > cutoffTimeMs) {
        return { overlay, clippedData: { ...data, fromTimeMs: cutoffTimeMs, toTimeMs: cutoffTimeMs } };
      }
      const toTimeMs = data.toTimeMs && cutoffTimeMs ? Math.min(data.toTimeMs, cutoffTimeMs) : data.toTimeMs;
      return { overlay, clippedData: { ...data, toTimeMs } };
    }
    default:
      return { overlay, clippedData: overlay.data };
  }
}
