# Data Model

This document defines the core data entities, identity rules, and ownership boundaries for the engine.

## Purpose
- Provide stable identities and update semantics.
- Define pane and scale relationships before implementation.
- Align data windows, view windows, and incremental updates.

## Core entities
| Entity | Description | Identity |
| --- | --- | --- |
| Chart | Root container for panes and global time axis | `chartId` |
| Pane | Rectangular region with series and overlays | `paneId` |
| Scale | Y-axis mapping for a pane | `scaleId` |
| Series | Typed renderer with immutable data snapshots | `seriesId` |
| Overlay | Transient visual layer | `overlayId` |

## Identity and lifecycle
- All ids are stable across updates.
- Create, update, and destroy are explicit operations.
- Any id reuse is treated as a breaking change in the host.

## Series data snapshots
- Data is ingested as immutable snapshots with a monotonic `version`.
- The engine never mutates host-provided arrays.
- Incremental updates are applied against a known version.

## Data window vs view window
**Definitions**
- View window: the visible time range derived from the axis and pane size.
- Data window: the time range of data available to render, including prefetch.

**Ownership**
- The engine owns view window selection.
- The host owns data supply for the requested window.
- Prefetch margin is defined by the engine and communicated to the host.

**Contract**
- The engine can request more history or future data via callbacks.
- The host responds with data slices aligned to the canonical time domain.
- If the host provides a smaller window, the engine must surface a diagnostic.
- Requests include `requestId`, `reason`, and `pendingCount` for backpressure visibility.
- Hosts may acknowledge coverage explicitly via `setDataWindowCoverage(paneId, range | null)`.

## Render window stabilization
- The engine maintains an internal render window derived from the visible range plus prefetch.
- The render window only shifts when the view approaches its edges.
- Geometry is built for the render window; pan within it is transform-only.

## Window observability (required)
- Host-visible: `onVisibleRangeChange` emits the view window.
- Host-visible: `onDataWindowRequest` emits the render window, request id, and reason.
- Diagnostics and repro bundles must include render window ranges and shift reasons.
- Render window shifts are coalesced to avoid churn.
- `data.window.backpressure` is emitted when pending requests are coalesced.

## Update types (first-class)
| Update type | Description | View anchor behavior |
| --- | --- | --- |
| Append | Add newer points or update last candle | Preserve current view |
| Prepend | Add older points to history | Preserve anchor unless host requests reset |
| Patch | Modify a known time range | Preserve anchor unless out of range |
| Replace | Full series replacement | Anchor reset unless host pins it |

**Ordering invariants**
- Append updates must start after the last snapshot time.
- Prepend updates must end before the first snapshot time.
- Patch updates must reference timestamps already present in the snapshot.

## Cache and overlay impact
- Append and patch update only affected buffers and overlays.
- Replace triggers full buffer rebuild and rebinds overlays.
- Prepend preserves view anchor and avoids reflow unless configured.

## Full rebuild triggers
- Schema changes or time domain changes.
- Axis model changes that affect scale interpretation.
- Series type changes or renderer changes.

**Contract**
- The engine emits a rebuild-required diagnostic.
- Host may opt into progressive rendering to avoid UI freezes.

## Multi-pane and multi-axis invariants
- All panes share a single time domain by default.
- Each pane can have multiple Y scales, identified by `scaleId`.
- Only one visible scale per side is allowed; additional visible scales on the same side are hidden with diagnostics.
- Overlays must declare `paneId` and optional `scaleId`.
- Different time domains per pane are disallowed unless explicitly configured.

## References
- `data-time-semantics.md` for time domain and ordering rules.
- `public-api-contract.md` for required ids and handle usage.
