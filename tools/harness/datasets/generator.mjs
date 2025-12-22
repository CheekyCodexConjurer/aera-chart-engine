import { createRng, randBetween, randInt } from "./rng.mjs";
import { getScenarioSpec } from "../scenarios/registry.mjs";

const GENERATOR_VERSION = "harness-gen-0.1";

function addArray(arrays, path, array, type = "float64") {
  arrays.set(path, array);
  return { path, type, length: array.length };
}

function packPoints(points, fields) {
  const stride = fields.length;
  const packed = new Float64Array(points.length * stride);
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const offset = i * stride;
    for (let j = 0; j < fields.length; j += 1) {
      packed[offset + j] = point[fields[j]];
    }
  }
  return { packed, stride, fields };
}

function buildTimeSeries(spec, rng) {
  const timeMs = new Float64Array(spec.barCount);
  let t = spec.startTimeMs;
  const gapEvery = 12_000;
  const gapSize = 12 * 60 * 60 * 1000;
  for (let i = 0; i < spec.barCount; i += 1) {
    if (spec.pattern === "gaps" && i > 0 && i % gapEvery === 0) {
      t += gapSize;
    }
    t += spec.stepMs;
    timeMs[i] = t;
  }
  return timeMs;
}

function buildCandles(timeMs, rng) {
  const count = timeMs.length;
  const open = new Float64Array(count);
  const high = new Float64Array(count);
  const low = new Float64Array(count);
  const close = new Float64Array(count);
  let value = 100 + randBetween(rng, -2, 2);
  for (let i = 0; i < count; i += 1) {
    const drift = Math.sin(i / 500) * 0.4 + Math.cos(i / 900) * 0.3 + randBetween(rng, -0.2, 0.2);
    const next = value + drift;
    const candleHigh = Math.max(value, next) + randBetween(rng, 0.05, 0.8);
    const candleLow = Math.min(value, next) - randBetween(rng, 0.05, 0.8);
    open[i] = value;
    close[i] = next;
    high[i] = candleHigh;
    low[i] = candleLow;
    value = next;
  }
  return { open, high, low, close };
}

function buildVolume(open, close, rng) {
  const count = open.length;
  const value = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const spread = Math.abs(close[i] - open[i]);
    value[i] = 200 + spread * 1200 + randBetween(rng, 0, 300);
  }
  return value;
}

function sampleIndices(total, count, rng) {
  if (count >= total) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const step = Math.max(1, Math.floor(total / count));
  const indices = [];
  for (let i = 0; i < total && indices.length < count; i += step) {
    indices.push(i);
  }
  while (indices.length < count) {
    indices.push(randInt(rng, 0, total - 1));
  }
  return indices;
}

function buildOverlayPoints(timeMs, values, count, rng) {
  const indices = sampleIndices(timeMs.length, count, rng);
  return indices.map((index) => ({
    timeMs: timeMs[index],
    value: values[index]
  }));
}

function buildZonePoints(timeMs, values, count, rng) {
  const indices = sampleIndices(timeMs.length, count, rng);
  return indices.map((index) => {
    const base = values[index];
    const spread = randBetween(rng, 0.4, 1.6);
    return { timeMs: timeMs[index], top: base + spread, bottom: base - spread };
  });
}

function buildLabelPoints(timeMs, values, count, rng) {
  const indices = sampleIndices(timeMs.length, count, rng);
  const texts = [];
  const points = indices.map((index, idx) => {
    const text = `L${idx + 1}`;
    texts.push(text);
    return { timeMs: timeMs[index], value: values[index], textIndex: idx };
  });
  return { points, texts };
}

function buildOverlays(spec, timeMs, close, arrays) {
  if (spec.overlayProfile === "none") {
    return [];
  }
  const rng = createRng(spec.seed + 99);
  const overlays = [];
  const batchId = `${spec.id}-overlays`;

  if (spec.overlayProfile === "basic") {
    const linePoints = buildOverlayPoints(timeMs, close, 200, rng);
    const linePacked = packPoints(linePoints, ["timeMs", "value"]);
    const linePath = `overlays/${spec.id}/line-points.f64`;
    const lineDescriptor = addArray(arrays, linePath, linePacked.packed);

    const labels = buildLabelPoints(timeMs, close, 12, rng);
    const labelPacked = packPoints(labels.points, ["timeMs", "value", "textIndex"]);
    const labelPath = `overlays/${spec.id}/label-points.f64`;
    const labelDescriptor = addArray(arrays, labelPath, labelPacked.packed);

    overlays.push(
      {
        id: "line-basic",
        type: "line",
        data: {
          format: "packed-points",
          points: { ...lineDescriptor, stride: linePacked.stride, fields: linePacked.fields }
        }
      },
      {
        id: "labels-basic",
        type: "label",
        data: {
          format: "label-points",
          points: { ...labelDescriptor, stride: labelPacked.stride, fields: labelPacked.fields },
          texts: labels.texts
        }
      },
      {
        id: "table-basic",
        type: "table",
        data: {
          format: "table",
          position: "top-right",
          rows: [{ cells: [{ text: "Status" }, { text: "OK" }] }]
        }
      },
      {
        id: "right-label-basic",
        type: "right-label",
        data: {
          format: "right-label",
          labels: [
            { price: close[close.length - 1], text: "R1", timeMs: timeMs[timeMs.length - 1] }
          ]
        }
      }
    );
  }

  if (spec.overlayProfile === "storm") {
    const markerPoints = buildOverlayPoints(timeMs, close, 5_000, rng);
    const markerPacked = packPoints(markerPoints, ["timeMs", "value"]);
    const markerPath = `overlays/${spec.id}/marker-points.f64`;
    const markerDescriptor = addArray(arrays, markerPath, markerPacked.packed);

    const zonePoints = buildZonePoints(timeMs, close, 1_000, rng);
    const zonePacked = packPoints(zonePoints, ["timeMs", "top", "bottom"]);
    const zonePath = `overlays/${spec.id}/zone-points.f64`;
    const zoneDescriptor = addArray(arrays, zonePath, zonePacked.packed);

    const labels = buildLabelPoints(timeMs, close, 2_000, rng);
    const labelPacked = packPoints(labels.points, ["timeMs", "value", "textIndex"]);
    const labelPath = `overlays/${spec.id}/label-points.f64`;
    const labelDescriptor = addArray(arrays, labelPath, labelPacked.packed);

    overlays.push(
      {
        id: "markers-storm",
        type: "marker",
        data: {
          format: "packed-points",
          points: { ...markerDescriptor, stride: markerPacked.stride, fields: markerPacked.fields }
        }
      },
      {
        id: "zones-storm",
        type: "zone",
        data: {
          format: "packed-points",
          points: { ...zoneDescriptor, stride: zonePacked.stride, fields: zonePacked.fields }
        }
      },
      {
        id: "labels-storm",
        type: "label",
        data: {
          format: "label-points",
          points: { ...labelDescriptor, stride: labelPacked.stride, fields: labelPacked.fields },
          texts: labels.texts
        }
      },
      {
        id: "table-storm",
        type: "table",
        data: {
          format: "table",
          position: "top-left",
          rows: [{ cells: [{ text: "Overlay" }, { text: "Storm" }] }]
        }
      },
      {
        id: "right-label-storm",
        type: "right-label",
        data: {
          format: "right-label",
          labels: [
            { price: close[close.length - 1], text: "Cap", timeMs: timeMs[timeMs.length - 1] }
          ]
        }
      }
    );
  }

  return [
    {
      batchId,
      overlays
    }
  ];
}

export function generateScenarioDataset(scenarioId) {
  const spec = getScenarioSpec(scenarioId);
  const rng = createRng(spec.seed);
  const arrays = new Map();

  const timeMs = buildTimeSeries(spec, rng);
  const candles = buildCandles(timeMs, rng);
  const volume = buildVolume(candles.open, candles.close, rng);

  const candleFields = {
    timeMs: addArray(arrays, `series/${scenarioId}/candles/timeMs.f64`, timeMs),
    open: addArray(arrays, `series/${scenarioId}/candles/open.f64`, candles.open),
    high: addArray(arrays, `series/${scenarioId}/candles/high.f64`, candles.high),
    low: addArray(arrays, `series/${scenarioId}/candles/low.f64`, candles.low),
    close: addArray(arrays, `series/${scenarioId}/candles/close.f64`, candles.close)
  };

  const volumeFields = {
    timeMs: addArray(arrays, `series/${scenarioId}/volume/timeMs.f64`, timeMs),
    value: addArray(arrays, `series/${scenarioId}/volume/value.f64`, volume)
  };

  const overlays = buildOverlays(spec, timeMs, candles.close, arrays);

  const manifest = {
    scenarioId,
    seed: spec.seed,
    generatorVersion: GENERATOR_VERSION,
    datasetHash: null,
    timeDomain: "utc-ms",
    barCount: spec.barCount,
    visibleTarget: spec.visibleTarget,
    series: [
      {
        id: "candles",
        type: "candles",
        paneId: "price",
        scaleId: "price",
        fields: candleFields
      },
      {
        id: "volume",
        type: "histogram",
        paneId: "volume",
        scaleId: "volume",
        fields: volumeFields
      }
    ],
    overlays,
    replayTrace: spec.replayTrace ?? null
  };

  return { manifest, arrays };
}
