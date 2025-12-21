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

## Viewport control (required)
- `resetToLatest(paneId?)`
- `resetAroundAnchor(timeMs, paneId?)`
- `focusTime(timeMs, paneId?)`
- `setVisibleRange(range, paneId?)`

**Rules**
- All inputs are in the canonical time domain.
- The engine clamps navigation to replay cutoff when active.

## Visible range subscription (time domain)
- `onVisibleRangeChange(callback(range, paneId))`
- Range values are always in time milliseconds, not logical indices.
- Changes are emitted only when the range meaningfully changes.

## Pointer events contract
- `onCrosshairMove(callback(event))`
- `onCrosshairClick(callback(event))`

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
- Events are coalesced and must not exceed frame rate.

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

## Host overlay support (DOM overlays)
- Host overlays are positioned via conversion APIs and plot area metrics.
- Preferred update triggers:
  - `onTransformChange(callback(paneId))`
  - `onLayoutChange(callback(paneId))`
- Polling every frame is discouraged by default.

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
