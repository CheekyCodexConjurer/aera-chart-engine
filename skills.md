# Skills

This file defines the skills required to build and maintain the charting engine. Detailed skill definitions live in `docs/skills/`.

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

## Skill definitions (index)
- `docs/skills/INDEX.md` - canonical list of skill definitions.
- `docs/skills/webgl2-gpu-rendering.md` - WebGL2 and GPU rendering.
- `docs/skills/performance-profiling.md` - performance profiling and optimization.
- `docs/skills/typedarray-memory.md` - TypedArray and memory management.
- `docs/skills/data-visualization-fundamentals.md` - visualization fundamentals.
- `docs/skills/quant-data-characteristics.md` - quant and trading data characteristics.
- `docs/skills/browser-multithreading.md` - workers and OffscreenCanvas.
- `docs/skills/api-design.md` - API design for long-lived libraries.
- `docs/skills/debuggability-observability.md` - diagnostics and observability.
- `docs/skills/deterministic-interactions.md` - deterministic UI interactions.
- `docs/skills/contract-drift-control.md` - contract authoring and drift control.
- `docs/skills/roadmap-governance.md` - roadmap governance and milestone discipline.
- `docs/skills/quant-lab-interop.md` - quant-lab interop skill.
- `docs/skills/replay-semantics-stewardship.md` - replay semantics stewardship.
- `docs/skills/large-dataset-budgeting.md` - large dataset budgeting.
- `docs/skills/host-overlay-interop.md` - host overlay interop.
- `docs/skills/benchmark-as-gate.md` - benchmark-as-gate discipline.
- `docs/skills/do-not-copy-quant-lab.md` - scope separation rules.
- `docs/skills/refactor-llm-friendly.md` - refactor large files into LLM-friendly modules.
