# Documentation Index

This index maps all canonical documentation for the chart engine. Each page is short, linkable, and contract-first.

## Entry points
- `../README.md` - repo scope and boundary matrix.
- `../architecture.md` - architecture overview and invariants.
- `implementation-plan.md` - phased implementation plan.

## Core architecture pages
- `data-model.md` - data structures, identities, and ownership.
- `data-time-semantics.md` - time domain, timezone, gaps, and ordering rules.
- `public-api-contract.md` - minimal host-facing API contract.
- `rendering-pipeline.md` - WebGL2 pipeline, buffers, and render graph.
- `interaction-model.md` - pan/zoom/crosshair semantics and input rules.
- `replay-semantics.md` - cutoff, preview, and time-travel rules.
- `overlay-indicator-rendering-contract.md` - overlay primitives and clipping.
- `diagnostics-failure-surfaces.md` - error taxonomy and repro bundles.
- `performance-contracts.md` - performance invariants and doc map.

## Contributor skills
- `../skills.md` - skills rubric and index.
- `skills/INDEX.md` - skill definition leaf pages.

## Integration and boundary contracts
- `host-engine-responsibility-contract.md` - non-negotiable ownership split.
- `quant-lab-integration-guide.md` - how the host uses the engine today.
- `indicator-engine-performance-contract.md` - indicator output guarantees.
- `data-rendering-pipeline-contract.md` - LOD and invalidation rules.

## Performance and responsiveness
- `large-dataset-handling.md` - dataset size guarantees and cache caps.
- `responsiveness-slos.md` - p50/p95 latency targets.
- `interaction-priority-rules.md` - input and scheduling priority contract.
- `main-thread-blocking-budget.md` - allowed vs disallowed work.
- `redraw-invalidation-rules.md` - redraw triggers per interaction.
- `progressive-rendering-guarantees.md` - coarse-to-fine rendering contract.
- `backpressure-cancellation-contract.md` - queue limits and stale drops.
- `streaming-update-contract.md` - last-candle and tick update rules.
- `benchmark-regression-policy.md` - benchmark scenarios and no-merge rule.
- `perf-debug-checklist.md` - required evidence for perf-sensitive changes.

## PineScript compatibility (host-owned execution)
- `pinescript/INDEX.md` - PineScript compatibility index and scope.
- `pinescript/catalog/INDEX.md` - full PineScript catalog listing.
- `pinescript/coverage/INDEX.md` - coverage matrix by entry.
- `pinescript/compatibility-matrix.md` - feature map and ownership.
- `pinescript/execution-model.md` - bar-by-bar semantics and replay alignment.
- `pinescript/type-system.md` - series/simple/input rules.
- `pinescript/plotting-and-objects.md` - plots and object mapping.
- `pinescript/timeframes-and-request.md` - request.security and multi-timeframe.
- `pinescript/strategy-and-orders.md` - strategy features and rendering.
- `pinescript/style-and-colors.md` - tokenized styling.
- `pinescript/limits-and-performance.md` - limits and budgets.
- `pinescript/interop-contract.md` - host/engine contract for parity.
