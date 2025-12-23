import { getScenarioSpec } from "./registry.mjs";

function includeVolume(spec) {
  return spec.includeVolume === true;
}

function filterPaneLayout(spec) {
  if (!spec.paneLayout) return null;
  if (includeVolume(spec)) return spec.paneLayout;
  return spec.paneLayout.filter((entry) => entry.paneId !== "volume");
}

function filterSeries(spec, series) {
  if (!includeVolume(spec) && (series.id === "volume" || series.paneId === "volume")) {
    return false;
  }
  return true;
}

export function loadScenarioIntoEngine(engine, dataset, scenarioId) {
  const spec = getScenarioSpec(scenarioId ?? dataset.manifest.scenarioId);
  const paneLayout = filterPaneLayout(spec);
  if (paneLayout) {
    engine.setPaneLayout(paneLayout);
  }
  const seriesToLoad = dataset.manifest.series.filter((series) => filterSeries(spec, series));
  for (const series of seriesToLoad) {
    engine.defineSeries({
      id: series.id,
      type: series.type,
      paneId: series.paneId,
      scaleId: series.scaleId
    });
  }
  for (const series of seriesToLoad) {
    const fields = dataset.seriesData.get(series.id);
    engine.setSeriesData(series.id, fields, "replace");
  }
  const timeMs = dataset.seriesData.get("candles")?.timeMs ?? [];
  const endIndex = Math.max(0, timeMs.length - 1);
  const startIndex = Math.max(0, endIndex - spec.visibleTarget + 1);
  const startMs = timeMs[startIndex] ?? 0;
  const endMs = timeMs[endIndex] ?? 0;
  engine.setVisibleRange({ startMs, endMs });
  engine.flush();
  return { spec, startMs, endMs };
}

export function applyOverlayBatches(engine, dataset) {
  for (const batch of dataset.overlayBatches ?? []) {
    engine.setOverlays(batch);
  }
  engine.flush();
}
