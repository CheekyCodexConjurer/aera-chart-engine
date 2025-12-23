# M14 Observability + Determinism Design Notes

## Context
M14 completes runtime observability and deterministic replay validation. The engine already emits core log events and captures repro bundles, but metrics coverage, replay hashing, and CI benchmark gating need to be made enforceable.

## Decisions
- Extend renderer metrics with `stateChanges`, `batchCount`, `bufferReuse`, and text atlas `evictions` counters so GPU regressions are observable without timing-only reliance.
- Add engine metrics for `lodSelectionChanges` to track LOD churn explicitly alongside cache hit/miss/eviction counters.
- Replay hashing uses repro bundle inputs and view state to avoid GPU output dependence; digest includes visible range and render window per pane, plus per-series/overlay counts and first/last visible times (quantized to 1e-4).
- Replay harness compares hash sequences within a deterministic run (same inputs yield identical hashes); no external baselines required to avoid drift.
- Benchmark gating in CI runs baseline and interaction suites, then enforces thresholds using report assertions.

## Non-goals
- No GPU raster hashing or pixel snapshots.
- No external telemetry integrations.
- No changes to host-owned playback UI.

## Rationale
These changes are engine-owned: they define the observable runtime contract, replay determinism checks, and performance gates required for quant workflows. They belong in chart-engine rather than quant-lab because they codify the engine’s measurable behavior and reproducibility guarantees.
