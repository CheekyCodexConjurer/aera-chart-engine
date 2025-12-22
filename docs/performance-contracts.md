# Performance Contracts

This document summarizes performance invariants and points to detailed performance docs.

## Non-negotiable invariants
- Deterministic frame scheduling and measurable budgets.
- No main-thread blocking during interaction.
- Bounded CPU and GPU memory use.
- Performance regressions are treated as breaking changes.

## Budget summary
- Interaction frame budget: 16.6 ms total, 8 ms render target.
- Input latency is measured end-to-end for pan, zoom, and hover.
- GC churn in hot paths is forbidden.

## Target summary (p50/p95)
- Frame time under load (500-2k visible): p50 <= 8 ms, p95 <= 16 ms.
- Input latency (pan/zoom/replay scrub): p95 <= 16 ms.
- Dataset scale: 10k-1M loaded points per series.
- Overlay scale: 5k markers, 2k labels, 1k zones per pane.
- Source of truth for per-action SLOs: `responsiveness-slos.md`.

## Related documents
- `responsiveness-slos.md` for p50/p95 latency targets.
- `main-thread-blocking-budget.md` for allowed work on main thread.
- `interaction-priority-rules.md` for scheduling priority.
- `redraw-invalidation-rules.md` for redraw triggers.
- `progressive-rendering-guarantees.md` for coarse-to-fine rules.
- `backpressure-cancellation-contract.md` for queue limits.
- `streaming-update-contract.md` for last-candle updates.
- `benchmark-regression-policy.md` for no-merge rules.
- `perf-debug-checklist.md` for required evidence.
