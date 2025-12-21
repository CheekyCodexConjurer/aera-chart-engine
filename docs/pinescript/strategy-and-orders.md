# Strategy and Orders Mapping

This document defines how PineScript strategy features map into the host and engine.

## Strategy ownership
- Strategy execution, orders, and performance analytics are host-owned.
- The engine does not evaluate strategy logic.

## Rendering implications
- Entry and exit markers render as marker primitives.
- Position overlays (average price, stops, targets) render as line or zone primitives.
- Performance tables render as host DOM overlays.

## Required host outputs
- Stable ids for trade markers and zones.
- Time-aligned events in the canonical time domain.
- Explicit z-ordering to avoid overlaps with indicator overlays.
