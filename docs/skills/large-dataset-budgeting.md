# Large Dataset Budgeting

## Why it matters
- Large datasets dominate CPU and GPU memory.
- Without explicit budgeting, performance becomes non-deterministic.

## What good looks like
- Memory math per series type is documented.
- Cache caps and eviction rules are explicit and enforced.
- Large dataset behavior is benchmarked and monitored.

## Scope boundaries
- Includes CPU and GPU memory accounting.
- Includes cache caps, pools, and eviction policy.
- Excludes host-side storage and persistence details.

## Evidence and artifacts
- Memory footprint tables for 10k, 100k, 1M points.
- Cache cap configuration and enforcement proof.
- Large dataset benchmark runs with memory deltas.

## Review questions
- Are memory budgets explicit and enforced?
- Is memory math documented for each series type?
- Are cache caps tested under load?

## Common failure modes
- Unbounded buffers or caches under stress.
- Missing memory math for new primitives.
- Undocumented increases in per-point memory cost.
