# Quant-Lab Integration Guide (Documentation-Only)

This document describes how `quant-lab` uses the engine today. It is a coordination guide, not a coupling contract.

## Integration stance
- Tight coordination on contracts and versioning.
- No shared code, no shared ownership.
- Host remains the workflow owner.

## Current host workflow patterns

### Paged market window and prefetch
- Host pages historical data in both directions.
- Prefetch is applied ahead of visible range edges.
- Engine requests data windows; host supplies slices.

### Render-window stabilization
- Host converts the visible range into a stable slice.
- The slice only shifts when the view approaches window edges.
- Stabilization reduces reflow during rapid pan or zoom.

### Timeframe switching optimization
- Host sends a temporary decimated slice for fast response.
- Host disables heavy overlays during the first frame.
- Full-resolution data and overlays are restored asynchronously.

### Bar replay workflow
- Arming: host enables replay mode and selects an anchor.
- Anchor selection: host sets `cutoffTimeMs` to anchor.
- Paused/playing: host controls playback rate and cutoff advance.
- Engine enforces clipping and navigation clamps.

### Overlay pipeline
- Host Plot API emits primitives (lines, zones, markers, labels).
- Engine renders primitives and clips them to cutoff and view.
- Host renders DOM overlays for tables and right labels.
- Host uses `onOverlayLayoutChange` to position DOM overlays without polling.

## What the host must provide
- Normalized data and indicator outputs in canonical time domain.
- Replay state machine and UI workflows.
- Paging, prefetch, and window supply logic.
- Plot API adapter that maps plots to engine primitives.

## What the engine guarantees
- Deterministic rendering under large datasets.
- Cutoff enforcement for replay across all overlays and series.
- Stable coordinate conversion for host overlays.
- Explicit diagnostics for invalid or unsupported inputs.
