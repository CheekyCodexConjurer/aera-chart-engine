# Implementation Plan (Phased)

This plan delivers a complete charting engine plus PineScript parity through a host compatibility layer. It is contract-first and requires approval before code work.

## Phase 0: Contract freeze and scope alignment
- Freeze canonical time domain and replay cutoff rules.
- Approve public API contract and overlay primitive list.
- Approve PineScript catalog and ownership split.
- Deliverable: signed-off docs and migration notes.

## Phase 1: Core engine foundation
- Scene graph, panes, scales, and coordinate transforms.
- Deterministic scheduler and dirty-flag invalidation.
- Headless core with renderer interface and diagnostics pipeline.
- Deliverable: engine core API with deterministic frame scheduling.

## Phase 2: Rendering pipeline (WebGL2-first)
- WebGL2 render graph, buffer pooling, instancing, and batching.
- Text rendering strategy and glyph atlas.
- Deterministic z-ordering and overlay clipping.
- Deliverable: baseline render passes for candles and lines.

## Phase 3: Data pipeline and LOD
- Window selection and prefetch contract.
- LOD/decimation with hysteresis and deterministic transitions.
- Cache model with caps and eviction.
- Deliverable: large dataset handling for 10k to 1M points.

## Phase 4: Interaction and replay
- Interaction state machine and pointer/keyboard contracts.
- Crosshair hit-testing, selection, and snapping hooks.
- Replay cutoff enforcement and navigation clamp.
- Deliverable: zero-jitter pan/zoom and replay safety.

## Phase 5: Overlay primitives and plotting
- Line, hline, zone, marker, label, histogram/area.
- Layering, clipping, and unsupported primitive diagnostics.
- DOM overlay support via coordinate conversion hooks.
- Deliverable: full primitive set for Plot API mapping.

## Phase 6: Diagnostics, observability, and regression gates
- Typed error taxonomy and deterministic repro bundles.
- Performance counters and debug overlays.
- Benchmark suite and SLO enforcement.
- Deliverable: no-merge regression policy enforced.

## Phase 7: PineScript host compatibility (host-owned)
- PineScript parser and execution runtime (host).
- Type system, built-in variables, and standard library coverage.
- Plot API normalization to engine primitives.
- Deliverable: parity suite against PineScript catalog.

## Phase 8: Integration hardening
- Quant-lab adapter validation and contract diffs.
- Replay and multi-timeframe stress tests.
- Memory budgets and GC audits.
- Deliverable: stable integration release candidate.

## Definition of done
- All contract docs are updated and approved.
- Engine passes `npm run check` and `npm run test:ui:smoke`.
- Benchmark suite shows no regressions for canonical scenarios.
- PineScript parity checklist reaches 100 percent coverage.
