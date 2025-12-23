# LLM-Friendly Refactor Plan (Urgent)

Status: proposed (ROADMAP M8R)
Owner: chart-engine repo

## Goals
- Reduce large files to improve navigation and context efficiency.
- Keep behavior and public API stable (refactor-only).
- Make module boundaries explicit and ownership clear.
- Keep files within LLM-friendly size limits.

## Design note (R3 slice: overlays + public types)
Scope: split `src/api/public-types.ts` into `src/api/types/*` and split `src/core/overlays.ts` into `src/core/overlays/*`, keeping index facades and preserving behavior. No public API changes or runtime behavior changes are permitted in this slice.

Owners and coordination:
- API and Contract Steward owns public type module boundaries and re-exports.
- Overlay Semantics and Plot Primitive Owner owns overlay store/validation/caps/clip split.
- Architecture Agent coordinates cross-layer refactor boundaries and confirms no contract drift.

## Design note (R1 slice: ChartEngine split)
Scope: extract ChartEngine method groups into `src/core/engine/*` modules (axis/layout, windowing, series, overlays, compute, replay, interaction, coordinates, render, diagnostics/repro). `src/core/chart-engine.ts` becomes a thin facade; behavior and public API remain stable.

Owners and coordination:
- Architecture Agent coordinates cross-cutting boundaries and verifies no contract drift.
- Data Pipeline Agent reviews windowing/LOD/data-window code movement.
- Rendering Agent reviews render-frame assembly and overlay layout emission.
- Interaction Agent reviews pointer/zoom/pan/crosshair/hit-test refactor.
- Diagnostics and Reproducibility Agent reviews repro bundle capture/apply moves.

## Design note (R2 slice: WebGL2 renderer split)
Scope: split `src/rendering/webgl2-renderer.ts` into `src/rendering/webgl2/*` modules (context, frame, series, geometry, buffers, draw, overlays, labels, utils). Keep renderer surface and visual output stable; no shader or render-graph changes beyond file moves.

Owners and coordination:
- Rendering Agent owns the refactor boundaries and GPU pipeline safety.
- Architecture Agent confirms no contract drift across render interfaces.

## Size policy (targets)
- TypeScript/JavaScript: target <= 350 lines, absolute max 500.
- Markdown: target <= 300 lines, absolute max 500.
- One file = one primary responsibility.

## Audit summary (current)
| File | Lines | Issue | Target split |
| --- | ---: | --- | --- |
| `src/rendering/webgl2-renderer.ts` | 2526 | Multiple subsystems in one file | Split into renderer core + buffers + geometry + draw + overlays + labels |
| `src/core/chart-engine.ts` | 2266 | Engine orchestration + data + interaction + render in one file | Split into engine modules by responsibility |
| `src/api/public-types.ts` | 486 | API types in a single file | Split into `src/api/types/*` and re-export |
| `src/core/overlays.ts` | 410 | Overlay store + validation + clipping mixed | Split into overlay submodules |
| `ROADMAP.md` | 474 | Close to limit | Convert to index when it exceeds 500 lines |
| `agents.md` | 478 | Close to limit | Split roles into leaf docs when it exceeds 500 lines |

## Recent refactors
- `src/rendering/webgl2/frame.ts` split into `frame-axes.ts` and `frame-series.ts` to keep the frame surface under the 500 line cap.

## Refactor map (by subsystem)

### 1) Core engine (ChartEngine)
**Target structure**
- `src/core/chart-engine.ts` (facade + public methods, thin delegators)
- `src/core/engine/context.ts` (EngineContext interface + shared state)
- `src/core/engine/state.ts` (PaneState/SeriesState/ScaleState types)
- `src/core/engine/events.ts` (event subscriptions + emitters)
- `src/core/engine/series.ts` (defineSeries/setSeriesData/updateSeries/removeSeries)
- `src/core/engine/overlays.ts` (setOverlays/removeOverlayBatch + layout emit)
- `src/core/engine/compute.ts` (setComputePipeline/post/cancel/apply)
- `src/core/engine/replay.ts` (setReplayState/reset/focus/clamp)
- `src/core/engine/interaction.ts` (pointer + pan + zoom + queue events)
- `src/core/engine/coordinates.ts` (time/x + price/y conversions)
- `src/core/engine/render.ts` (renderFrame + render state build)
- `src/core/engine/axis-layout.ts` (axis layout + ticks + gutter)
- `src/core/engine/windowing.ts` (render window + data window)
- `src/core/engine/diagnostics.ts` (logs/metrics/repro helpers)
- `src/core/engine/util.ts` (small shared helpers only)

**Method mapping (current -> target module)**
- Events: `onVisibleRangeChange`, `onTransformChange`, `onLayoutChange`, `onOverlayLayoutChange`, `onCrosshairMove`, `onCrosshairClick`, `onHitTest`, `onDiagnostics`, `onDataWindowRequest` → `engine/events.ts`
- Observability: `getDiagnostics`, `getEngineInfo`, `getLogs`, `getMetrics`, `captureReproBundle`, `applyReproBundle`, `fromReproBundle`, `recordLog`, `recordDiagnostic` → `engine/diagnostics.ts`
- Viewport + layout: `setViewportSize`, `setPaneLayout`, `getPlotArea`, `getRightGutterWidth`, `setScaleConfig`, `setTimeAxisConfig`, `setAutoScale`, `setScaleDomain`, `updateScaleDomain`, `recomputeLayout`, `getOrderedPanes` → `engine/axis-layout.ts` + `engine/windowing.ts`
- Series: `defineSeries`, `setSeriesData`, `updateSeries`, `removeSeries`, `validateSeriesUpdate`, `updateApproxBarInterval`, `selectLod`, `buildRenderSeries` → `engine/series.ts` + `engine/render.ts`
- Overlays: `setOverlays`, `removeOverlayBatch`, `emitOverlayLayout`, `buildOverlayLayoutItems` → `engine/overlays.ts`
- Compute: `setComputePipeline`, `postComputeRequest`, `cancelComputeIndicator`, `cancelComputeWindow`, `applyComputeResult`, `getComputeStatus` → `engine/compute.ts`
- Replay: `setReplayState`, `resetToLatest`, `resetAroundAnchor`, `focusTime`, `setVisibleRange`, `getCutoffTime`, `clampRangeToReplay`, `clampZoomSpan` → `engine/replay.ts`
- Interaction: `handlePointerMove`, `handlePointerClick`, `clearPointer`, `beginPan`, `updatePan`, `handleWheelZoom`, `zoomAt`, `endPan`, `panByFraction`, `queueCrosshairMove`, `queueHitTest`, `flushPendingCrosshairMove` → `engine/interaction.ts`
- Coordinates: `timeToX`, `xToTime`, `priceToY`, `yToPrice`, `findNearestTime`, `computeHitTest`, `hitTestSeries`, `hitTestOverlay` → `engine/coordinates.ts` + `engine/interaction.ts`
- Rendering: `renderFrame`, `collectSeriesForPane`, `buildAxisRenderState`, `buildRenderCrosshairs`, `findBottomPaneId`, `requestRender` → `engine/render.ts`
- Windowing: `emitVisibleRange`, `updateRenderWindow`, `shouldUpdateRenderWindow`, `maybeRequestDataWindow`, `updateDataWindowCoverage` → `engine/windowing.ts`

### 2) WebGL2 renderer
**Target structure**
- `src/rendering/webgl2-renderer.ts` (facade + lifecycle)
- `src/rendering/webgl2/context.ts` (GL init, resize, reset state)
- `src/rendering/webgl2/frame.ts` (render + renderPane + dynamic flush)
- `src/rendering/webgl2/frame-axes.ts` (grid, axes, crosshair labels)
- `src/rendering/webgl2/frame-series.ts` (CPU path for series appenders)
- `src/rendering/webgl2/series.ts` (series entry lifecycle + budgets)
- `src/rendering/webgl2/geometry.ts` (build line/area/bar/candle data)
- `src/rendering/webgl2/buffers.ts` (create/upload/upsert/release buffers)
- `src/rendering/webgl2/draw.ts` (draw calls + uniforms + bind buffers)
- `src/rendering/webgl2/overlays.ts` (overlay appenders)
- `src/rendering/webgl2/labels.ts` (label backgrounds + measurement)
- `src/rendering/webgl2/utils.ts` (toNdc, scissor, GL primitives)

**Method mapping (current -> target module)**
- Lifecycle: `constructor`, `initialize`, `resize`, `render`, `setDiagnostics`, `removeSeries`, `getMetrics` → `webgl2-renderer.ts` + `context.ts`
- Frame build: `renderPane`, `appendSeries`, `appendOverlays`, `appendGridAndAxes`, `appendCrosshair` → `frame.ts`
- Series lifecycle: `getSeriesEntry`, `updateSeriesEntry`, `releaseSeriesEntry`, `dropSeriesEntry`, `touchSeries`, `updateSeriesBytes`, `computeEntryBytes`, `getBufferBytes`, `enforceSeriesBudget`, `buildSeriesEntry` → `series.ts`
- Geometry: `buildLineData`, `buildAreaData`, `buildBarData`, `buildCandleBodyData`, `buildCandleWickData`, `computeBarHalfWidthTime` → `geometry.ts`
- Buffers: `uploadBuffer`, `createLineBuffer`, `uploadLineBuffer`, `createAreaBuffer`, `createBarBuffer`, `createCandleWickBuffers`, `createCandleBodyBuffer`, `upsertLineBuffer`, `upsertInstanceBuffer`, `createInstanceBuffer`, `releaseLineBuffer`, `releaseInstanceBuffer` → `buffers.ts`
- Draw: `drawLineSeries`, `drawAreaSeries`, `drawHistogramSeries`, `drawCandleSeries`, `setLineUniforms`, `setQuadUniforms`, `setBarUniforms`, `bindLineBuffer`, `bindQuadBuffer`, `bindBarBuffer` → `draw.ts`
- Overlays: `appendOverlayLine`, `appendOverlayArea`, `appendOverlayHistogram`, `appendOverlayHLine`, `appendOverlayZone`, `appendOverlayMarkers`, `appendOverlayLabels` → `overlays.ts`
- Labels/util: `renderLabelBackgrounds`, `measureLabel`, `appendRect`, `toNdc`, `computeBarWidth`, `findBottomPaneId`, `applyScissor`, `glLineStrip`, `glLines`, `glTriangles` → `labels.ts` + `utils.ts`

### 3) Overlay pipeline
**Target structure**
- `src/core/overlays.ts` (index re-export)
- `src/core/overlays/store.ts` (OverlayStore)
- `src/core/overlays/validate.ts` (validateOverlay + issues)
- `src/core/overlays/caps.ts` (SUPPORTED_TYPES + enforceOverlayCaps)
- `src/core/overlays/clip.ts` (clipOverlay + clipPoints)
- `src/core/overlays/types.ts` (OverlayRenderItem)

### 4) Public API types
**Target structure**
- `src/api/public-types.ts` (index re-export)
- `src/api/types/core.ts` (TimeMs, Range, identifiers)
- `src/api/types/series.ts` (SeriesDefinition, SeriesData, updates)
- `src/api/types/overlays.ts` (Overlay types + data)
- `src/api/types/interaction.ts` (Crosshair/HitTest events)
- `src/api/types/compute.ts` (Compute pipeline types)
- `src/api/types/replay.ts` (ReplayState)
- `src/api/types/theme.ts` (Theme + style tokens)
- `src/api/types/diagnostics.ts` (Diagnostic types)

### 5) Text rendering
**Target structure**
- `src/rendering/text/atlas.ts` (GlyphAtlas)
- `src/rendering/text/layout.ts` (TextLabel/TextLayer + CanvasTextLayer)
- `src/rendering/text/render.ts` (GPU text drawing)
- `src/rendering/text/index.ts` (text exports; legacy entrypoints re-export from `src/rendering/text/`)

### 6) Documentation hygiene (when limits are exceeded)
- `ROADMAP.md`: keep as index + top-level milestones, move details to `docs/roadmap/`.
- `agents.md`: keep as index + role summary, move role detail to `docs/agents/`.

**Guardrail trigger and split process**
- Trigger: if `ROADMAP.md` or `AGENTS.md` exceeds 500 lines after a change, split immediately.
- Process: keep the top-level file as an index and move detailed sections into leaf docs under `docs/roadmap/` or `docs/agents/`.
- Cross-links: update `docs/INDEX.md` and any inbound references to point to the new leaf docs.
- Invariants: keep milestone status and ownership in the top-level index so status remains visible.

## Phased implementation plan (refactor-only)

### Phase R0 - Baseline and guardrails
- Freeze behavior changes; run `npm run check`.
- Define a refactor checklist for each file (imports, exports, tests).
- Add a rule: no file over 500 lines after refactor.

### Phase R1 - ChartEngine split
- Create `src/core/engine/` modules listed above.
- Move logic from `src/core/chart-engine.ts` into modules.
- Keep `ChartEngine` API stable; replace internals with delegators.
- Update imports across core to point to new modules.

### Phase R2 - WebGL2 renderer split
- Create `src/rendering/webgl2/` modules listed above.
- Move large draw/buffer/geometry logic out of `webgl2-renderer.ts`.
- Keep renderer public surface unchanged.

### Phase R3 - Overlays + public types
- Split overlays into submodules; keep `overlays.ts` as index.
- Split `public-types.ts` into `src/api/types/` and re-export.
- Update internal imports to new type modules.

### Phase R4 - Text rendering consolidation
- Move GPU text + atlas into `src/rendering/text/`.
- Update renderer imports to new paths.

### Phase R5 - Docs guardrails
- If `ROADMAP.md` or `agents.md` exceed 500 lines, convert to index + leaf docs.
- Update `docs/INDEX.md` and cross-links.

## Verification
- `npm run check`
- `npm run test:ui:smoke`
- Targeted tests for data pipeline, hit-testing, overlays, repro bundles.
