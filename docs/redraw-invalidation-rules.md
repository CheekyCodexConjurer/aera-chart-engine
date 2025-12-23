# Redraw and Invalidation Rules

This document defines redraw triggers and invalidation scope per interaction type.

## Global redraw triggers
- Data window changes.
- Axis scale or layout changes.
- Theme or style changes.
- Interaction state changes that affect visible overlays.
- DevicePixelRatio changes and resize.

## What must never trigger a redraw
- Pointer move with no overlay changes.
- Background compute for data outside the view window.
- Diagnostics updates or logging.

## Interaction-specific rules
**Pan and zoom**
- Transform-only in steady state.
- No full re-tessellation of 1M points.
- Pinch zoom follows the same transform-only rules.

**Crosshair move**
- Overlay pass only.
- No data buffer updates.

**Indicator toggle**
- Overlay layers update only.
- Candle buffers are not re-uploaded.

**Timeframe switch**
- Render coarse LOD first.
- Progressive refinement and overlay re-enable.
- No blocking on indicator recompute.
