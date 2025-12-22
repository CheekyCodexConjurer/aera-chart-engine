# ROADMAP (Quant-Lab Ready)

Status: active
Owner: chart-engine repository

## Objective
Transform the chart engine into a quant-lab-ready, contract-driven system with deterministic performance, explicit compatibility, and reproducible diagnostics.

## Scope
- In scope: engine core, rendering, interaction, data pipeline, contracts, diagnostics, benchmarks.
- Out of scope: host UI, data fetching, indicator authoring, and host workflow state.

## What “quant-lab ready” means (non-marketing)
- Versioned public contracts with explicit breaking change policy.
- Integration harness that simulates a host without coupling to it.
- Performance budgets enforced by reproducible benchmarks.
- Deterministic output under replay and stable update semantics.
- Observable failures with repro bundles.
- Worker/OffscreenCanvas plan with explicit boundaries and fallback.
- Packaging and release hygiene with compatibility matrices.
- CI gates that block regressions and contract drift.

## Navigation
- Detailed specs are in `docs/roadmap/INDEX.md`.
- Legacy phase backlog is preserved in `docs/roadmap/legacy-workstreams.md`.

## Milestones

### M0 — Contract baseline and compatibility
**Goal**: Lock the versioned contract model and deprecation policy.

- [x] T0.1 Define `engineContractVersion` and SemVer policy.
  - Context: contract drift blocks host integration.
  - Changes: `docs/roadmap/contracts-and-compat.md`, `docs/public-api-contract.md`.
  - DoD: version field specified; major/minor/patch rules documented.
  - Risks: version churn; Mitigation: deprecation window.
  - Deps: none.

- [x] T0.2 Deprecation and migration rules.
  - Context: host needs predictable upgrade paths.
  - Changes: `docs/roadmap/contracts-and-compat.md`.
  - DoD: deprecation window and migration note template documented.
  - Risks: missed updates; Mitigation: contract tests gate.
  - Deps: T0.1.

- [x] T0.3 Contract tests (doc-first spec).
  - Context: detect contract drift automatically.
  - Changes: `docs/roadmap/contracts-and-compat.md`, `docs/roadmap/ci-gates.md`.
  - DoD: test scope and failure conditions defined.
  - Risks: false positives; Mitigation: explicit version bump rules.
  - Deps: T0.1.

- [x] T0.4 Adapter guidance (host-facing).
  - Context: clarify boundary without coupling to host code.
  - Changes: `docs/roadmap/contracts-and-compat.md`, `docs/host-engine-responsibility-contract.md`.
  - DoD: adapter responsibilities and inputs documented.
  - Risks: scope creep; Mitigation: enforce non-goals in doc.
  - Deps: T0.1.

### M1 — Integration harness (host fake)
**Goal**: Provide a minimal playground that exercises critical flows.

- [x] T1.1 Harness spec and UI controls.
  - Context: needs a reproducible environment for pan/zoom/replay/overlays.
  - Changes: `docs/roadmap/integration-harness.md`.
  - DoD: control list and scenarios documented.
  - Risks: under-coverage; Mitigation: include pathological cases.
  - Deps: none.

- [x] T1.2 Dataset catalog and scenario matrix.
  - Context: benchmarks require deterministic datasets.
  - Changes: `docs/roadmap/integration-harness.md`.
  - DoD: dataset sizes, gaps, bursts, streaming cases, schema, and seed rules defined.
  - Risks: non-representative datasets; Mitigation: include quant-lab patterns.
  - Deps: T1.1.

- [x] T1.3 Smoke test flow using the harness.
  - Context: automation must use the same paths as users.
  - Changes: `docs/roadmap/integration-harness.md`, `docs/roadmap/ci-gates.md`.
  - DoD: expected entrypoints, pass/fail criteria, and headless report outputs documented.
  - Risks: brittle flows; Mitigation: use stable scenario ids.
  - Deps: T1.1.

### M2 — Performance gates
**Goal**: Establish numeric budgets and a repeatable benchmark harness.

- [x] T2.1 Define performance budgets with numbers.
  - Context: performance cannot be vague.
  - Changes: `docs/roadmap/performance-gates.md`, `docs/performance-contracts.md`.
  - DoD: p50/p95 targets and dataset sizes documented.
  - Risks: unrealistic targets; Mitigation: calibrate with baseline runs.
  - Deps: T1.2.

- [x] T2.2 Benchmark harness spec.
  - Context: needs reproducible measurements.
  - Changes: `docs/roadmap/performance-gates.md`.
  - DoD: headless runner + artifact format defined.
  - Risks: non-deterministic runs; Mitigation: fixed seeds and warmups.
  - Deps: T2.1.

- [x] T2.3 Regression policy and CI gate.
  - Context: regressions must block merge.
  - Changes: `docs/roadmap/performance-gates.md`, `docs/roadmap/ci-gates.md`.
  - DoD: regression thresholds and waiver rules defined.
  - Risks: too strict early; Mitigation: staged rollout of gates.
  - Deps: T2.2.

### M3 — Determinism and replay
**Goal**: Make replay and update semantics fully deterministic and testable.

- [x] T3.1 Determinism invariants and update ordering.
  - Context: replay depends on strict ordering and idempotence.
  - Changes: `docs/roadmap/determinism-replay.md`, `docs/data-time-semantics.md`.
  - DoD: invariants and update rules documented with examples.
  - Risks: ambiguous rules; Mitigation: explicit canonical domain.
  - Deps: M0.

- [x] T3.2 Render window vs data window rules.
  - Context: determinism depends on window definitions.
  - Changes: `docs/roadmap/determinism-replay.md`, `docs/data-model.md`.
  - DoD: window definitions and observability points documented.
  - Risks: drift with implementation; Mitigation: contract tests.
  - Deps: T3.1.

- [x] T3.3 Replay harness spec.
  - Context: same input must yield same output.
  - Changes: `docs/roadmap/determinism-replay.md`, `docs/roadmap/integration-harness.md`.
  - DoD: replay inputs, output hash strategy, and asserts defined.
  - Risks: unstable hashes; Mitigation: stable ordering and version tagging.
  - Deps: T3.1.

### M4 — Observability and repro bundles
**Goal**: Make failures reproducible and performance measurable.

- [x] T4.1 Structured logging spec.
  - Context: logs must be machine-readable and scoped.
  - Changes: `docs/roadmap/observability-repro.md`.
  - DoD: required fields and event retention documented.
  - Risks: noisy logs; Mitigation: log levels and caps.
  - Deps: M0.

- [x] T4.2 Renderer metrics spec.
  - Context: performance needs GPU-level visibility.
  - Changes: `docs/roadmap/observability-repro.md`.
  - DoD: metrics list and sampling cadence documented.
  - Risks: overhead; Mitigation: optional metric collection.
  - Deps: T4.1.

- [x] T4.3 Repro bundle format.
  - Context: issues must be replayable offline.
  - Changes: `docs/roadmap/observability-repro.md`, `docs/diagnostics-failure-surfaces.md`.
  - DoD: JSON schema and capture/consume flow documented.
  - Risks: missing inputs; Mitigation: required field list and validation.
  - Deps: T4.1.

### M5 — Threading plan (Worker / OffscreenCanvas)
**Goal**: Document future compute/render isolation without committing to implementation.

- [x] T5.1 Worker/OffscreenCanvas architecture plan.
  - Context: main thread must remain responsive under load.
  - Changes: `docs/roadmap/threading-plan.md`.
  - DoD: option A/B diagram and boundary contracts documented.
  - Risks: unreachable design; Mitigation: list browser constraints.
  - Deps: M2.

- [x] T5.2 Public API stubs and contracts (doc-only).
  - Context: preserve forward-compatible API design.
  - Changes: `docs/roadmap/threading-plan.md`, `docs/public-api-contract.md`.
  - DoD: method signatures and payload shapes documented.
  - Risks: incompatible future implementation; Mitigation: review with renderer owner.
  - Deps: T5.1.

- [x] T5.3 Fallback and diagnostics policy.
  - Context: fallback must be explicit and observable.
  - Changes: `docs/roadmap/threading-plan.md`, `docs/diagnostics-failure-surfaces.md`.
  - DoD: fallback conditions and diagnostics codes documented.
  - Risks: silent fallback; Mitigation: no implicit fallback allowed.
  - Deps: T5.1.

### M6 — Packaging and release hygiene
**Goal**: Make consumption predictable and versioned.

- [x] T6.1 Packaging targets and exports.
  - Context: host integration depends on stable builds.
  - Changes: `docs/roadmap/packaging-release.md`.
  - DoD: ESM + types + export surface documented.
  - Risks: export drift; Mitigation: contract tests.
  - Deps: M0.

- [x] T6.2 Release workflow and changelog rules.
  - Context: releases must be auditable.
  - Changes: `docs/roadmap/packaging-release.md`.
  - DoD: tag format, changelog format, and required notes documented.
  - Risks: missing notes; Mitigation: CI gate on changelog.
  - Deps: T6.1.

- [x] T6.3 Compatibility matrix rules.
  - Context: host must know which versions are supported.
  - Changes: `docs/roadmap/packaging-release.md`, `docs/roadmap/contracts-and-compat.md`.
  - DoD: matrix format and update cadence documented.
  - Risks: stale matrix; Mitigation: update in every release.
  - Deps: T6.1.

### M7 — CI and gates
**Goal**: Block regressions in contracts, smoke, and benchmarks.

- [x] T7.1 CI pipeline specification.
  - Context: consistent verification is required.
  - Changes: `docs/roadmap/ci-gates.md`.
  - DoD: pipeline stages and required commands documented.
  - Risks: missing coverage; Mitigation: align with harness scenarios.
  - Deps: M1.

- [x] T7.2 Gate policy for contracts and smoke.
  - Context: contract drift must fail fast.
  - Changes: `docs/roadmap/ci-gates.md`, `docs/roadmap/contracts-and-compat.md`.
  - DoD: gate rules and failure triage documented.
  - Risks: over-blocking; Mitigation: staged enforcement levels.
  - Deps: T7.1.

- [x] T7.3 Benchmark gating rollout.
  - Context: performance gates must be enforceable.
  - Changes: `docs/roadmap/ci-gates.md`, `docs/roadmap/performance-gates.md`.
  - DoD: benchmark gate trigger conditions documented.
  - Risks: flaky runs; Mitigation: warmup and retry policy.
  - Deps: M2.

### M8 - Core engine completion (mapped from legacy phases)
**Goal**: Close the remaining rendering/data/interaction/compute backlog.

- [x] T8.1 Rendering pipeline completion.
  - Context: must reach production-grade GPU pipeline.
  - Changes: `docs/roadmap/legacy-workstreams.md`.
  - DoD: Phase 1 exit criteria satisfied.
  - Risks: GPU regressions; Mitigation: perf gates from M2.
  - Deps: M2.

- [x] T8.2 Axes and multi-scale completion.
  - Context: stable layout is required for host overlays.
  - Changes: `docs/roadmap/legacy-workstreams.md`.
  - DoD: Phase 2 exit criteria satisfied.
  - Risks: label jitter; Mitigation: tick collision tests.
  - Deps: M0.

- [x] T8.3 Data pipeline and LOD completion.
  - Context: large datasets must be deterministic.
  - Changes: `docs/roadmap/legacy-workstreams.md`.
  - DoD: Phase 3 exit criteria satisfied.
  - Risks: LOD flicker; Mitigation: hysteresis policy.
  - Deps: M2.

- [x] T8.4 Interaction and hit-testing completion.
  - Context: stable UX is mandatory.
  - Changes: `docs/roadmap/legacy-workstreams.md`.
  - DoD: Phase 4 exit criteria satisfied.
  - Risks: jitter under load; Mitigation: input priority rules.
  - Deps: M1.

- [x] T8.5 Compute and indicator integration completion.
  - Context: heavy indicators must not block.
  - Changes: `docs/roadmap/legacy-workstreams.md`.
  - DoD: Phase 5 exit criteria satisfied.
  - Risks: worker backpressure issues; Mitigation: cancellation policy.
  - Deps: M5.

- [x] T8.6 Observability and regression gate completion.
  - Context: production usage requires diagnostics.
  - Changes: `docs/roadmap/legacy-workstreams.md`.
  - DoD: Phase 6 exit criteria satisfied.
  - Risks: missing repro coverage; Mitigation: repro bundle spec (M4).
  - Deps: M4.

## Implementation milestones (code delivery)
M0–M8 establish the contract and documentation baseline. The milestones below track the real code delivery required for a production-ready engine.

### M8R - LLM-friendly refactor (urgent)
**Goal**: Reduce oversized files and clarify module boundaries before further implementation.

- [ ] T8R.1 Audit + refactor map published.
  - Changes: `docs/roadmap/refactor-llm-friendly.md`.
  - DoD: audit table + module map + phased refactor plan agreed.

- [ ] T8R.2 ChartEngine split.
  - DoD: `src/core/chart-engine.ts` becomes facade (<350 lines) with modules in `src/core/engine/`.
  - Deps: T8R.1.

- [ ] T8R.3 WebGL2 renderer split.
  - DoD: `src/rendering/webgl2-renderer.ts` becomes facade (<350 lines) with modules in `src/rendering/webgl2/`.
  - Deps: T8R.1.

- [ ] T8R.4 Overlays + public types split.
  - DoD: `src/core/overlays.ts` + `src/api/public-types.ts` become indices (<350 lines) with submodules.
  - Deps: T8R.1.

- [ ] T8R.5 Text rendering + docs guardrails.
  - DoD: text modules consolidated; `ROADMAP.md`/`agents.md` remain <= 500 lines.
  - Deps: T8R.1.

### M9 - Integration harness + CI (implementation)
**Goal**: Build the host-simulating harness and wire CI gates for real runs.

- [ ] T9.1 Implement the harness app and core scenarios.
  - Context: specs exist; no executable harness yet.
  - Changes: new `playground/` (or equivalent), scenario registry, wiring to engine API.
  - DoD: pan/zoom/replay/overlay scenarios run deterministically with a fixed seed.
  - Risks: scenario drift; Mitigation: scenario ids + golden configs.
  - Deps: M1.

- [ ] T9.2 Implement deterministic dataset generator + loader.
  - Context: benchmarks and smoke require reproducible data.
  - Changes: dataset generator, fixtures, loader contract used by harness.
  - DoD: dataset ids produce stable hashes across runs; artifacts stored.
  - Risks: non-determinism; Mitigation: fixed seeds + snapshot hashes.
  - Deps: T9.1.

- [ ] T9.3 Implement UI smoke test using the harness.
  - Context: current smoke does not exercise real host flows.
  - Changes: headless harness runner + snapshot assertions.
  - DoD: `npm run test:ui:smoke` runs the harness scenarios and outputs artifacts.
  - Risks: brittle tests; Mitigation: stable scenarios + tolerances.
  - Deps: T9.1.

- [ ] T9.4 Add CI pipeline with contract + smoke gates.
  - Context: gate rules exist only in docs.
  - Changes: CI workflow (typecheck, smoke, contract tests).
  - DoD: PRs fail on contract drift or smoke failures.
  - Risks: CI flakiness; Mitigation: warmups + retries for UI smoke.
  - Deps: T9.3, M7.

### M10 - Rendering + layout (implementation)
**Goal**: Complete the GPU rendering pipeline and layout guarantees in code.

- [ ] T10.1 Implement persistent GPU buffers, instancing, and clip stacks.
  - Context: required for stable frame budgets under 1M points.
  - Changes: renderer buffer strategy, instancing, clip masks per pane/layer.
  - DoD: pan/zoom steady state uses transform-only updates.
  - Risks: GPU regressions; Mitigation: perf benchmarks in M2 + gates in M7.
  - Deps: M2.

- [ ] T10.2 Implement text atlas + GPU text rendering with fallback policy.
  - Context: text must be stable without Canvas2D thrash.
  - Changes: SDF/MSDF atlas, glyph cache, fallback detection.
  - DoD: label rendering meets SLOs with deterministic cache behavior.
  - Risks: atlas thrash; Mitigation: cache caps + diagnostics.
  - Deps: T10.1.

- [ ] T10.3 Implement axis layout, gutters, and multi-scale rules in runtime.
  - Context: docs define one visible scale per side per pane.
  - Changes: axis layout engine, gutter sizing, tick collision rules.
  - DoD: no label overlap; right gutter width stable across pan/zoom.
  - Risks: label jitter; Mitigation: collision tests + deterministic layout.
  - Deps: M0.

### M11 - Data pipeline + LOD (implementation)
**Goal**: Deliver deterministic windowing, LOD, and cache behavior.

- [ ] T11.1 Implement window request handshake with prefetch + backpressure.
  - Context: host/engine window contract is doc-only.
  - Changes: request/response API, window cache, prefetch margin handling.
  - DoD: no view jumps on prepend/append; stable window updates under load.
  - Risks: window thrash; Mitigation: coalescing + request caps.
  - Deps: M3.

- [ ] T11.2 Implement LOD cache with hysteresis and deterministic selection.
  - Context: LOD flicker remains a core risk.
  - Changes: LOD tiers, cache eviction, pixel-density selection.
  - DoD: LOD boundary transitions are stable across panning.
  - Risks: memory growth; Mitigation: cache caps + eviction metrics.
  - Deps: T11.1.

- [ ] T11.3 Implement gap/session handling in the time axis.
  - Context: quant workflows require explicit gap policy.
  - Changes: gap compression rules, session markers, axis formatting.
  - DoD: gaps render per policy; crosshair behavior is deterministic.
  - Risks: domain drift; Mitigation: canonical time semantics in M3.
  - Deps: M3.

### M12 - Interaction + overlays (implementation)
**Goal**: Deliver deterministic interactions and full overlay primitive coverage.

- [ ] T12.1 Implement pointer capture, wheel/pinch zoom, and keyboard controls.
  - Context: interaction model is spec-only.
  - Changes: input handlers + state machine, priority rules enforced.
  - DoD: pan/zoom/crosshair meet SLOs with zero jitter.
  - Risks: main-thread stalls; Mitigation: transform-only updates during interaction.
  - Deps: M4.

- [ ] T12.2 Implement hit-testing across series + overlays with replay cutoff.
  - Context: hit-testing must respect replay and gaps.
  - Changes: hit-testing APIs, result ranking, replay cutoff clipping.
  - DoD: crosshair and selection match replay semantics with deterministic results.
  - Risks: inconsistent snapping; Mitigation: explicit snapping policy.
  - Deps: M3.

- [ ] T12.3 Implement all overlay primitives in the contract.
  - Context: quant-lab plots require full primitive support.
  - Changes: line/zone/marker/label/histogram/area/table primitives.
  - DoD: unsupported primitives emit diagnostics (no silent drop).
  - Risks: render overload; Mitigation: overlay caps + perf gates.
  - Deps: M2.

- [ ] T12.4 Implement host overlay coordinate conversion events.
  - Context: host overlays must avoid per-frame polling.
  - Changes: event-driven coordinate updates + API surface.
  - DoD: overlays can be placed deterministically with event triggers.
  - Risks: desync; Mitigation: versioned update events.
  - Deps: M0.

### M13 - Compute + threading (implementation)
**Goal**: Run indicators off the main thread and prepare worker rendering.

- [ ] T13.1 Implement worker compute pipeline with cancellation + backpressure.
  - Context: compute docs exist; runtime is partial.
  - Changes: worker pool, request versioning, cancellation, queue caps.
  - DoD: indicator toggles do not block; stale results dropped deterministically.
  - Risks: queue buildup; Mitigation: max queue depth + coalescing.
  - Deps: M5.

- [ ] T13.2 Implement OffscreenCanvas render path (optional mode).
  - Context: threading plan is doc-only.
  - Changes: renderer adapter for worker, message bridge, fallback rules.
  - DoD: parity with main-thread rendering for core flows.
  - Risks: browser support gaps; Mitigation: explicit fallback diagnostics.
  - Deps: M5.

### M14 - Observability + determinism (implementation)
**Goal**: Make runtime behavior fully observable and reproducible.

- [ ] T14.1 Wire structured logs + metrics to all hot paths.
  - Context: log/metrics schema exists, integration partial.
  - Changes: log emitters in renderer, pipeline, interaction.
  - DoD: repro bundle captures logs + metrics for a session.
  - Risks: overhead; Mitigation: sampling + caps.
  - Deps: M4.

- [ ] T14.2 Implement deterministic replay harness + snapshot checks.
  - Context: replay harness is doc-only.
  - Changes: replay runner, snapshot hashing, assert tooling.
  - DoD: same inputs yield same hashes across runs.
  - Risks: hash instability; Mitigation: normalized ordering rules.
  - Deps: M3.

- [ ] T14.3 Integrate benchmark gate into CI with thresholds.
  - Context: benches exist but not enforced.
  - Changes: CI gate, baseline artifacts, regression reporting.
  - DoD: CI blocks on perf regressions.
  - Risks: flaky baselines; Mitigation: warmups + retry policy.
  - Deps: M2, M7.

### M15 - PineScript parity (host adapter)
**Goal**: Reach 100% PineScript parity via host-owned runtime and adapter.

- [ ] T15.1 Implement PineScript adapter layer (host-owned).
  - Context: compatibility matrix is defined but unimplemented.
  - Changes: adapter mapping outputs -> engine primitives.
  - DoD: parity suite maps catalog entries to expected primitives.
  - Risks: scope creep; Mitigation: strict host/engine boundaries.
  - Deps: M12.

- [ ] T15.2 Implement parity coverage tests against the catalog.
  - Context: catalog exists without executable validation.
  - Changes: coverage harness + per-entry status checks.
  - DoD: 100% catalog entries are covered or explicitly exempted.
  - Risks: test maintenance; Mitigation: catalog diff tooling.
  - Deps: T15.1.

### M16 - Packaging + release (implementation)
**Goal**: Ship predictable builds with explicit compatibility.

- [ ] T16.1 Implement build outputs (ESM + types) with export map.
  - Context: packaging rules are doc-only.
  - Changes: build config, export map, public API surface tests.
  - DoD: consumption works via documented entrypoints.
  - Risks: export drift; Mitigation: contract tests.
  - Deps: M0.

- [ ] T16.2 Implement release workflow + compatibility matrix updates.
  - Context: release hygiene requires automation.
  - Changes: changelog enforcement, version tagging, matrix update gate.
  - DoD: releases fail without required notes + compatibility updates.
  - Risks: manual drift; Mitigation: CI gate on release artifacts.
  - Deps: T16.1.

## Cross-cutting dependencies
- M0 precedes any contract or API changes.
- M1 is required before any CI smoke gating.
- M2 is required before performance regression gating.
- M3 depends on M0 contracts and time semantics.
- M4 depends on M0 and supports M2/M7 gates.
- M5 informs M8 compute integration.

## Completion criteria (roadmap-level)
- All milestones marked complete with DoD satisfied.
- Contract versioning and compatibility rules are enforced.
- Integration harness and benchmarks run in CI.
- Replay determinism validated with repro bundles.
 - Implementation milestones (M9+) are complete and validated.
