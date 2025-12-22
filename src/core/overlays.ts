import {
  AreaOverlayData,
  HistogramOverlayData,
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
import { isFiniteNumber } from "../util/math.js";

export type OverlayRenderItem = {
  overlay: OverlayPrimitive;
  clippedData: unknown;
};

const SUPPORTED_TYPES: Set<OverlayPrimitiveType> = new Set([
  "line",
  "hline",
  "zone",
  "marker",
  "label",
  "area",
  "histogram"
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

export type OverlayValidationIssue = {
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

export function validateOverlay(overlay: OverlayPrimitive): OverlayValidationIssue[] {
  const issues: OverlayValidationIssue[] = [];
  if (!overlay.data || typeof overlay.data !== "object") {
    issues.push({ code: "overlay.data.invalid", message: "overlay data must be an object" });
    return issues;
  }
  switch (overlay.type) {
    case "line":
    case "area":
    case "histogram":
    case "marker":
    case "label": {
      const points = (overlay.data as LineOverlayData).points;
      if (!Array.isArray(points) || points.length === 0) {
        issues.push({ code: "overlay.points.missing", message: "overlay points are missing" });
        return issues;
      }
      for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        if (!isFiniteNumber(point.timeMs) || !isFiniteNumber(point.value)) {
          issues.push({
            code: "overlay.point.invalid",
            message: "overlay point values must be finite",
            context: { index: i, timeMs: point.timeMs, value: point.value }
          });
          break;
        }
      }
      if (overlay.type === "label") {
        const labelPoints = (overlay.data as LabelOverlayData).points;
        for (let i = 0; i < labelPoints.length; i += 1) {
          if (!labelPoints[i].text) {
            issues.push({
              code: "overlay.label.text",
              message: "label text is required",
              context: { index: i }
            });
            break;
          }
        }
      }
      if (overlay.type === "area") {
        const baseValue = (overlay.data as AreaOverlayData).baseValue;
        if (baseValue !== undefined && !isFiniteNumber(baseValue)) {
          issues.push({ code: "overlay.area.base", message: "area baseValue must be finite" });
        }
      }
      if (overlay.type === "histogram") {
        const baseValue = (overlay.data as HistogramOverlayData).baseValue;
        if (baseValue !== undefined && !isFiniteNumber(baseValue)) {
          issues.push({ code: "overlay.histogram.base", message: "histogram baseValue must be finite" });
        }
      }
      return issues;
    }
    case "zone": {
      const points = (overlay.data as ZoneOverlayData).points;
      if (!Array.isArray(points) || points.length === 0) {
        issues.push({ code: "overlay.points.missing", message: "zone points are missing" });
        return issues;
      }
      for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        if (!isFiniteNumber(point.timeMs) || !isFiniteNumber(point.top) || !isFiniteNumber(point.bottom)) {
          issues.push({
            code: "overlay.zone.invalid",
            message: "zone points must be finite",
            context: { index: i }
          });
          break;
        }
      }
      return issues;
    }
    case "hline": {
      const data = overlay.data as HLineOverlayData;
      if (!isFiniteNumber(data.value)) {
        issues.push({ code: "overlay.hline.value", message: "hline value must be finite" });
      }
      if (data.fromTimeMs !== undefined && !isFiniteNumber(data.fromTimeMs)) {
        issues.push({ code: "overlay.hline.from", message: "hline fromTimeMs must be finite" });
      }
      if (data.toTimeMs !== undefined && !isFiniteNumber(data.toTimeMs)) {
        issues.push({ code: "overlay.hline.to", message: "hline toTimeMs must be finite" });
      }
      return issues;
    }
    default:
      return issues;
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
    case "area": {
      const data = overlay.data as AreaOverlayData;
      const points = clipPoints(data.points, cutoffTimeMs) as AreaOverlayData["points"];
      return { overlay, clippedData: { ...data, points } };
    }
    case "histogram": {
      const data = overlay.data as HistogramOverlayData;
      const points = clipPoints(data.points, cutoffTimeMs) as HistogramOverlayData["points"];
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
