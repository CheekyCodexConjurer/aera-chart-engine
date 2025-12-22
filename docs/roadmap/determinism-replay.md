# Determinism and Replay

This spec defines deterministic update invariants and replay harness expectations.

## Determinism invariants
- Updates are idempotent: same input yields same output.
- Ordering is strict: no out-of-order inserts in incremental updates.
- LOD selection is deterministic for a given range and pixel density.
- Data window and render window rules are explicit and observable.

## Replay invariants
- Global cutoff applies to candles and all overlays without exception.
- Navigation cannot move beyond cutoff + padding.
- Hit-testing respects cutoff and gaps.

## Replay harness expectations
- Given identical input snapshots and replay state, output hashes match.
- Harness captures inputs, view state, and engine version.
- Harness validates crosshair/time mapping at cutoff edges.

## References
- `../replay-semantics.md`
- `../data-time-semantics.md`
- `../data-rendering-pipeline-contract.md`
