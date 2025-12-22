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

### M8 — Core engine completion (mapped from legacy phases)
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
