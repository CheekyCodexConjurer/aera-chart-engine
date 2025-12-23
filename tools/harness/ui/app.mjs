import { ChartEngine, WebGL2Renderer, CanvasTextLayer } from "../../../dist/index.js";
import { listScenarioIds } from "../scenarios/registry.mjs";
import { loadScenarioDataset } from "../datasets/registry.mjs";
import { applyOverlayBatches, loadScenarioIntoEngine } from "../scenarios/setup.mjs";

const glCanvas = document.getElementById("glCanvas");
const textCanvas = document.getElementById("textCanvas");
const stage = document.getElementById("stage");
const scenarioSelect = document.getElementById("scenarioSelect");
const resetBtn = document.getElementById("resetBtn");
const panLeftBtn = document.getElementById("panLeftBtn");
const panRightBtn = document.getElementById("panRightBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const replayToggleBtn = document.getElementById("replayToggleBtn");
const replaySlider = document.getElementById("replaySlider");
const overlaysToggle = document.getElementById("overlaysToggle");
const statusEl = document.getElementById("status");

let engine = null;
let currentDataset = null;
let currentRange = null;
let replayEnabled = false;
let dragging = false;
let priceScaleDrag = null;

const PRICE_SCALE_PANE = "price";
const PRICE_SCALE_ID = "price";
const PRICE_SCALE_ZOOM_SPEED = 0.005;
const PRICE_SCALE_MIN_RANGE_RATIO = 0.001;
const PRICE_SCALE_MAX_RANGE_RATIO = 100;

function getStageSize() {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  return { width, height };
}

function createEngine() {
  const textLayer = new CanvasTextLayer(textCanvas, { font: "12px sans-serif" });
  const renderer = new WebGL2Renderer(glCanvas, { textLayer });
  const { width, height } = getStageSize();
  const nextEngine = new ChartEngine({
    width,
    height,
    devicePixelRatio: window.devicePixelRatio ?? 1,
    renderer
  });
  nextEngine.onVisibleRangeChange((event) => {
    currentRange = event.range;
    updateStatus();
  });
  nextEngine.onDiagnostics(updateStatus);
  return nextEngine;
}

function updateStatus() {
  const diagCount = engine?.getDiagnostics()?.length ?? 0;
  const rangeText = currentRange
    ? `${Math.round(currentRange.startMs)} → ${Math.round(currentRange.endMs)}`
    : "n/a";
  statusEl.textContent = `range: ${rangeText} | diagnostics: ${diagCount}`;
}

function resize() {
  if (!engine) return;
  const { width, height } = getStageSize();
  engine.setViewportSize(width, height, window.devicePixelRatio ?? 1);
}

function getPriceScaleSnapshot() {
  if (!engine) return null;
  const plotArea = engine.getPlotArea(PRICE_SCALE_PANE);
  const top = engine.yToPrice(PRICE_SCALE_PANE, PRICE_SCALE_ID, plotArea.y);
  const bottom = engine.yToPrice(PRICE_SCALE_PANE, PRICE_SCALE_ID, plotArea.y + plotArea.height);
  if (top == null || bottom == null) return null;
  const min = Math.min(top, bottom);
  const max = Math.max(top, bottom);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return { plotArea, min, max };
}

function isOverPriceScale(x, y) {
  if (!engine) return false;
  const plotArea = engine.getPlotArea(PRICE_SCALE_PANE);
  const gutter = engine.getRightGutterWidth(PRICE_SCALE_PANE);
  if (gutter <= 0) return false;
  const axisX = plotArea.x + plotArea.width;
  if (x < axisX || x > axisX + gutter) return false;
  return y >= plotArea.y && y <= plotArea.y + plotArea.height;
}

function updateCursor(x, y) {
  if (!engine || priceScaleDrag) return;
  glCanvas.style.cursor = isOverPriceScale(x, y) ? "ns-resize" : "default";
}

function beginPriceScaleDrag(pointerId, y) {
  const snapshot = getPriceScaleSnapshot();
  if (!snapshot) return false;
  const anchorPrice = engine.yToPrice(PRICE_SCALE_PANE, PRICE_SCALE_ID, y);
  if (anchorPrice == null || !Number.isFinite(anchorPrice)) return false;
  priceScaleDrag = {
    pointerId,
    startY: y,
    anchorPrice,
    startMin: snapshot.min,
    startMax: snapshot.max
  };
  glCanvas.setPointerCapture(pointerId);
  glCanvas.style.cursor = "ns-resize";
  return true;
}

function updatePriceScaleDrag(y) {
  if (!engine || !priceScaleDrag) return;
  const startRange = priceScaleDrag.startMax - priceScaleDrag.startMin;
  if (!Number.isFinite(startRange) || startRange <= 0) return;
  const deltaY = y - priceScaleDrag.startY;
  const factor = Math.exp(deltaY * PRICE_SCALE_ZOOM_SPEED);
  if (!Number.isFinite(factor) || factor <= 0) return;
  const minRange = Math.max(startRange * PRICE_SCALE_MIN_RANGE_RATIO, 1e-6);
  const maxRange = startRange * PRICE_SCALE_MAX_RANGE_RATIO;
  const nextRange = Math.min(Math.max(startRange * factor, minRange), maxRange);
  const anchorRatio = (priceScaleDrag.anchorPrice - priceScaleDrag.startMin) / startRange;
  const clampedRatio = Math.min(1, Math.max(0, anchorRatio));
  const min = priceScaleDrag.anchorPrice - clampedRatio * nextRange;
  const max = min + nextRange;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
  engine.setScaleDomain(PRICE_SCALE_PANE, PRICE_SCALE_ID, { min, max });
}

function endPriceScaleDrag(pointerId) {
  if (!priceScaleDrag) return;
  priceScaleDrag = null;
  glCanvas.style.cursor = "default";
  glCanvas.releasePointerCapture(pointerId);
}

function panByPixels(delta) {
  if (!engine) return;
  const x = glCanvas.clientWidth / 2;
  engine.beginPan("price", x);
  engine.updatePan("price", x + delta);
  engine.endPan();
}

function zoomBy(deltaY) {
  if (!engine) return;
  const x = glCanvas.clientWidth / 2;
  engine.handleWheelZoom("price", x, deltaY, 0.002);
}

function updateReplayCutoff() {
  if (!engine || !currentDataset) return;
  const timeMs = currentDataset.seriesData.get("candles")?.timeMs ?? [];
  const index = Math.max(0, Math.min(timeMs.length - 1, Number(replaySlider.value)));
  const cutoffTimeMs = timeMs[index] ?? null;
  if (replayEnabled && cutoffTimeMs != null) {
    engine.setReplayState({ mode: "paused", cutoffTimeMs });
  } else {
    engine.setReplayState({ mode: "off" });
  }
  engine.flush();
}

async function loadScenario(id) {
  currentDataset = await loadScenarioDataset(id);
  engine = createEngine();
  loadScenarioIntoEngine(engine, currentDataset, id);
  if (overlaysToggle.checked) {
    applyOverlayBatches(engine, currentDataset);
  }
  const timeMs = currentDataset.seriesData.get("candles")?.timeMs ?? [];
  replaySlider.min = "0";
  replaySlider.max = `${Math.max(0, timeMs.length - 1)}`;
  replaySlider.value = `${Math.max(0, timeMs.length - 1)}`;
  updateReplayCutoff();
  resize();
}

function attachCanvasControls() {
  glCanvas.addEventListener("pointerdown", (event) => {
    if (!engine) return;
    if (isOverPriceScale(event.offsetX, event.offsetY)) {
      if (beginPriceScaleDrag(event.pointerId, event.offsetY)) return;
    }
    dragging = true;
    glCanvas.setPointerCapture(event.pointerId);
    engine.handlePointerMove("price", event.offsetX, event.offsetY);
    engine.beginPan("price", event.offsetX);
  });
  glCanvas.addEventListener("pointermove", (event) => {
    if (!engine) return;
    if (priceScaleDrag) {
      updatePriceScaleDrag(event.offsetY);
      return;
    }
    updateCursor(event.offsetX, event.offsetY);
    if (dragging) {
      engine.handlePointerMove("price", event.offsetX, event.offsetY);
      engine.updatePan("price", event.offsetX);
      return;
    }
    engine.handlePointerMove("price", event.offsetX, event.offsetY);
  });
  function endDrag(event) {
    if (!engine) return;
    if (priceScaleDrag) {
      endPriceScaleDrag(event.pointerId);
      return;
    }
    if (dragging) {
      dragging = false;
      engine.endPan();
    }
    glCanvas.releasePointerCapture(event.pointerId);
  }
  glCanvas.addEventListener("pointerup", endDrag);
  glCanvas.addEventListener("pointercancel", endDrag);
  glCanvas.addEventListener("pointerleave", () => {
    if (!priceScaleDrag) {
      glCanvas.style.cursor = "default";
    }
  });
  glCanvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      engine.handleWheelZoom("price", event.offsetX, event.deltaY, 0.002);
    },
    { passive: false }
  );
}

function startRenderLoop() {
  function loop() {
    engine?.flush();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

scenarioSelect.innerHTML = listScenarioIds()
  .map((id) => `<option value="${id}">${id}</option>`)
  .join("");
scenarioSelect.addEventListener("change", (event) => {
  loadScenario(event.target.value);
});

resetBtn.addEventListener("click", () => engine?.resetToLatest());
panLeftBtn.addEventListener("click", () => panByPixels(-glCanvas.clientWidth * 0.1));
panRightBtn.addEventListener("click", () => panByPixels(glCanvas.clientWidth * 0.1));
zoomInBtn.addEventListener("click", () => zoomBy(-100));
zoomOutBtn.addEventListener("click", () => zoomBy(100));
replayToggleBtn.addEventListener("click", () => {
  replayEnabled = !replayEnabled;
  replayToggleBtn.textContent = replayEnabled ? "Replay On" : "Replay Off";
  updateReplayCutoff();
});
replaySlider.addEventListener("input", updateReplayCutoff);
overlaysToggle.addEventListener("change", () => {
  if (!engine || !currentDataset) return;
  if (overlaysToggle.checked) {
    applyOverlayBatches(engine, currentDataset);
    return;
  }
  for (const batch of currentDataset.overlayBatches ?? []) {
    engine.removeOverlayBatch(batch.batchId);
  }
  engine.flush();
});

window.addEventListener("resize", resize);
if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(stage);
}
attachCanvasControls();
startRenderLoop();
loadScenario("baseline-10k");
