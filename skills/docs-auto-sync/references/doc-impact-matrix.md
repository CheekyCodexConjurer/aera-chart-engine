# Doc Impact Matrix

Use this matrix to decide which docs to update. Prefer updating docs when in doubt.

## Always consider
- ROADMAP.md (milestone status, refactor tasks)
- docs/roadmap/refactor-llm-friendly.md (module maps for large refactors)
- docs/architecture-overview.md (cross-layer invariants, lifecycle changes)

## Change type -> update docs
- Public API or lifecycle changes:
  - docs/public-api-contract.md
  - docs/roadmap/contracts-and-compat.md
  - docs/host-engine-responsibility-contract.md (if host/engine boundary)
- Rendering pipeline / WebGL / overlays:
  - docs/rendering-pipeline.md
  - docs/overlay-indicator-rendering-contract.md
  - docs/progressive-rendering-guarantees.md (if behavior/budget)
  - docs/roadmap/legacy-workstreams.md (if milestone)
- Interaction changes:
  - docs/interaction-model.md
  - docs/interaction-priority-rules.md
  - docs/redraw-invalidation-rules.md (if invalidation behavior)
- Data window / LOD / time semantics:
  - docs/data-model.md
  - docs/data-time-semantics.md
  - docs/large-dataset-handling.md
  - docs/roadmap/determinism-replay.md (if replay/window rules)
- Compute / indicators / workers:
  - docs/indicator-engine-performance-contract.md
  - docs/backpressure-cancellation-contract.md
  - docs/roadmap/threading-plan.md (if worker boundary)
- Diagnostics / repro / error taxonomy:
  - docs/diagnostics-failure-surfaces.md
  - docs/auto-debug.md
  - docs/roadmap/observability-repro.md
- Performance budgets / benchmarks / SLOs:
  - docs/performance-contracts.md
  - docs/main-thread-blocking-budget.md
  - docs/responsiveness-slos.md
  - docs/benchmark-regression-policy.md
  - docs/roadmap/performance-gates.md
- CI / packaging / release:
  - docs/roadmap/ci-gates.md
  - docs/roadmap/packaging-release.md
- Integration harness or host interop:
  - docs/roadmap/integration-harness.md
  - docs/quant-lab-integration-guide.md (if host patterns)
- Streaming updates or data handoff:
  - docs/streaming-update-contract.md
  - docs/data-rendering-pipeline-contract.md

## Doc update rules
- Add migration notes for contract changes.
- Add before/after metrics if budgets changed.
- Add rationale to any new doc: why it belongs in chart-engine and not quant-lab.
- Update docs/INDEX.md or docs/roadmap/INDEX.md if you add a new doc under those trees.
