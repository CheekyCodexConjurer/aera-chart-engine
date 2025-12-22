import { generateScenarioDataset } from "./generator.mjs";

const isNode =
  typeof process !== "undefined" &&
  typeof process.versions === "object" &&
  typeof process.versions.node === "string";

function decodePackedPoints(array, fields, stride) {
  const points = [];
  for (let i = 0; i < array.length; i += stride) {
    const entry = {};
    for (let j = 0; j < fields.length; j += 1) {
      entry[fields[j]] = array[i + j];
    }
    points.push(entry);
  }
  return points;
}

function decodeOverlayFromArrays(overlay, arrays) {
  const data = overlay.data ?? {};
  if (data.format === "packed-points" || data.format === "label-points") {
    const descriptor = data.points;
    const array = arrays.get(descriptor.path);
    const points = decodePackedPoints(array, descriptor.fields, descriptor.stride);
    if (data.format === "label-points") {
      const texts = data.texts ?? [];
      return {
        ...overlay,
        data: {
          points: points.map((point) => ({
            timeMs: point.timeMs,
            value: point.value,
            text: texts[Math.round(point.textIndex)] ?? ""
          }))
        }
      };
    }
    return { ...overlay, data: { points } };
  }
  if (data.format === "right-label") {
    return { ...overlay, data: { labels: data.labels ?? [] } };
  }
  if (data.format === "table") {
    return { ...overlay, data: { position: data.position, rows: data.rows ?? [] } };
  }
  return overlay;
}

function buildDatasetFromArrays(manifest, arrays) {
  const seriesData = new Map();
  for (const series of manifest.series) {
    const fields = {};
    for (const key of Object.keys(series.fields)) {
      fields[key] = arrays.get(series.fields[key].path);
    }
    seriesData.set(series.id, fields);
  }
  const overlayBatches = (manifest.overlays ?? []).map((batch) => ({
    batchId: batch.batchId,
    overlays: (batch.overlays ?? []).map((overlay) => decodeOverlayFromArrays(overlay, arrays))
  }));
  return { manifest, seriesData, overlayBatches };
}

export async function loadScenarioDataset(scenarioId, options = {}) {
  if (isNode) {
    const { loadScenarioDataset: loadFromDisk } = await import("./node-io.mjs");
    return loadFromDisk(scenarioId, options.root);
  }
  const { manifest, arrays } = generateScenarioDataset(scenarioId);
  return buildDatasetFromArrays(manifest, arrays);
}
