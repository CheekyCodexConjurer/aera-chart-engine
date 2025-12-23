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

function normalizePane(pane) {
  return {
    paneId: pane.paneId,
    visibleRange: normalizeRange(pane.visibleRange),
    renderWindow: normalizeRange(pane.renderWindow ?? null)
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

function overlayPointsFromData(type, data) {
  if (!data) return [];
  if (type === "zone") {
    return (data.points ?? []).map((point) => ({ timeMs: point.timeMs }));
  }
  if (type === "hline") {
    const points = [];
    if (data.fromTimeMs != null) points.push({ timeMs: data.fromTimeMs });
    if (data.toTimeMs != null) points.push({ timeMs: data.toTimeMs });
    return points;
  }
  if (type === "right-label") {
    return (data.labels ?? []).filter((label) => label.timeMs != null).map((label) => ({ timeMs: label.timeMs }));
  }
  if (type === "table") {
    return [];
  }
  const points = data.points ?? data.labels ?? [];
  return points.map((point) => ({ timeMs: point.timeMs }));
}

function computeOverlayStats(overlay, range, cutoffTimeMs) {
  const points = overlayPointsFromData(overlay.type, overlay.data);
  if (points.length === 0) {
    return {
      visibleCount: overlay.type === "table" ? (overlay.data?.rows?.length ?? 0) : 1,
      firstVisibleTimeMs: null,
      lastVisibleTimeMs: null
    };
  }
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

export function computeStateHash(bundle) {
  const cutoffTimeMs = bundle.view?.replayState?.cutoffTimeMs ?? null;
  const previewTimeMs = bundle.view?.replayState?.previewTimeMs ?? null;
  const panes = (bundle.view?.panes ?? []).map(normalizePane);
  const paneRanges = new Map(
    (bundle.view?.panes ?? []).map((pane) => [pane.paneId, pane.visibleRange ?? null])
  );

  const seriesStats = (bundle.inputs?.series ?? [])
    .map((series) => {
      const range = paneRanges.get(series.definition.paneId) ?? null;
      const timeMs = series.data?.timeMs ?? [];
      return {
        id: series.definition.id,
        paneId: series.definition.paneId,
        ...computeSeriesStats(timeMs, range, cutoffTimeMs)
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const overlayStats = (bundle.inputs?.overlays ?? [])
    .flatMap((batch) => batch.overlays.map((overlay) => ({ batchId: batch.batchId, overlay })))
    .map(({ batchId, overlay }) => {
      const paneId = overlay.paneId ?? "price";
      const range = paneRanges.get(paneId) ?? null;
      return {
        id: overlay.id,
        type: overlay.type,
        batchId,
        ...computeOverlayStats(overlay, range, cutoffTimeMs)
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const digest = {
    panes,
    cutoffTimeMs: cutoffTimeMs == null ? null : quantize(cutoffTimeMs),
    previewTimeMs: previewTimeMs == null ? null : quantize(previewTimeMs),
    series: seriesStats,
    overlays: overlayStats
  };

  const hash = crypto.createHash("sha256").update(JSON.stringify(digest)).digest("hex");
  return { digest, hash };
}
