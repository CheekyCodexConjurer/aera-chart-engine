import { ChartEngine, WebGL2Renderer, CanvasTextLayer } from "../../../dist/index.js";
import { listScenarioIds } from "../scenarios/registry.mjs";
import { loadScenarioDataset } from "../datasets/registry.mjs";
import { applyOverlayBatches, loadScenarioIntoEngine } from "../scenarios/setup.mjs";

const glCanvas = document.getElementById("glCanvas");
const textCanvas = document.getElementById("textCanvas");
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

function createEngine() {
  const textLayer = new CanvasTextLayer(textCanvas, { font: "12px sans-serif" });
  const renderer = new WebGL2Renderer(glCanvas, { textLayer });
  const nextEngine = new ChartEngine({
    width: glCanvas.clientWidth,
    height: glCanvas.clientHeight,
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
  const rect = glCanvas.getBoundingClientRect();
  engine.setViewportSize(rect.width, rect.height, window.devicePixelRatio ?? 1);
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
    dragging = true;
    glCanvas.setPointerCapture(event.pointerId);
    engine.beginPan("price", event.offsetX);
  });
  glCanvas.addEventListener("pointermove", (event) => {
    if (!engine) return;
    if (dragging) {
      engine.updatePan("price", event.offsetX);
      return;
    }
    engine.handlePointerMove("price", event.offsetX, event.offsetY);
  });
  function endDrag(event) {
    if (!engine) return;
    if (dragging) {
      dragging = false;
      engine.endPan();
    }
    glCanvas.releasePointerCapture(event.pointerId);
  }
  glCanvas.addEventListener("pointerup", endDrag);
  glCanvas.addEventListener("pointercancel", endDrag);
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
attachCanvasControls();
startRenderLoop();
loadScenario("baseline-10k");
