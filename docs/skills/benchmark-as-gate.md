# Benchmark-as-Gate

## Why it matters
- Quant workflows require deterministic performance.
- Regressions must be caught before merge.

## What good looks like
- Benchmarks are mandatory for hot path changes.
- Evidence includes trace IDs and histograms.
- Regression thresholds are enforced.

## Scope boundaries
- Includes pan and zoom, replay scrub, indicator toggle, timeframe switch.
- Includes dataset specs and reproducible configs.
- Excludes synthetic microbenchmarks as the only evidence.

## Evidence and artifacts
- p50 and p95 metrics for each required scenario.
- Trace capture files or IDs.
- Dataset specification used for benchmarks.

## Review questions
- Are required scenarios included in the benchmark set?
- Are deltas reported with consistent methodology?
- Does evidence include both latency and memory metrics?

## Common failure modes
- Merging without benchmark deltas.
- Using microbenchmarks only.
- Ignoring memory regressions.
