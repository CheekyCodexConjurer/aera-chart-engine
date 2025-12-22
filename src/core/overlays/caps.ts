import type {
  LineOverlayData,
  OverlayPrimitive,
  OverlayPrimitiveType,
  RightLabelOverlayData,
  ZoneOverlayData
} from "../../api/public-types.js";

const SUPPORTED_TYPES: Set<OverlayPrimitiveType> = new Set([
  "line",
  "hline",
  "zone",
  "marker",
  "label",
  "area",
  "histogram",
  "table",
  "right-label"
]);

export function isOverlaySupported(type: OverlayPrimitiveType): boolean {
  return SUPPORTED_TYPES.has(type);
}

const OVERLAY_CAPS: Record<OverlayPrimitiveType, number | undefined> = {
  line: 200_000,
  area: 200_000,
  histogram: 200_000,
  marker: 50_000,
  label: 10_000,
  zone: 10_000,
  "right-label": 10_000,
  hline: undefined,
  table: undefined
};

export type OverlayCapResult = {
  overlay: OverlayPrimitive;
  capped: boolean;
  originalCount?: number;
  cap?: number;
};

export function enforceOverlayCaps(overlay: OverlayPrimitive): OverlayCapResult {
  const cap = OVERLAY_CAPS[overlay.type];
  if (!cap) {
    return { overlay, capped: false };
  }
  if (!overlay.data || typeof overlay.data !== "object") {
    return { overlay, capped: false };
  }
  if (overlay.type === "right-label") {
    const data = overlay.data as RightLabelOverlayData;
    const labels = data.labels ?? [];
    if (labels.length <= cap) {
      return { overlay, capped: false };
    }
    const trimmed = labels.slice(labels.length - cap);
    return {
      overlay: { ...overlay, data: { ...data, labels: trimmed } },
      capped: true,
      originalCount: labels.length,
      cap
    };
  }
  if (overlay.type === "line" || overlay.type === "area" || overlay.type === "histogram" || overlay.type === "marker" || overlay.type === "label") {
    const data = overlay.data as LineOverlayData;
    const points = data.points ?? [];
    if (points.length <= cap) {
      return { overlay, capped: false };
    }
    const trimmed = points.slice(points.length - cap);
    return {
      overlay: { ...overlay, data: { ...data, points: trimmed } },
      capped: true,
      originalCount: points.length,
      cap
    };
  }
  if (overlay.type === "zone") {
    const data = overlay.data as ZoneOverlayData;
    const points = data.points ?? [];
    if (points.length <= cap) {
      return { overlay, capped: false };
    }
    const trimmed = points.slice(points.length - cap);
    return {
      overlay: { ...overlay, data: { ...data, points: trimmed } },
      capped: true,
      originalCount: points.length,
      cap
    };
  }
  return { overlay, capped: false };
}
