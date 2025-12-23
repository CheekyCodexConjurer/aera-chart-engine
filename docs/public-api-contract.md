# Public API Contract

This document defines the minimal host-facing API surface required by quant-lab workflows. It is documentation-only and does not prescribe implementation details.

## Scope and non-goals
- Covers viewport control, range events, pointer events, and coordinate conversion.
- Excludes UI controls, data fetching, and indicator execution.

## Canonical types
```
TimeMs: number  // UTC epoch milliseconds
PaneId: string
ScaleId: string
Range: { startMs: TimeMs, endMs: TimeMs }
Point: { x: number, y: number }
```

## Engine metadata (required)
- `getEngineInfo() -> { engineVersion: string, engineContractVersion: string }`

**Rules**
- `engineContractVersion` follows SemVer and is bumped on breaking changes.
- `engineVersion` tracks the package version.
- `engineContractVersion` must match the canonical value in `docs/roadmap/contracts-and-compat.md`.

## Engine options (selected)
- `rightGutterWidth`: width reserved for Y-axis labels.
- `leftGutterWidth`: minimum width reserved for left-axis labels.
- `paneGap`: vertical gap between panes in pixels.
- `lodHysteresisRatio`: LOD switching hysteresis ratio (0.05 - 0.5).
- `lodCacheEntries`: max entries in LOD render cache.
- `crosshairSync`: synchronize crosshair time across panes (default true).
- `axisLabelCharWidth`: fallback per-character width for axis label sizing.
- `axisLabelPadding`: padding applied when computing gutter widths.
- `axisLabelHeight`: label height used for tick density calculation.
- `axisLabelMeasure`: optional `(text) => widthPx` for precise gutter sizing.
- `timeAxisConfig`: optional time-axis tick and formatter overrides.
- `chartId`: stable chart identifier for logs and repro bundles.
- `sessionId`: optional session identifier (auto-generated if omitted).
- `logEventLimit`: max log events retained for repro bundles.
- `dataWindowMaxPending`: max pending data window requests before coalescing (default 2).
- `gapThresholdRatio`: multiple of median bar interval that defines a gap (default 3).

## Viewport control (required)
- `resetToLatest(paneId?)`
- `resetAroundAnchor(timeMs, paneId?)`
- `focusTime(timeMs, paneId?)`
- `setVisibleRange(range, paneId?)`
- `setPaneLayout([{ paneId, weight }])`

**Rules**
- All inputs are in the canonical time domain.
- The engine clamps navigation to replay cutoff when active.
- Pane layout weights are relative; unspecified panes default to weight 1.

## Visible range subscription (time domain)
- `onVisibleRangeChange(callback(range, paneId))`
- Range values are always in time milliseconds, not logical indices.
- Changes are emitted only when the range meaningfully changes.

## Data window requests (prefetch + paging)
- `onDataWindowRequest(callback(event))`

**Event payload**
```
{
  paneId: PaneId,
  range: Range,          // render window with prefetch margin
  prefetchRatio: number,
  requestId: number,
  reason: "render-window" | "coverage-gap" | "backpressure",
  pendingCount: number
}
```

**Rules**
- Emitted when the active render window shifts or when coverage is insufficient.
- Requests are coalesced; the engine will not spam identical windows.
- If host responds with a smaller window, the engine emits a diagnostic.
- Hosts may acknowledge coverage explicitly via `setDataWindowCoverage(paneId, range | null)`.

**Coverage override**
- `setDataWindowCoverage(paneId, range | null)` sets or clears host-reported coverage bounds.
- Passing `null` reverts to primary-series derived coverage.

**Reason values**
- `render-window`: initial request or render window shift.
- `coverage-gap`: coverage does not include the target range.
- `backpressure`: request coalesced due to pending cap.

## Pointer events contract
- `onCrosshairMove(callback(event))`
- `onCrosshairClick(callback(event))`
- `onHitTest(callback(event))`

**Event payload**
```
{
  paneId: PaneId,
  timeMs: TimeMs,            // continuous time under cursor
  nearestTimeMs: TimeMs|null, // nearest data point time
  price: number|null,        // price under cursor if applicable
  screen: Point
}
```

**Rules**
- The engine emits both continuous time and nearest data time.
- Snapping to bars is a host decision unless explicitly configured.
- `nearestTimeMs` is `null` when the cursor is inside a gap or outside coverage.
- Events are coalesced and must not exceed frame rate.
- During active drag/selection, crosshair and hit-test emissions are suppressed.

## Hit-test contract (host overlays + tooltips)
**Event payload**
```
{
  paneId: PaneId,
  timeMs: TimeMs,
  screen: Point,
  series: [{ seriesId, scaleId, timeMs, index, value?, open?, high?, low?, close?, distancePx? }],
  overlays: [{ overlayId, type, scaleId, timeMs?, value?, text?, distancePx? }]
}
```

**Rules**
- Hit-test uses a configurable pixel radius (`hitTestRadiusPx`).
- Series hits are sorted by proximity (lowest `distancePx` first).
- Overlay hits are optional and best-effort (no blocking).

## Interaction input (host-driven)
- `handlePointerMove(paneId, x, y)`
- `handlePointerClick(paneId, x, y)`
- `beginPan(paneId, x)`
- `updatePan(paneId, x)`
- `endPan()`
- `handleWheelZoom(paneId, x, deltaY, zoomSpeed?)`
- `handlePinchZoom(paneId, x, scale)`
- `clearPointer(paneId?)`
- `handleKeyCommand(paneId, command, anchorTimeMs?)`

**Rules**
- The host owns DOM events and feeds normalized inputs.
- Wheel zoom is cursor-anchored and must not block the main thread.
- `clearPointer` removes the crosshair and hover state.
- Keyboard commands are host-mapped and engine-executed.

## Keyboard command contract
Supported commands:
- `pan-left`, `pan-right`
- `zoom-in`, `zoom-out`
- `reset-latest`
- `reset-anchor` (requires `anchorTimeMs`)

## Coordinate conversion contract
- `timeToX(paneId, timeMs) -> number|null`
- `priceToY(paneId, scaleId, price) -> number|null`
- `xToTime(paneId, x) -> TimeMs|null`
- `yToPrice(paneId, scaleId, y) -> number|null`
- `getRightGutterWidth(paneId) -> number`
- `getPlotArea(paneId) -> { x: number, y: number, width: number, height: number }`

**Rules**
- Returns `null` when conversion is out of range.
- Conversions use the active axis transform at the time of the call.
- `onTransformChange` provides the plot area, visible range, and gutters for event-driven conversions.

## Worker / OffscreenCanvas (planned, doc-only)
These APIs describe the intended boundary; they are not implemented yet.

**Planned methods**
- `setWorkerAdapter(adapter)`
- `getWorkerStatus() -> { available: boolean, mode: "main" | "worker" | "offscreen" }`
- `postComputeRequest({ windowId, version, payload, priority? })`
- `cancelCompute(windowId)`

**Adapter interface (planned)**
```
WorkerAdapter: {
  post(message): void
  onMessage(handler): void
  terminate(): void
  supportsOffscreenCanvas?: boolean
}
```

**Rules**
- Worker results are versioned and dropped if stale.
- Fallback to main thread emits diagnostics and never happens silently.

## Compute pipeline (implemented)
- `postComputeRequest({ indicatorId, windowId, version, payload, seriesId?, priority? })`
- `cancelComputeIndicator(indicatorId, version?)`
- `cancelComputeWindow(windowId)`
- `applyComputeResult({ indicatorId, windowId, version, batch, seriesId? })`
- `getComputeStatus() -> { pendingIndicators, pendingSeries }`
- `setComputePipeline(pipeline | null)`

**Rules**
- Results with versions older than the latest request are dropped deterministically.
- Queue depth is capped (default 2 per indicator/series) with diagnostics on drop.
- Cancellation is explicit and logged.

## Axis and scale configuration
- `setScaleConfig(paneId, scaleId, { position?, visible?, tickCount?, labelFormatter? })`
- `setTimeAxisConfig({ tickCount?, labelFormatter? })`

**Rules**
- `position` is `left` or `right`; invalid values emit diagnostics.
- The engine computes gutter widths from tick labels and applies hysteresis.
- Label formatters must be deterministic and side-effect free.
- Only one visible scale per side is rendered; additional visible scales on the same side are hidden with diagnostics.

## Host overlay support (DOM overlays)
- Host overlays are positioned via conversion APIs and plot area metrics.
- Preferred update triggers:
  - `onTransformChange(callback(event))`
  - `onLayoutChange(callback(event))`
- `onOverlayLayoutChange(callback(event))` emits precomputed layout anchors for `table` and `right-label`.
- Polling every frame is discouraged by default.

**Layout event payload**
```
{
  paneId: PaneId,
  plotArea: { x: number, y: number, width: number, height: number },
  index: number,
  count: number,
  leftGutterWidth: number,
  rightGutterWidth: number
}
```

**Transform event payload**
```
{
  paneId: PaneId,
  plotArea: { x: number, y: number, width: number, height: number },
  visibleRange: Range,
  leftGutterWidth: number,
  rightGutterWidth: number,
  devicePixelRatio: number
}
```

**Overlay layout event payload**
```
{
  frameId: number,
  items: [
    {
      type: "table",
      overlayId: string,
      paneId: string,
      position: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center" | "middle-left" | "middle-right" | "middle-center",
      plotArea: { x: number, y: number, width: number, height: number },
      rightGutterWidth: number,
      rows: [{ cells: [{ text: string }] }]
    },
    {
      type: "right-label",
      overlayId: string,
      labelId?: string,
      paneId: string,
      scaleId: string,
      plotArea: { x: number, y: number, width: number, height: number },
      rightGutterWidth: number,
      price: number,
      text: string,
      y: number
    }
  ]
}
```

## Theme and styling precedence
- Global theme -> pane theme -> series defaults -> plot overrides.
- "Kind" tags may influence defaults but must not enforce indicator-specific behavior.

## Theme update guarantees
- Theme updates are incremental and must not require full teardown.
- Partial theme updates merge deterministically with existing theme state.

## Multi-pane and scale identity
- All API calls use `paneId` and optional `scaleId`.
- A pane can have multiple Y scales; each is addressed by `scaleId`.
- Time domain is shared across panes unless explicitly configured.

## Error and diagnostics surface
- API errors are typed and include a severity and recoverability flag.
- Unsupported calls or invalid inputs must emit diagnostics.

## Observability helpers (implemented)
- `getLogs() -> LogEvent[]`
- `getMetrics() -> { renderer, engine }`
- `captureReproBundle() -> ReproBundle`
- `applyReproBundle(bundle)`
- `ChartEngine.fromReproBundle(bundle)`

**Renderer metrics snapshot**
- `renderer.lastFrame`: `drawCalls`, `batchCount`, `stateChanges`, `bufferUploads`, `bufferAllocations`, `bufferBytes`, `bufferReuses`.
- `renderer.totals`: same counters accumulated across frames.
- `renderer.textAtlas`: `pages`, `glyphs`, `capacity`, `occupancy`, `evictions`.

**Engine metrics snapshot**
- `engine.lodCacheHits`, `engine.lodCacheMisses`, `engine.lodCacheEvictions`.
- `engine.lodSelectionChanges` (LOD churn counter).
- `engine.renderCacheHits`, `engine.renderCacheMisses`.
