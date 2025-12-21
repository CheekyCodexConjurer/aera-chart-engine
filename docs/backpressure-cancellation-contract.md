# Backpressure and Cancellation Contract

This document defines queue limits and deterministic dropping rules.

## Versioning rules
- All compute results include a `version` and `windowId`.
- Results are applied only if they match the current view state.
- Stale results are dropped with diagnostics.

## Queue limits
- Max queue depth per indicator: 2.
- Max queue depth per series: 2.
- Exceeding limits triggers coalesce or drop, never blocking input.

## Cancellation behavior
- Pending work is cancelled on view window change.
- Cancellation is explicit and logged.
- Partial results are discarded unless explicitly retained by host.
