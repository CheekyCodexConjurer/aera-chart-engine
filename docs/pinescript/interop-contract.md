# PineScript Interop Contract

This document defines the non-negotiable contract between PineScript compatibility and the chart engine.

## Ownership split
- Host owns parsing, execution, and validation of PineScript.
- Engine owns rendering, clipping, transforms, and diagnostics.

## Required host guarantees
- Canonical time domain: UTC epoch milliseconds.
- Strictly increasing time order per series.
- Stable ids for plots, objects, and overlay batches.
- Explicit update types: append, prepend, patch, replace.

## Required engine guarantees
- Replay cutoff clips all primitives without exception.
- Deterministic z-ordering by layer and zIndex.
- Diagnostics for unsupported primitives and invalid data.

## Conversion pipeline
1. PineScript output -> Plot API envelope.
2. Host normalizes to engine primitives.
3. Engine validates, clips, and renders.

## Error handling
- Compilation and runtime errors are host-owned.
- Render-time validation errors are engine-owned.
- All errors are typed and surfaced to the host.
