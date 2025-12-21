# Skills

This file defines the skills required to build and maintain the charting engine. Each skill must be demonstrated in design reviews, PRs, and benchmarks.

## General evaluation rubric
**Expected evidence**
- Design notes for cross-layer changes.
- Benchmark deltas for any hot path changes.
- Reproduction steps and inputs for bug fixes.

**Non-negotiables**
- No main-thread blocking during interaction.
- No silent fallbacks or hidden behavior changes.
- No unbounded growth in memory or GPU resources.

**Review etiquette**
- State assumptions and dataset characteristics.
- Document explicit tradeoffs and rejected alternatives.
- Update docs and tests when contracts change.

## Self-check before review
- Can you explain the change in one paragraph with clear impact?
- Are performance, memory, and interaction budgets unchanged or improved?
- Are diagnostics updated to observe the new behavior?
- Are failure modes explicit and user-visible?
- Are tests or benchmarks updated where relevant?

## WebGL2 and GPU rendering
**Why it matters**
- The renderer is WebGL2-first and is the primary performance boundary.
- GPU pipelines define frame cost, latency, and memory use.
- Visual correctness depends on stable GPU state and precision control.

**What good looks like**
- Clear knowledge of shaders, buffers, textures, and render passes.
- Ability to batch and instance without visual regressions.
- Explicit handling of GPU resource lifetimes and loss recovery.
- Understands precision tradeoffs for large coordinate ranges.
- Knows WebGL2 limits and extension behavior on Chromium.

**Scope boundaries**
- Includes shader authoring, buffer layout, batching, and GPU lifetimes.
- Includes precision management for large coordinate ranges.
- Excludes UI theming or DOM layout concerns.
- Includes context loss and recovery handling.

**Evidence and artifacts**
- GPU frame capture with draw call counts and state changes.
- Shader and buffer layout notes tied to render passes.
- GPU memory budget report for typical datasets.
- Shader precision notes for large coordinate ranges.

**Review questions**
- Does the change reduce draw calls or state changes?
- Are GPU resources bounded and released deterministically?
- Is output stable across devicePixelRatio changes?
- Are shader variants minimized and cached?

**Common failure modes**
- Excessive draw calls or state changes per frame.
- Unbounded texture growth or leaking buffers.
- Implicit fallback to Canvas2D without visibility.

## Performance profiling and optimization
**Why it matters**
- The engine must be deterministic with tight frame budgets.
- Hot paths must be measurable and enforceable.
- Optimization requires shared baselines and stable benchmarks.

**What good looks like**
- Uses CPU and GPU profilers to identify bottlenecks.
- Establishes stable benchmarks and tracks regressions.
- Optimizes based on evidence, not intuition.
- Documents tradeoffs and expected deltas per change.
- Builds profiling tools that are cheap to run.

**Scope boundaries**
- Includes CPU, GPU, and input latency profiling.
- Includes benchmark design and regression gating.
- Excludes speculative optimization without measurement.
- Includes budget tracking for interaction and idle modes.

**Evidence and artifacts**
- Benchmark runs with before and after deltas.
- Flamegraphs or traces for at least one hot path.
- Summary of budget impact and mitigation plan.
- Raw profiling data or trace IDs for auditability.

**Review questions**
- Is there a baseline and a measured delta?
- Are improvements stable across dataset sizes and devices?
- Does the change shift GC or memory behavior?
- Are regressions detected before merge?

**Common failure modes**
- Micro-optimizations that hide major architectural issues.
- Missing baseline metrics, leading to silent regressions.
- Fixes that improve one scenario while harming interaction latency.

## TypedArray and memory management
**Why it matters**
- Large datasets require predictable memory use.
- GC pauses are unacceptable during interaction.
- Data copying can dominate cost if not controlled.

**What good looks like**
- Uses TypedArray pooling and explicit ownership rules.
- Avoids per-frame allocations and object churn.
- Enforces hard caps for caches and buffers.
- Uses transfer or shared buffers for cross-thread data.
- Documents buffer alignment and stride assumptions.

**Scope boundaries**
- Includes buffer pooling, ownership rules, and transfer semantics.
- Includes cache caps and eviction behavior.
- Excludes UI-level caching unrelated to data rendering.
- Includes SharedArrayBuffer safety and synchronization rules.

**Evidence and artifacts**
- Allocation profiles during pan and zoom.
- Buffer pool size reports and reuse rates.
- Copy count analysis for data ingestion and compute.
- Memory cap configuration and enforcement proof.

**Review questions**
- Are allocations eliminated from hot paths?
- Are array copies necessary and documented?
- Are buffer lifetimes explicit and enforced?
- Are pools bounded and measured?

**Common failure modes**
- Hidden allocations in hot paths.
- Unbounded caches or buffer growth.
- Accidental copies of large arrays.

## Data visualization fundamentals
**Why it matters**
- The engine must communicate data accurately under zoom and pan.
- Visual artifacts directly impact analysis quality.
- Users need consistent axis semantics across panes.

**What good looks like**
- Correct axis scaling and transformations.
- Stable rendering across LOD transitions.
- Accurate hit-testing and labeling.
- Clear handling of gaps, outliers, and missing data.
- Maintains perceptual integrity across zoom levels.

**Scope boundaries**
- Includes axis scale math, tick generation, and labeling.
- Includes hit-testing accuracy and LOD transitions.
- Excludes purely aesthetic styling decisions.
- Includes overlap handling and label culling rules.

**Evidence and artifacts**
- Visual test cases across extreme zoom levels.
- Hit-test accuracy report with edge cases.
- Axis labeling examples for log and linear scales.
- LOD transition captures with expected vs actual.

**Review questions**
- Are axis transforms correct for log and linear scales?
- Are labels stable across pan and zoom?
- Are LOD transitions visually consistent?
- Does decimation preserve extrema and inflection points?

**Common failure modes**
- Misaligned axes or labels during resize.
- LOD artifacts that shift or distort data.
- Inconsistent cursor or crosshair behavior.

## Quant and trading data characteristics
**Why it matters**
- Financial data has gaps, bursts, and irregular intervals.
- Indicators can be expensive and require stable windows.
- Multi-timeframe analysis requires explicit alignment rules.

**What good looks like**
- Handles irregular timestamps and missing data explicitly.
- Supports multi-timeframe overlays without ambiguity.
- Maintains stable window semantics for indicators.
- Preserves precision for large time ranges.
- Defines explicit session and holiday handling rules.

**Scope boundaries**
- Includes irregular time series and session gaps.
- Includes multi-timeframe alignment and mapping rules.
- Excludes data sourcing or ingestion pipelines.
- Includes corporate action adjustments when required.

**Evidence and artifacts**
- Test dataset with gaps and irregular intervals.
- Multi-timeframe overlay validation with expected outcomes.
- Indicator window contract documentation.
- Session boundary rendering examples.

**Review questions**
- Are gaps explicit and preserved in rendering?
- Are timebase mappings documented and stable?
- Is precision preserved for long-range data?
- Are session boundaries rendered consistently?

**Common failure modes**
- Assuming uniform intervals or continuous data.
- Mixing timebases without explicit mapping.
- Over-smoothing or hiding missing data.

## Multithreading in the browser (Workers, OffscreenCanvas)
**Why it matters**
- The main thread must never block during interaction.
- Compute and rendering must be isolated and predictable.
- Worker boundaries define latency and determinism.

**What good looks like**
- Uses Workers for indicators and heavy transforms.
- Uses OffscreenCanvas where it improves isolation and throughput.
- Defines stable, versioned data handoff contracts.
- Cancels stale work and enforces backpressure.
- Keeps worker scheduling deterministic under load.

**Scope boundaries**
- Includes Worker protocols, OffscreenCanvas usage, and cancellation.
- Includes data transfer and shared buffer patterns.
- Excludes server-side compute or remote execution.
- Includes scheduling fairness across panes and indicators.

**Evidence and artifacts**
- Worker timing traces with queue depth metrics.
- Data handoff format specification and versioning notes.
- Demonstrated main-thread responsiveness under load.
- Cancellation and backpressure test outputs.

**Review questions**
- Does any path block the main thread during interaction?
- Are data transfers zero-copy where possible?
- Is ordering deterministic under rapid updates?
- Is stale work cancelled without leaks?

**Common failure modes**
- Blocking on Worker results in the render loop.
- Excessive structured cloning or data copies.
- Worker and main thread drift leading to stale results.

## API design for long-lived libraries
**Why it matters**
- Users must trust API stability for long-term research tools.
- Breaking changes are expensive in quant environments.
- API design impacts performance and debuggability.

**What good looks like**
- Clear, minimal surface area with explicit lifecycles.
- Backward-compatible evolution and deprecation plans.
- Stable defaults and explicit opt-in for behavior changes.
- Clear separation between declarative and imperative APIs.
- Ensures error handling is explicit and user-visible.

**Scope boundaries**
- Includes lifecycle management and versioning strategy.
- Includes error handling and configuration defaults.
- Excludes application-specific UI concerns.
- Includes adapter-specific constraints and escape hatches.

**Evidence and artifacts**
- Public API surface review with lifecycle diagrams.
- Deprecation plan templates and example migrations.
- API usage samples that show stable defaults.
- API compatibility test results across versions.

**Review questions**
- Is there a clear migration path for changes?
- Are defaults explicit and stable?
- Are imperative and declarative boundaries respected?
- Are error modes documented and testable?

**Common failure modes**
- Leaky abstractions that expose internal state.
- Implicit behavior changes in minor versions.
- Config explosion without clear boundaries.

## Debuggability and observability
**Why it matters**
- All behavior must be observable and debuggable.
- Performance and correctness are tied to clear diagnostics.
- Deterministic replay requires structured state capture.

**What good looks like**
- Built-in counters, traces, and debug overlays.
- Deterministic reproduction using logs and versioned inputs.
- Clear error modes and actionable diagnostics.
- Metrics are exposed without impacting render performance.
- Debug tools are opt-in and well scoped.

**Scope boundaries**
- Includes metrics, tracing, logging, and debug overlays.
- Includes state capture and deterministic replay tooling.
- Excludes external telemetry by default.
- Includes debug gating to avoid hot path overhead.

**Evidence and artifacts**
- Debug overlay screenshots with explained metrics.
- Structured log examples tied to a reproduction case.
- Trace capture and replay instructions.
- Error taxonomy with severity and remediation.

**Review questions**
- Can issues be reproduced with captured inputs?
- Are logs structured and versioned?
- Do diagnostics avoid impacting frame budgets?
- Are debug overlays non-invasive and deterministic?

**Common failure modes**
- Hidden fallbacks that mask issues.
- Non-reproducible bugs due to missing state capture.
- Silent errors that degrade output quality.

## Deterministic UI interactions
**Why it matters**
- Quant users rely on precise and repeatable interactions.
- Jitter or ambiguity undermines trust in analysis.
- State consistency is required for analysis workflows.

**What good looks like**
- Explicit interaction state machine with logged transitions.
- Predictable pan, zoom, and selection behaviors.
- Full hover, active, focus, and disabled states.
- Keyboard interaction matches pointer behavior.
- Provides explicit cancellation and escape paths.

**Scope boundaries**
- Includes pointer, wheel, and keyboard normalization.
- Includes focus management and accessibility hooks.
- Excludes custom gestures outside the spec.
- Includes consistent behavior across multiple panes.

**Evidence and artifacts**
- Interaction state transition table and event mapping.
- Input latency measurements under load.
- Accessibility checklist for interaction modes.
- Video capture showing deterministic interaction under stress.

**Review questions**
- Are state transitions explicit and testable?
- Is pointer capture safe and reversible?
- Does keyboard behavior mirror pointer actions?
- Are interactions deterministic under rapid input?

**Common failure modes**
- Interaction side effects tied to pointer-move noise.
- Inconsistent states across panes or series.
- Non-deterministic behavior under rapid input.
