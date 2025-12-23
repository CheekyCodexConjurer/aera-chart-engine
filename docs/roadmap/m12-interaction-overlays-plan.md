# M12 Interaction + Overlays Implementation Plan

Status: complete
Owner: Interaction Agent (coordination with Architecture)

## Scope
- Deterministic interaction state machine: pointer capture, wheel/pinch zoom, keyboard controls.
- Hit-testing across series and overlays with replay cutoff alignment.
- Full overlay primitive coverage per contract.
- Host overlay coordinate conversion events (event-driven, no per-frame polling).
- Design note: `docs/roadmap/m12-interaction-overlays-design.md`.

## Coordination requirements
- Architecture + Interaction: interaction state machine and lifecycle changes.
- Rendering + Interaction + Data Pipeline: hit-testing semantics and data alignment.
- Rendering + Interaction + Overlay Semantics Owner: overlay primitive coverage and layering.
- Replay Semantics Owner: any replay cutoff interactions or gap behavior.

## Phase 1 - Design note + contracts
- Write a short design note before implementation (cross-layer change requirement).
- Confirm invariants in `docs/interaction-model.md`, `docs/interaction-priority-rules.md`, and replay cutoff rules.
- Update contract docs as needed: `docs/public-api-contract.md`, `docs/overlay-indicator-rendering-contract.md`.
- Define new diagnostics/events in `docs/diagnostics-failure-surfaces.md` if behavior changes.

## Phase 2 - T12.1 Pointer capture, zoom, keyboard
- Implement pointer capture and release rules with explicit state transitions.
- Implement wheel/pinch zoom anchored to cursor; throttle to frame budget.
- Implement keyboard commands with deterministic anchor handling.
- Likely files: `src/interaction/state-machine.ts`, `src/interaction/pointer.ts`, `src/core/engine/interaction.ts`.
- Tests: `tests/interaction-input.mjs` (capture, drag, wheel, keyboard).

## Phase 3 - T12.2 Hit-testing with replay cutoff
- Implement hit-testing for series + overlays with replay cutoff clamp.
- Enforce ordering and deterministic tie-breaking for closest hits.
- Likely files: `src/core/engine/coordinates.ts`, `src/core/engine/interaction.ts`, `src/data/window.ts`.
- Tests: `tests/hit-testing.mjs` (replay cutoff, gaps, multi-pane).

## Phase 4 - T12.3 Overlay primitives
- Implement remaining primitives per contract, with diagnostics on unsupported types.
- Ensure clipping respects replay cutoff and pane boundaries.
- Likely files: `src/core/overlays/*`, `src/rendering/webgl2/overlays.ts`, `src/core/engine/overlays.ts`.
- Tests: `tests/overlay-primitives.mjs` (coverage matrix, clipping).

## Phase 5 - T12.4 Host overlay coordinate events
- Implement event-driven coordinate conversion updates (transform/layout).
- Emit versioned events with paneId, plotArea, and gutters.
- Likely files: `src/core/engine/coordinates.ts`, `src/core/engine/axis-layout.ts`, `src/core/engine/overlays.ts`.
- Tests: `tests/overlay-coordinates.mjs` (events fire on layout/transform changes).

## Phase 6 - Verification + docs sync
- Update `ROADMAP.md` status when complete and sync `docs/roadmap/INDEX.md`.
- Run `npm run check` and `npm run test:ui:smoke`.
- Run `npm run bench:interaction` and record deltas in `docs/roadmap/performance-gates.md`.

## Rationale
Interaction determinism, hit-testing, and overlay primitives are engine-level contracts that must remain stable across hosts; they belong in chart-engine to avoid divergent behavior in quant-lab.
