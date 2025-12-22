import type { HitTestEvent, OverlayHit, SeriesHit, TimeMs } from "../../api/public-types.js";
import { clipOverlay } from "../overlays.js";
import { priceToY as toPriceY, timeToX as toTimeX, xToTime as toXTime, yToPrice as toYPrice } from "../transform.js";
import type { SeriesState } from "../series.js";
import type { EngineContext } from "./context.js";
import { ensurePane, getPrimarySeries } from "./axis-layout.js";
import { getCutoffTime } from "./replay-state.js";
import type { PaneState } from "./state.js";
import { findNearestIndex, findNearestPoint, findNearestZone, upperBound } from "./util.js";
import { clamp } from "../../util/math.js";

export function timeToX(ctx: EngineContext, paneId: string, timeMs: TimeMs): number | null {
  const pane = ensurePane(ctx, paneId);
  return toTimeX(pane.visibleRange, pane.plotArea, timeMs);
}

export function xToTime(ctx: EngineContext, paneId: string, x: number): TimeMs | null {
  const pane = ensurePane(ctx, paneId);
  return toXTime(pane.visibleRange, pane.plotArea, x);
}

export function priceToY(ctx: EngineContext, paneId: string, scaleId: string, price: number): number | null {
  const pane = ensurePane(ctx, paneId);
  const domain = pane.scaleDomains.get(scaleId);
  if (!domain) return null;
  return toPriceY(domain, pane.plotArea, price);
}

export function yToPrice(ctx: EngineContext, paneId: string, scaleId: string, y: number): number | null {
  const pane = ensurePane(ctx, paneId);
  const domain = pane.scaleDomains.get(scaleId);
  if (!domain) return null;
  return toYPrice(domain, pane.plotArea, y);
}

export function findNearestTime(ctx: EngineContext, paneId: string, timeMs: TimeMs): TimeMs | null {
  const series = getPrimarySeries(ctx, paneId);
  const snapshot = series?.snapshot;
  if (!snapshot || snapshot.timeMs.length === 0) return null;
  const times = snapshot.timeMs;
  let low = 0;
  let high = times.length - 1;
  let maxIndex = high;
  const cutoff = getCutoffTime(ctx);
  if (cutoff !== undefined) {
    const lastIndex = upperBound(times, cutoff) - 1;
    if (lastIndex < 0) return null;
    maxIndex = Math.min(high, lastIndex);
    high = maxIndex;
  }
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = times[mid];
    if (value === timeMs) return value;
    if (value < timeMs) low = mid + 1;
    else high = mid - 1;
  }
  const left = clamp(high, 0, maxIndex);
  const right = clamp(low, 0, maxIndex);
  const leftDiff = Math.abs(times[left] - timeMs);
  const rightDiff = Math.abs(times[right] - timeMs);
  return leftDiff <= rightDiff ? times[left] : times[right];
}

export function computeHitTest(ctx: EngineContext, paneId: string, timeMs: TimeMs, x: number, y: number): HitTestEvent {
  const pane = ensurePane(ctx, paneId);
  const seriesHits: SeriesHit[] = [];
  for (const series of ctx.series.values()) {
    if (series.paneId !== paneId || !series.snapshot) continue;
    const hit = hitTestSeries(ctx, series, pane, timeMs, x, y);
    if (hit) {
      seriesHits.push(hit);
    }
  }
  seriesHits.sort((a, b) => (a.distancePx ?? 0) - (b.distancePx ?? 0));

  const overlayHits: OverlayHit[] = [];
  for (const overlay of ctx.overlays.getAll()) {
    if ((overlay.paneId ?? "price") !== paneId) continue;
    const clipped = clipOverlay(overlay, getCutoffTime(ctx)).clippedData;
    const hit = hitTestOverlay(ctx, overlay, clipped, pane, timeMs, x, y);
    if (hit) {
      overlayHits.push(hit);
    }
  }
  overlayHits.sort((a, b) => (a.distancePx ?? 0) - (b.distancePx ?? 0));

  return {
    paneId,
    timeMs,
    screen: { x, y },
    series: seriesHits,
    overlays: overlayHits
  };
}

export function hitTestSeries(
  ctx: EngineContext,
  series: SeriesState,
  pane: PaneState,
  timeMs: TimeMs,
  x: number,
  y: number
): SeriesHit | null {
  const snapshot = series.snapshot;
  if (!snapshot) return null;
  const index = findNearestIndex(snapshot.timeMs, timeMs, getCutoffTime(ctx));
  if (index === null) return null;
  const timeValue = snapshot.timeMs[index];
  const xValue = toTimeX(pane.visibleRange, pane.plotArea, timeValue);
  if (xValue === null) return null;
  const distanceX = Math.abs(xValue - x);
  if (distanceX > ctx.hitTestRadiusPx) return null;
  const domain = pane.scaleDomains.get(series.scaleId);
  const baseHit: SeriesHit = {
    seriesId: series.id,
    paneId: series.paneId,
    scaleId: series.scaleId,
    timeMs: timeValue,
    index,
    distancePx: distanceX
  };
  if (!domain) return baseHit;

  if (series.type === "candles") {
    const open = snapshot.fields.open?.[index];
    const high = snapshot.fields.high?.[index];
    const low = snapshot.fields.low?.[index];
    const close = snapshot.fields.close?.[index];
    if (open === undefined || high === undefined || low === undefined || close === undefined) {
      return baseHit;
    }
    const highY = toPriceY(domain, pane.plotArea, high);
    const lowY = toPriceY(domain, pane.plotArea, low);
    if (highY !== null && lowY !== null) {
      const minY = Math.min(highY, lowY) - ctx.hitTestRadiusPx;
      const maxY = Math.max(highY, lowY) + ctx.hitTestRadiusPx;
      if (y < minY || y > maxY) return null;
    }
    return {
      ...baseHit,
      open,
      high,
      low,
      close
    };
  }

  const value = snapshot.fields.value?.[index];
  if (value === undefined) return baseHit;
  const valueY = toPriceY(domain, pane.plotArea, value);
  if (valueY !== null) {
    const distanceY = Math.abs(valueY - y);
    const distance = Math.hypot(distanceX, distanceY);
    if (distance > ctx.hitTestRadiusPx) return null;
    baseHit.distancePx = distance;
  }
  return { ...baseHit, value };
}

export function hitTestOverlay(
  ctx: EngineContext,
  overlay: { id: string; type: string; paneId?: string; scaleId?: string },
  data: unknown,
  pane: PaneState,
  timeMs: TimeMs,
  x: number,
  y: number
): OverlayHit | null {
  const scaleId = overlay.scaleId ?? "price";
  const domain = pane.scaleDomains.get(scaleId);
  if (!domain) return null;
  if (!data || typeof data !== "object") return null;
  const type = overlay.type;
  if (type === "marker" || type === "label" || type === "line" || type === "area" || type === "histogram") {
    const points = (data as { points?: { timeMs: TimeMs; value: number; text?: string }[] }).points;
    if (!Array.isArray(points) || points.length === 0) return null;
    const nearest = findNearestPoint(points, timeMs);
    if (!nearest) return null;
    const xValue = toTimeX(pane.visibleRange, pane.plotArea, nearest.timeMs);
    const yValue = toPriceY(domain, pane.plotArea, nearest.value);
    if (xValue === null || yValue === null) return null;
    const distance = Math.hypot(xValue - x, yValue - y);
    if (distance > ctx.hitTestRadiusPx) return null;
    return {
      overlayId: overlay.id,
      paneId: pane.id,
      scaleId,
      type: overlay.type as OverlayHit["type"],
      timeMs: nearest.timeMs,
      value: nearest.value,
      text: nearest.text,
      distancePx: distance
    };
  }
  if (type === "hline") {
    const value = (data as { value?: number }).value;
    if (value === undefined) return null;
    const yValue = toPriceY(domain, pane.plotArea, value);
    if (yValue === null) return null;
    const distance = Math.abs(yValue - y);
    if (distance > ctx.hitTestRadiusPx) return null;
    return {
      overlayId: overlay.id,
      paneId: pane.id,
      scaleId,
      type: overlay.type as OverlayHit["type"],
      value,
      distancePx: distance
    };
  }
  if (type === "zone") {
    const points = (data as { points?: { timeMs: TimeMs; top: number; bottom: number }[] }).points;
    if (!Array.isArray(points) || points.length === 0) return null;
    const nearest = findNearestZone(points, timeMs);
    if (!nearest) return null;
    const xValue = toTimeX(pane.visibleRange, pane.plotArea, nearest.timeMs);
    if (xValue === null) return null;
    const topY = toPriceY(domain, pane.plotArea, nearest.top);
    const bottomY = toPriceY(domain, pane.plotArea, nearest.bottom);
    if (topY === null || bottomY === null) return null;
    const minY = Math.min(topY, bottomY) - ctx.hitTestRadiusPx;
    const maxY = Math.max(topY, bottomY) + ctx.hitTestRadiusPx;
    if (y < minY || y > maxY) return null;
    const distance = Math.abs(xValue - x);
    if (distance > ctx.hitTestRadiusPx) return null;
    return {
      overlayId: overlay.id,
      paneId: pane.id,
      scaleId,
      type: overlay.type as OverlayHit["type"],
      timeMs: nearest.timeMs,
      value: nearest.top,
      distancePx: distance
    };
  }
  return null;
}
