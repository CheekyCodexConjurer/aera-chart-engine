# Agents

This file defines specialized agent roles, ownership boundaries, and review requirements. Each agent is accountable for correctness, performance, and observability in their domain.

## Shared rules
- Every change must have a clear owning agent.
- Cross-cutting changes require explicit coordination before implementation.
- Performance budgets are owned jointly by Architecture and the relevant domain agent.
- No agent may introduce silent fallbacks or hidden behavior changes.

## Cross-agent approval triggers
- Changes to frame scheduling or render lifecycle.
- Changes to data window semantics or buffer formats.
- New interaction modes or accessibility behavior changes.
- New compute execution modes or worker boundaries.
- Public API changes or lifecycle changes.

## Review process
- Changes that affect budgets require before and after metrics.
- Contract changes require updates to the owning doc and a migration note.
- Interaction changes require explicit state machine updates.
- Rendering changes require GPU profiling evidence.

## Handoff and escalation
- If a change touches two layers, write a short design note first.
- Escalate conflicts to the Architecture Agent for resolution.
- Use explicit version bumps for cross-layer contracts.

## Coordination matrix
| Change type | Required agents |
| --- | --- |
| Render graph or shader changes | Architecture, Rendering |
| Data window or LOD contract changes | Architecture, Data Pipeline |
| Interaction state machine changes | Architecture, Interaction |
| Worker protocol or compute changes | Architecture, Compute |
| Public API or lifecycle changes | Architecture, Integration |
| Crosshair or hit-testing changes | Rendering, Interaction, Data Pipeline |

## Definition of done
- Performance budgets are respected and measured.
- Contracts and docs are updated with version notes.
- Diagnostics are updated for new behavior.
- Interaction states remain complete and deterministic.

## Cadence and audits
- Monthly performance budget review.
- Quarterly API stability review.
- Release checkpoints for deprecations and removals.
- Postmortems required for regressions in core budgets.

## Architecture Agent
**Responsibilities**
- Owns `architecture.md` and system-wide invariants.
- Reviews all cross-cutting changes across layers.
- Defines and enforces performance budgets and invariants.
- Maintains cross-layer interface contracts and versioning.

**Primary artifacts**
- `architecture.md` and system diagrams.
- Performance budgets and benchmark baselines.
- Cross-layer contract specs and migration notes.

**Interfaces owned**
- Frame scheduling invariants and lifecycle contracts.
- Layer boundaries and data ownership rules.

**Metrics and diagnostics**
- Frame budget compliance summaries.
- Cross-layer regression reports.

**Review checklist**
- System invariants remain valid and documented.
- Performance budgets are updated or explicitly unchanged.
- Cross-layer contracts include version updates when needed.

**Escalation cues**
- Any ambiguity in ownership or interface boundaries.
- Any proposal that changes core invariants or budgets.

**Can change alone**
- Documentation updates to `architecture.md`.
- Internal naming conventions and system diagrams.
- Non-behavioral refactors limited to architecture docs.

**Example changes**
- Clarify layer boundaries or add diagrams.
- Update performance targets with measured evidence.

**Requires cross-agent approval**
- Any changes that affect rendering, data, compute, or interaction contracts.
- Adjustments to performance targets or invariants.
- New public API surface or lifecycle changes.

**Failure patterns to avoid**
- Allowing ambiguous ownership or overlapping responsibilities.
- Approving changes without measurable performance impact analysis.
- Tolerating magic behavior or implicit fallbacks.

## Rendering Agent
**Responsibilities**
- Owns the WebGL2 pipeline, shaders, buffers, and draw calls.
- Measures GPU performance and manages GPU memory usage.
- Ensures visual correctness under LOD changes and interaction.
- Defines render pass ordering and GPU resource lifetime rules.

**Primary artifacts**
- Shader library and render graph specification.
- GPU buffer layout and instancing contracts.
- GPU memory budget tables.

**Interfaces owned**
- Render pass ordering and render graph inputs.
- Shader attribute layouts and uniform blocks.

**Metrics and diagnostics**
- Draw call counts and state change totals.
- GPU time per pass and texture memory usage.

**Review checklist**
- GPU time deltas are measured and recorded.
- Draw call and state change counts stay within budgets.
- Visual output is stable across zoom and devicePixelRatio.

**Escalation cues**
- Changes to data buffer formats or attribute layouts.
- Any change that impacts axis labels or overlays.

**Can change alone**
- Shader implementations that do not alter public contracts.
- Internal batching or instancing strategies within existing passes.
- GPU resource pooling policies within the renderer.

**Example changes**
- Reorder render pass internals for fewer state changes.
- Adjust buffer pooling sizes within the budget.

**Requires cross-agent approval**
- Changes that affect render outputs or visual semantics.
- New passes or render graph structure.
- Changes that affect data contracts or interaction overlays.

**Failure patterns to avoid**
- Unbounded GPU memory growth or leak risk.
- Increasing draw calls without profiling justification.
- Silent switches to lower quality rendering.

## Data Pipeline Agent
**Responsibilities**
- Owns data windowing, LOD, caching, and data contracts.
- Prevents over-rendering and unnecessary data transfer.
- Ensures scalability for large datasets and multi-timeframe views.
- Defines data window and LOD selection rules.

**Primary artifacts**
- Data window and prefetch specifications.
- LOD and decimation policy documentation.
- Cache caps, eviction rules, and diagnostics.

**Interfaces owned**
- Data window selection and prefetch contract.
- LOD metadata schema and decimation guarantees.

**Metrics and diagnostics**
- Cache hit rates, eviction counts, and memory usage.
- Data window size vs visible domain ratios.

**Review checklist**
- LOD fidelity remains stable across transitions.
- Cache caps and eviction rules are enforced.
- Data window semantics are unchanged or documented.

**Escalation cues**
- Any change that alters indicator input windows.
- Any change that affects axis mapping or scaling.

**Can change alone**
- Cache eviction policies within defined memory caps.
- LOD heuristics that do not alter visible data semantics.
- Internal data structure optimization with stable output.

**Example changes**
- Tune LRU weights for better cache hit rates.
- Optimize index structures without changing outputs.

**Requires cross-agent approval**
- Changes to data window semantics or data contracts.
- New decimation algorithms that alter visible fidelity.
- Changes that impact compute or rendering assumptions.

**Failure patterns to avoid**
- Implicit data fetch or expansion outside configured window.
- LOD artifacts that change visual meaning.
- Cache policies that cause unbounded memory use.

## Interaction Agent
**Responsibilities**
- Owns pan, zoom, crosshair, selection, and interaction state machine.
- Guarantees zero-jitter UX and consistent state transitions.
- Enforces full interaction states and pointer safety.
- Defines input normalization and event routing rules.

**Primary artifacts**
- Interaction state machine spec and event maps.
- Interaction test cases and latency targets.
- Accessibility behavior checklists.

**Interfaces owned**
- Input normalization rules and state transitions.
- Interaction overlay contract and cursor data format.

**Metrics and diagnostics**
- Input latency percentiles for pan, zoom, and hover.
- State transition counts and unexpected transition logs.

**Review checklist**
- State transitions are explicit and tested.
- Hover, active, focus, and disabled states are preserved.
- Keyboard behavior matches pointer behavior.

**Escalation cues**
- Any change that modifies hit-testing semantics.
- Any change that touches crosshair data contracts.

**Can change alone**
- Internal state machine refactors with no behavior change.
- Input normalization that preserves existing semantics.
- UX copy or debug overlays for interaction diagnostics.

**Example changes**
- Refine pointer normalization for consistent deltas.
- Add debug overlay for interaction latency.

**Requires cross-agent approval**
- New interaction modes or gestures.
- Changes that affect render overlays or data hit-testing contracts.
- Any modification to keyboard accessibility behavior.

**Failure patterns to avoid**
- State transitions that are ambiguous or non-deterministic.
- Pointer capture or release bugs under rapid input.
- Interaction behaviors that depend on device-specific quirks.

## Compute Agent
**Responsibilities**
- Owns indicator execution and compute isolation.
- Manages Worker and WASM boundaries and data contracts.
- Ensures main-thread isolation and predictable latency.
- Defines compute scheduling and cancellation rules.

**Primary artifacts**
- Worker protocol and buffer ownership contracts.
- Indicator execution registry and versioning notes.
- Compute benchmark baselines.

**Interfaces owned**
- Worker message schemas and data buffer formats.
- Indicator input and output metadata contracts.

**Metrics and diagnostics**
- Worker queue depth and turnaround time.
- Main-thread blocking audits related to compute.

**Review checklist**
- Worker queue limits and backpressure are validated.
- Result ordering and cancellation logic is correct.
- Main thread remains unblocked during interaction.

**Escalation cues**
- Any change to buffer ownership or transfer rules.
- Any change that modifies indicator precision behavior.

**Can change alone**
- Worker scheduling strategies that preserve output semantics.
- Internal compute optimizations with stable results.
- Diagnostics for compute timing and throughput.

**Example changes**
- Adjust worker queue batching for throughput.
- Optimize indicator kernels without changing outputs.

**Requires cross-agent approval**
- Changes to data handoff format or buffer ownership.
- Indicator API changes or new compute modes.
- Any behavior that affects rendering or interaction timing.

**Failure patterns to avoid**
- Blocking main thread waiting for compute.
- Excessive data copying between threads.
- Stale or out-of-order indicator results.

## Integration Agent
**Responsibilities**
- Owns React bindings, public API shape, and lifecycle integration.
- Prevents re-render leaks and ensures stable API contracts.
- Maintains compatibility guarantees and migration paths.
- Defines adapter performance budgets and lifecycle hooks.

**Primary artifacts**
- Adapter API spec and lifecycle diagrams.
- Compatibility tests and migration guides.
- Integration performance benchmarks.

**Interfaces owned**
- Adapter lifecycle hooks and component boundaries.
- Public API surface and event emission contracts.

**Metrics and diagnostics**
- Adapter render counts and frame impact.
- API usage telemetry and deprecation tracking.

**Review checklist**
- Public API changes include migration notes.
- React render counts remain within budget.
- Adapter lifecycle is unchanged or explicitly revised.

**Escalation cues**
- Any change that affects engine initialization order.
- Any change that alters public event semantics.

**Can change alone**
- Internal adapter optimizations that do not alter public APIs.
- Documentation updates for integration patterns.
- Build tooling for adapter-specific tests.

**Example changes**
- Reduce unnecessary React renders in the adapter.
- Add adapter lifecycle tests without API changes.

**Requires cross-agent approval**
- New public API surface or breaking changes.
- Lifecycle changes that affect engine init or teardown.
- Changes that impact performance budgets or interaction timing.

**Failure patterns to avoid**
- Coupling render loop to React re-renders.
- Hidden global state or singleton assumptions.
- Unclear ownership of lifecycle and resource cleanup.
