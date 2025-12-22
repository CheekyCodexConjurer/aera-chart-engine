# Legacy Workstreams (Preserved)

This file preserves the original roadmap phases and workstreams for reference. It remains authoritative unless superseded by executable milestones in `ROADMAP.md`.

## M8 acceptance mapping (doc-only)
Use this mapping to validate T8.x completion in `ROADMAP.md`.

**T8.1 Rendering pipeline completion**
- Evidence: benchmark report for `baseline-1m` meets p50/p95 targets.
- Evidence: baseline benchmark reports are stored under `tools/bench/reports/`.
- Evidence: GPU memory budgeting and eviction policy documented.
- Evidence: diagnostics for context loss and buffer rebuilds are implemented.

**T8.2 Axes and multi-scale completion**
- Evidence: tick collision + gutter stability tests pass (`tests/axis-layout.mjs`).
- Evidence: multi-pane + multi-scale invariants documented and enforced (`docs/data-model.md`, `docs/public-api-contract.md`).
- Evidence: coordinate conversion contract validated (`tests/coordinate-contract.mjs`).

**T8.3 Data pipeline and LOD completion**
- Evidence: LOD determinism + hysteresis tests pass (`tests/data-pipeline.mjs`).
- Evidence: window request/response contract tests pass (`tests/data-pipeline.mjs`).
- Evidence: append/prepend/patch behaviors verified under load (`tests/data-pipeline.mjs`).

**T8.4 Interaction and hit-testing completion**
- Evidence: interaction SLOs met for pan/zoom/crosshair/replay scrub (`tools/bench/interaction-latency.mjs`).
- Evidence: hit-testing stable under replay and gaps (`tests/interaction-hit-testing.mjs`).
- Evidence: input priority rules verified via perf traces (`tools/bench/reports/interaction-latency.json`).

**T8.5 Compute and indicator integration completion**
- Evidence: worker cancellation and backpressure tests pass (`tests/compute-pipeline.mjs`).
- Evidence: stale result dropping verified via versioned outputs (`tests/compute-pipeline.mjs`).
- Evidence: indicator output caps enforced with diagnostics (`tests/overlay-caps.mjs`).

**T8.6 Observability and regression gate completion**
- Evidence: repro bundle capture/replay works (`tests/repro-bundle.mjs`).
- Evidence: benchmark gates running in CI with thresholds enforced (`tools/bench/check-baseline.mjs`, `package.json`).
- Evidence: diagnostics taxonomy implemented and surfaced (`docs/diagnostics-failure-surfaces.md`).

## Legacy phases

### Phase 1: GPU core and scene integrity
**Objective**
- Move from functional rendering to production-grade GPU pipeline.

**Deliverables**
- Persistent GPU buffers, index buffers, and per-layer batching.
- Instancing for candles, markers, and repeated primitives.
- Line rendering with stable thickness, joins, and optional dashes.
- Clip stacks for panes and overlays with deterministic order.
- Texture atlas for text (SDF/MSDF) and GPU text rendering.

**Exit criteria**
- Measured frame times meet targets on 1M series with 2k visible.
- No full buffer rebuild on pan/zoom steady state.

### Phase 2: Axes, layout, and multi-scale
**Objective**
- Multi-pane, multi-scale layout with stable gutters and labels.

**Deliverables**
- Axis model for left/right scales and scale-specific gutters.
- Tick generation with collision avoidance and consistent formatting.
- Session-aware time axis (UTC rules defined in docs).
- Pane layout constraints, padding, and overlay clipping per pane.

**Exit criteria**
- Multiple panes and scales render without label overlap or jitter.
- Time axis ticks are stable across zoom/pan.

### Phase 3: Data pipeline and LOD
**Objective**
- Deterministic windowing and LOD with cache and hysteresis.

**Deliverables**
- Window selection handshake with prefetch and backpressure.
- LOD cache per series with hysteresis (no flicker at boundaries).
- Append/prepend/patch semantics that preserve view anchor.
- Gap/session handling and irregular timestamps policy enforced.

**Exit criteria**
- No view jumps on prepend/append.
- LOD transitions are stable and deterministic.

### Phase 4: Interaction and hit-testing
**Objective**
- Complete interaction model with stable hit-testing.

**Deliverables**
- Pointer capture, wheel/pinch zoom, keyboard pan/zoom/reset.
- Crosshair sync across panes and snapping policy options.
- Hit-testing for series and overlays with ranked results.
- Drawings and selection tools (host-driven state).

**Exit criteria**
- Input latency meets SLOs (p50/p95).
- Hit-testing is deterministic under replay and gaps.

### Phase 5: Compute and indicator integration
**Objective**
- Robust compute pipeline for heavy indicators.

**Deliverables**
- Worker/WASM compute pipeline with cancellation and backpressure.
- Versioned output with incremental overlay diffs.
- Data handoff contracts for typed arrays and buffer pooling.

**Exit criteria**
- Indicator toggles do not block interaction.
- Stale results are deterministically dropped.

### Phase 6: Observability and regression gates
**Objective**
- Production-grade diagnostics, benchmarks, and reproducibility.

**Deliverables**
- Error taxonomy with severity and recoverability.
- Repro bundle format (inputs + view state + engine version).
- Benchmarks for pan/zoom, replay scrub, toggles, and switches.
- CI gate: no-merge on performance regression.

**Exit criteria**
- Benchmark suite runs in CI with reproducible datasets.
- Diagnostics are user-visible and structured.

## Workstreams (legacy backlog)

### Rendering pipeline
- GPU batching by layer (grid, series, overlays, UI).
- Persistent VBO/IBO with region updates, no per-frame reallocs.
- Instanced candles, markers, and histogram bars.
- Line joins/caps, optional dash patterns, and miter limits.
- Text atlas (SDF/MSDF) and glyph cache; fallback policy.
- Z-order enforcement by pane, layer, zIndex.
- Clip masks for pane and replay cutoff.
- GPU memory budgeting and eviction policy for caches.
- WebGL2 context loss/recovery with deterministic resource rebuild.

### Axes, grid, and labels
- Dual-axis (left/right) support per pane.
- Scale identity map per pane (`scaleId` -> axis config).
- Right gutter width computed from label extents.
- Tick density and collision avoidance per axis.
- Time axis formatting for session/market hours.
- Grid line styling and theme integration.

### Data pipeline
- Window contract with host (request more history, prefetch margin).
- LOD selection by pixel density with hysteresis.
- Cache for LOD results (tiered, capped, evictable).
- Stable append/prepend/patch with view anchor retention.
- Rebuild rules for schema and scale changes.
- Strict validation for ordering, duplicates, and NaN/Infinity.

### Interaction and UX
- Pointer capture for drag and zoom.
- Gesture support (wheel, trackpad, pinch).
- Keyboard navigation and focus states.
- Selection and drawing primitives (engine renders, host owns state).
- Crosshair sync across panes by time domain.
- Replay-aware hit-testing and snapping rules.

### Overlays and primitives
- Overlay styles (line width, dash, fill, opacity, label style).
- Overlay clipping to pane and replay cutoff.
- Overlay hit-testing for all primitives.
- Diagnostics for unsupported or invalid overlays.

### Compute and workers
- Worker pool with priority and cancellation.
- TypedArray sharing or transfer strategy.
- WASM integration guidelines and memory budgets.
- Deterministic versioning for indicator outputs.
- OffscreenCanvas/worker render loop option with parity to main-thread renderer.

### API and contracts
- Stable public API versioning and deprecations.
- Theme contract with precedence and partial updates.
- Host overlay coordinate conversion events (no polling).
- Replay contract enforced in runtime (cutoff/preview/clamp).
- Release packaging targets (ESM/CJS) with migration notes and compatibility rules.

### Observability and QA
- Perf counters (frame time, input latency, buffer churn).
- Deterministic logging and trace ID propagation.
- Repro bundle export/import utilities with automated capture hooks.
- Unit tests for LOD, windowing, replay clipping, and hit-testing.
- Benchmark harness with dataset generator and artifacted traces.
- Visual regression harness (golden frames + diff tolerance).

### Integration with quant-lab
- Adapter mapping for Plot API -> engine primitives.
- Contract diff process when quant-lab changes.
- Validation of replay semantics and overlay pipeline.

### PineScript compatibility (host-owned execution)
- Map PineScript drawings to engine primitives (line, box, label, polyline, table, fills).
- Enforce PineScript limits/budgets in the adapter layer with engine diagnostics.
- Ensure parity against `docs/pinescript/coverage/INDEX.md` for visual outputs.
- Define versioned compatibility targets and regression tests for parity.

## Dependencies and blockers (legacy)
- Text atlas decision (SDF vs MSDF) is required before Phase 1 completion.
- Time domain and session handling must be finalized before axis work.
- Worker and WASM strategy must be chosen before compute pipeline.

## Definition of done checklist (legacy)
- All phases exit criteria satisfied.
- Docs updated for any behavioral change (API + performance + semantics).
- Benchmarks and regression gates enforced in CI.
- No untracked fallbacks or undocumented behavior.
