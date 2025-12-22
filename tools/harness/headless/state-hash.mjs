import crypto from "node:crypto";

function quantize(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  return Math.round(value * 1e4) / 1e4;
}

function normalizeRange(range) {
  if (!range) return null;
  return {
    startMs: quantize(range.startMs),
    endMs: quantize(range.endMs)
  };
}

function computeSeriesStats(timeMs, range, cutoffTimeMs) {
  let count = 0;
  let first = null;
  let last = null;
  const start = range?.startMs ?? Number.NEGATIVE_INFINITY;
  const end = range?.endMs ?? Number.POSITIVE_INFINITY;
  for (let i = 0; i < timeMs.length; i += 1) {
    const t = timeMs[i];
    if (t < start || t > end) continue;
    if (cutoffTimeMs != null && t > cutoffTimeMs) continue;
    count += 1;
    if (first === null) first = t;
    last = t;
  }
  return {
    visibleCount: count,
    firstVisibleTimeMs: first == null ? null : quantize(first),
    lastVisibleTimeMs: last == null ? null : quantize(last)
  };
}

function getOverlayPoints(overlay) {
  const data = overlay.data ?? {};
  if (Array.isArray(data.points)) {
    return data.points.map((point) => ({
      timeMs: point.timeMs,
      value: point.value ?? point.top ?? 0
    }));
  }
  if (Array.isArray(data.labels)) {
    return data.labels
      .filter((label) => label.timeMs != null)
      .map((label) => ({ timeMs: label.timeMs, value: label.price ?? 0 }));
  }
  return [];
}

function computeOverlayStats(overlay, range, cutoffTimeMs) {
  const points = getOverlayPoints(overlay);
  let count = 0;
  let first = null;
  let last = null;
  const start = range?.startMs ?? Number.NEGATIVE_INFINITY;
  const end = range?.endMs ?? Number.POSITIVE_INFINITY;
  for (const point of points) {
    const t = point.timeMs;
    if (t == null) continue;
    if (t < start || t > end) continue;
    if (cutoffTimeMs != null && t > cutoffTimeMs) continue;
    count += 1;
    if (first === null) first = t;
    last = t;
  }
  return {
    visibleCount: count,
    firstVisibleTimeMs: first == null ? null : quantize(first),
    lastVisibleTimeMs: last == null ? null : quantize(last)
  };
}

export function computeStateHash({ dataset, visibleRange, dataWindow, replayState }) {
  const cutoffTimeMs = replayState?.cutoffTimeMs ?? null;
  const previewTimeMs = replayState?.previewTimeMs ?? null;
  const seriesStats = dataset.manifest.series
    .map((series) => {
      const timeMs = dataset.seriesData.get(series.id)?.timeMs ?? [];
      return {
        id: series.id,
        ...computeSeriesStats(timeMs, visibleRange, cutoffTimeMs)
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const overlayStats = (dataset.overlayBatches ?? [])
    .flatMap((batch) => batch.overlays.map((overlay) => ({ batchId: batch.batchId, overlay })))
    .map(({ batchId, overlay }) => ({
      id: overlay.id,
      type: overlay.type,
      batchId,
      ...computeOverlayStats(overlay, visibleRange, cutoffTimeMs)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const digest = {
    visibleRange: normalizeRange(visibleRange),
    dataWindow: normalizeRange(dataWindow),
    cutoffTimeMs: cutoffTimeMs == null ? null : quantize(cutoffTimeMs),
    previewTimeMs: previewTimeMs == null ? null : quantize(previewTimeMs),
    series: seriesStats,
    overlays: overlayStats
  };

  const hash = crypto.createHash("sha256").update(JSON.stringify(digest)).digest("hex");
  return { digest, hash };
}
