import type {
  AreaOverlayData,
  HLineOverlayData,
  HistogramOverlayData,
  LabelOverlayData,
  LineOverlayData,
  MarkerOverlayData,
  OverlayPrimitive,
  RightLabelOverlayData,
  TableOverlayData,
  TimeMs,
  ZoneOverlayData
} from "../../api/public-types.js";
import type { OverlayRenderItem } from "./types.js";

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
    case "table": {
      const data = overlay.data as TableOverlayData;
      if (cutoffTimeMs !== undefined && data.anchorTimeMs !== undefined && data.anchorTimeMs > cutoffTimeMs) {
        return { overlay, clippedData: null };
      }
      return { overlay, clippedData: data };
    }
    case "right-label": {
      const data = overlay.data as RightLabelOverlayData;
      const labels = data.labels ?? [];
      if (cutoffTimeMs === undefined) {
        return { overlay, clippedData: data };
      }
      const clipped = labels.filter((label) => label.timeMs === undefined || label.timeMs <= cutoffTimeMs);
      return { overlay, clippedData: { ...data, labels: clipped } };
    }
    default:
      return { overlay, clippedData: null };
  }
}
