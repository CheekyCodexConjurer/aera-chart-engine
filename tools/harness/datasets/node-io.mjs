import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { generateScenarioDataset } from "./generator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "generated");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeArray(root, descriptor, array) {
  const target = path.join(root, descriptor.path);
  ensureDir(path.dirname(target));
  const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  fs.writeFileSync(target, buffer);
}

function readArray(root, descriptor) {
  const target = path.join(root, descriptor.path);
  const buffer = fs.readFileSync(target);
  if (descriptor.type === "float32") {
    return new Float32Array(buffer.buffer, buffer.byteOffset, descriptor.length);
  }
  return new Float64Array(buffer.buffer, buffer.byteOffset, descriptor.length);
}

function hashDataset(manifest, arrays) {
  const hash = crypto.createHash("sha256");
  const manifestCopy = { ...manifest };
  delete manifestCopy.datasetHash;
  hash.update(JSON.stringify(manifestCopy));
  const entries = [...arrays.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, array] of entries) {
    hash.update(key);
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
  return hash.digest("hex");
}

export function writeScenarioDataset(scenarioId, root = DEFAULT_ROOT) {
  const { manifest, arrays } = generateScenarioDataset(scenarioId);
  const datasetHash = hashDataset(manifest, arrays);
  const nextManifest = { ...manifest, datasetHash };
  const datasetRoot = path.join(root, scenarioId);
  ensureDir(datasetRoot);
  for (const [pathKey, array] of arrays.entries()) {
    const descriptor = findDescriptor(nextManifest, pathKey);
    if (!descriptor) continue;
    writeArray(datasetRoot, descriptor, array);
  }
  fs.writeFileSync(path.join(datasetRoot, "manifest.json"), JSON.stringify(nextManifest, null, 2));
  return { manifest: nextManifest, datasetRoot };
}

function findDescriptor(manifest, targetPath) {
  for (const series of manifest.series) {
    for (const key of Object.keys(series.fields)) {
      if (series.fields[key].path === targetPath) return series.fields[key];
    }
  }
  for (const batch of manifest.overlays ?? []) {
    for (const overlay of batch.overlays ?? []) {
      const points = overlay.data?.points;
      if (points?.path === targetPath) return points;
    }
  }
  return null;
}

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

function decodeOverlay(overlay, root) {
  const data = overlay.data ?? {};
  if (data.format === "packed-points" || data.format === "label-points") {
    const descriptor = data.points;
    const array = readArray(root, descriptor);
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

export function loadScenarioDataset(scenarioId, root = DEFAULT_ROOT) {
  const datasetRoot = path.join(root, scenarioId);
  const manifestPath = path.join(datasetRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    writeScenarioDataset(scenarioId, root);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const seriesData = new Map();
  for (const series of manifest.series) {
    const fields = {};
    for (const key of Object.keys(series.fields)) {
      fields[key] = readArray(datasetRoot, series.fields[key]);
    }
    seriesData.set(series.id, fields);
  }
  const overlayBatches = (manifest.overlays ?? []).map((batch) => ({
    batchId: batch.batchId,
    overlays: (batch.overlays ?? []).map((overlay) => decodeOverlay(overlay, datasetRoot))
  }));
  return { manifest, seriesData, overlayBatches };
}

export function getDatasetRoot() {
  return DEFAULT_ROOT;
}
