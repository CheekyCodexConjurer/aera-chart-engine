# Interaction Priority Rules

This document defines priority ordering for input handling, rendering, and background work.

## Priority order (highest to lowest)
1. Input handling and interaction state updates.
2. Frame scheduling and transform updates.
3. Overlay rendering for active interactions.
4. Data window updates and LOD recomputation.
5. Indicator result ingestion.
6. Diagnostics aggregation and logging.

- Vertical pan scale-domain updates are treated as transform updates and must not block input.

## Cancellation and coalescing
- Long-running tasks must be cancellable.
- Multiple invalidations are coalesced into a single frame.
- Stale compute results are dropped deterministically.

## Backpressure rules
- Queue depth is capped per worker and per series.
- Exceeding caps triggers drop or coalesce, never blocking input.
