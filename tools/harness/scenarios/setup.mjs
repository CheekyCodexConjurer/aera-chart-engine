import { getScenarioSpec } from "./registry.mjs";

export function loadScenarioIntoEngine(engine, dataset, scenarioId) {
  const spec = getScenarioSpec(scenarioId ?? dataset.manifest.scenarioId);
  if (spec.paneLayout) {
    engine.setPaneLayout(spec.paneLayout);
  }
  for (const series of dataset.manifest.series) {
    engine.defineSeries({
      id: series.id,
      type: series.type,
      paneId: series.paneId,
      scaleId: series.scaleId
    });
  }
  for (const series of dataset.manifest.series) {
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
