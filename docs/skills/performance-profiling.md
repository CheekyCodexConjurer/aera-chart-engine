# Performance Profiling and Optimization

## Why it matters
- The engine must be deterministic with tight frame budgets.
- Hot paths must be measurable and enforceable.
- Optimization requires shared baselines and stable benchmarks.

## What good looks like
- Uses CPU and GPU profilers to identify bottlenecks.
- Establishes stable benchmarks and tracks regressions.
- Optimizes based on evidence, not intuition.
- Documents tradeoffs and expected deltas per change.
- Builds profiling tools that are cheap to run.

## Scope boundaries
- Includes CPU, GPU, and input latency profiling.
- Includes benchmark design and regression gating.
- Excludes speculative optimization without measurement.
- Includes budget tracking for interaction and idle modes.

## Evidence and artifacts
- Benchmark runs with before and after deltas.
- Flamegraphs or traces for at least one hot path.
- Summary of budget impact and mitigation plan.
- Raw profiling data or trace IDs for auditability.

## Review questions
- Is there a baseline and a measured delta?
- Are improvements stable across dataset sizes and devices?
- Does the change shift GC or memory behavior?
- Are regressions detected before merge?

## Common failure modes
- Micro-optimizations that hide major architectural issues.
- Missing baseline metrics, leading to silent regressions.
- Fixes that improve one scenario while harming interaction latency.
