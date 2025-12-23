# Roadmap Index

This index links the detailed specs referenced by the executable ROADMAP.

## Core specs
- `contracts-and-compat.md` - contract versioning, compatibility rules, and adapter guidance.
- `integration-harness.md` - minimal host harness and dataset scenarios.
- `performance-gates.md` - benchmark budgets, harness design, and regression rules.
- `determinism-replay.md` - determinism invariants and replay harness expectations.
- `observability-repro.md` - logging, metrics, and repro bundle format.
- `threading-plan.md` - worker and OffscreenCanvas plan with API boundaries.
- `packaging-release.md` - packaging targets, release hygiene, and compatibility matrix.
- `ci-gates.md` - CI stages, gating policy, and local run guidance.
- `refactor-llm-friendly.md` - urgent refactor plan for LLM-friendly code layout.

## Design notes
- `m10-rendering-layout-design.md` - rendering buffers, text fallback, and axis gutter stability decisions.
- `m11-data-window-lod-design.md` - data window handshake, LOD cache, and gap handling.
- `m12-interaction-overlays-design.md` - interaction state, hit-testing, and overlay event decisions.
- `m12-interaction-overlays-plan.md` - phased plan for interaction + overlay implementation.
- `m13-compute-threading-design.md` - worker compute pipeline and offscreen renderer bridge.
- `m14-observability-determinism-design.md` - log/metric wiring, replay hash rules, and benchmark gates.
- `m15-pinescript-parity-design.md` - host adapter mapping and parity coverage validation.
- `m16-packaging-release-design.md` - export map, release checks, and compatibility matrix decisions.

## Legacy backlog
- `legacy-workstreams.md` - preserved workstreams from the original ROADMAP.
