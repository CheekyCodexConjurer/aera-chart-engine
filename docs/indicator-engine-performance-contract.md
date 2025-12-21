# Indicator Engine and Chart Engine Performance Contract

This document defines the data contract between indicator execution and the chart engine.

## Indicator output guarantees (host responsibilities)
- Time-aligned outputs in canonical time domain.
- Strictly increasing time ordering per output series.
- Stable ids for plots, layers, and outputs.
- Explicit caps on points per indicator per pane.
- No NaN or Infinity values.

## Output sizing caps (default)
- Lines: 200k points per pane.
- Markers: 50k points per pane.
- Zones: 10k segments per pane.
- Labels: 10k labels per pane.

## Chart engine guarantees
- Cutoff clipping applies to all indicator outputs.
- Deterministic z-ordering of overlays.
- Incremental application without full scene rebuild.
- Diagnostics for dropped or invalid outputs.

## Failure handling
- If caps are exceeded, the engine drops excess with diagnostics.
- If ordering is invalid, the engine rejects the update.
