# Architecture Overview

Rationale: System-level overview and invariants for chart-engine; quant-lab keeps its own docs.

This file is the overview. Detailed contracts are split into `docs/` and indexed by `INDEX.md`.

## 1. High-level system overview

### What this library is
- A GPU-first, headless charting engine for quantitative research workloads.
- A deterministic rendering and interaction core for large datasets.
- A local-first engine optimized for WebGL2 on modern Chromium.

### What this library is NOT
- Not a UI product or workflow orchestrator.
- Not a data fetching or storage system.
- Not an indicator execution engine.
- Not a server-rendered charting solution.

### Core design principles
- Deterministic performance with measurable budgets.
- Explicit architecture with clear ownership boundaries.
- Zero-jitter interaction and complete interaction states.
- No silent fallbacks, no hidden behavior.

## 2. Performance targets (non-negotiable)
| Metric | Target |
| --- | --- |
| Interaction FPS | 60 fps sustained |
| Render budget | 8 ms per frame |
| Main-thread blocking | 0 ms during interaction |
| Memory | bounded CPU and GPU caps |

Details: `performance-contracts.md`, `responsiveness-slos.md`.

## 3. Layered architecture

### Layer summary
- Core engine: scene graph, panes, axes, and interaction state.
- Rendering: WebGL2 render graph, buffers, and text.
- Data pipeline: windowing, LOD, caches.
- Compute: Workers/WASM for indicators (engine does not own compute).
- Integration: adapter layer with stable API.

### Ownership and contracts
- Canonical time domain: UTC epoch milliseconds.
- Host and engine responsibilities are non-negotiable.
- All cross-layer contracts are versioned.

Details:
- `host-engine-responsibility-contract.md`
- `data-model.md`
- `data-time-semantics.md`
- `rendering-pipeline.md`
- `data-rendering-pipeline-contract.md`
- `indicator-engine-performance-contract.md`

## 4. Interaction model
- Deterministic state machine (hover, drag, zoom, selection).
- Cursor-anchored zoom and stable hit-testing.
- Pointer and keyboard behavior are explicit and observable.

Details: `interaction-model.md`, `replay-semantics.md`.

## 5. Rendering lifecycle
- Single frame scheduler with dirty-flag invalidation.
- Overlay updates do not rebuild geometry.
- Redraw triggers are explicit and minimal.

Details: `redraw-invalidation-rules.md`.

## 6. Explicit non-goals
- Data fetching, indicator execution, or host UI workflows.
- Mobile-first UX or touch-only interaction.
- Silent quality fallbacks.

## 7. Evolution strategy
- Semantic versioning with explicit migration notes.
- Performance regressions are treated as breaking changes.
- Feature flags gate experimental behavior.

## 8. Debuggability and observability
- Typed errors and explicit diagnostics.
- Deterministic reproduction bundles.

Details: `diagnostics-failure-surfaces.md`.

## 9. Failure handling and recovery
- GPU context loss has explicit recovery paths.
- Worker failures and stale results are surfaced.
- Data validation errors are surfaced immediately.
