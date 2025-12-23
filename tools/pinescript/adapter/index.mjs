import { DEFAULT_PINE_LIMITS } from "./limits.mjs";

function buildDiagnostic(code, message, context, severity = "warn") {
  return { code, message, severity, recoverable: true, context };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function applyLimit(points, limit, diagnostics, context) {
  if (points.length <= limit) return points;
  diagnostics.push(
    buildDiagnostic("pinescript.limit.exceeded", "PineScript output exceeds adapter limits", {
      ...context,
      count: points.length,
      limit
    })
  );
  return points.slice(0, limit);
}

function normalizeSeries(series, diagnostics) {
  const paneId = series.paneId ?? "price";
  const scaleId = series.scaleId ?? "price";
  if (series.kind === "plotcandle") {
    const timeMs = ensureArray(series.data?.timeMs);
    const open = ensureArray(series.data?.open);
    const high = ensureArray(series.data?.high);
    const low = ensureArray(series.data?.low);
    const close = ensureArray(series.data?.close);
    if (timeMs.length === 0 || open.length === 0 || high.length === 0 || low.length === 0 || close.length === 0) {
      diagnostics.push(
        buildDiagnostic("pinescript.output.invalid", "plotcandle output is missing OHLC arrays", {
          id: series.id
        }, "error")
      );
      return null;
    }
    return {
      definition: { id: series.id, type: "candles", paneId, scaleId },
      data: { timeMs, open, high, low, close, volume: ensureArray(series.data?.volume) }
    };
  }

  if (series.kind === "plot") {
    const style = series.style ?? "line";
    const type = style === "area" ? "area" : style === "histogram" ? "histogram" : "line";
    const timeMs = ensureArray(series.data?.timeMs);
    const value = ensureArray(series.data?.value);
    if (timeMs.length === 0 || value.length === 0) {
      diagnostics.push(
        buildDiagnostic("pinescript.output.invalid", "plot output is missing time/value arrays", {
          id: series.id
        }, "error")
      );
      return null;
    }
    return {
      definition: { id: series.id, type, paneId, scaleId },
      data: { timeMs, value }
    };
  }

  diagnostics.push(
    buildDiagnostic("pinescript.output.unsupported", "series output type not supported by adapter", {
      id: series.id,
      kind: series.kind
    }, "error")
  );
  return null;
}

function normalizeOverlay(overlay, diagnostics, limits) {
  const paneId = overlay.paneId ?? "price";
  const scaleId = overlay.scaleId ?? "price";
  const base = {
    id: overlay.id,
    paneId,
    scaleId,
    layer: overlay.layer,
    zIndex: overlay.zIndex
  };

  if (overlay.kind === "plotshape") {
    const points = applyLimit(ensureArray(overlay.data?.points), limits.markerPointsMax, diagnostics, {
      id: overlay.id,
      kind: overlay.kind
    });
    return { ...base, type: "marker", data: { points, shape: overlay.data?.shape } };
  }

  if (overlay.kind === "plotchar") {
    const points = applyLimit(ensureArray(overlay.data?.points), limits.labelPointsMax, diagnostics, {
      id: overlay.id,
      kind: overlay.kind
    });
    return { ...base, type: "label", data: { points } };
  }

  if (overlay.kind === "hline") {
    return {
      ...base,
      type: "hline",
      data: {
        value: overlay.data?.value ?? 0,
        fromTimeMs: overlay.data?.fromTimeMs,
        toTimeMs: overlay.data?.toTimeMs
      }
    };
  }

  if (overlay.kind === "line" || overlay.kind === "polyline") {
    const points = applyLimit(ensureArray(overlay.data?.points), limits.linePointsMax, diagnostics, {
      id: overlay.id,
      kind: overlay.kind
    });
    return { ...base, type: "line", data: { points, step: overlay.data?.step } };
  }

  if (overlay.kind === "box") {
    const start = overlay.data?.startTimeMs ?? overlay.data?.fromTimeMs;
    const end = overlay.data?.endTimeMs ?? overlay.data?.toTimeMs;
    const top = overlay.data?.top;
    const bottom = overlay.data?.bottom;
    const points = start != null && end != null && top != null && bottom != null
      ? [{ timeMs: start, top, bottom }, { timeMs: end, top, bottom }]
      : [];
    const limited = applyLimit(points, limits.zoneSegmentsMax, diagnostics, {
      id: overlay.id,
      kind: overlay.kind
    });
    return { ...base, type: "zone", data: { points: limited } };
  }

  if (overlay.kind === "label") {
    const point = overlay.data?.point;
    const points = point ? [point] : ensureArray(overlay.data?.points);
    const limited = applyLimit(points, limits.labelPointsMax, diagnostics, {
      id: overlay.id,
      kind: overlay.kind
    });
    return { ...base, type: "label", data: { points: limited } };
  }

  if (overlay.kind === "fill") {
    const points = ensureArray(overlay.data?.points);
    const limited = applyLimit(points, limits.zoneSegmentsMax, diagnostics, {
      id: overlay.id,
      kind: overlay.kind
    });
    return { ...base, type: "zone", data: { points: limited } };
  }

  if (overlay.kind === "table") {
    return {
      ...base,
      type: "table",
      data: {
        position: overlay.data?.position,
        anchorTimeMs: overlay.data?.anchorTimeMs,
        rows: ensureArray(overlay.data?.rows)
      }
    };
  }

  if (overlay.kind === "right-label") {
    return {
      ...base,
      type: "right-label",
      data: { labels: ensureArray(overlay.data?.labels) }
    };
  }

  diagnostics.push(
    buildDiagnostic("pinescript.output.unsupported", "overlay output type not supported by adapter", {
      id: overlay.id,
      kind: overlay.kind
    }, "error")
  );
  return null;
}

export function normalizePineOutputs(outputs, options = {}) {
  const diagnostics = [];
  const seriesDefinitions = [];
  const seriesData = new Map();
  const overlayBatchId = options.batchId ?? "pinescript";
  const limits = { ...DEFAULT_PINE_LIMITS, ...(options.limits ?? {}) };

  for (const series of outputs.series ?? []) {
    const normalized = normalizeSeries(series, diagnostics);
    if (!normalized) continue;
    seriesDefinitions.push(normalized.definition);
    seriesData.set(normalized.definition.id, normalized.data);
  }

  const overlays = [];
  for (const overlay of outputs.overlays ?? []) {
    const normalized = normalizeOverlay(overlay, diagnostics, limits);
    if (normalized) overlays.push(normalized);
  }

  return {
    seriesDefinitions,
    seriesData,
    overlayBatches: overlays.length > 0 ? [{ batchId: overlayBatchId, overlays }] : [],
    diagnostics
  };
}
