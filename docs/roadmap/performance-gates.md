# Performance Gates

This spec defines benchmark budgets and regression rules.

## Budgets (initial targets)
- Visible points: 500-2k per pane.
- Loaded points: 10k-1M per series.
- Overlays: 5k markers, 2k labels, 1k zones per pane.
- Frame time: p50 <= 8ms, p95 <= 16ms under load.
- Input latency: p95 <= 16ms for pan/zoom and replay scrub.

## Benchmark scenarios
- Timeframe switch under load (coarse-to-fine LOD).
- Indicator toggle storm (overlay enable/disable).
- Replay scrub with cutoff clamp.
- Last-candle streaming updates.
- Pan/zoom across 1M bars.

## Scenario mapping (harness ids)
- `baseline-1m`: pan/zoom across 1M bars.
- `overlay-storm`: indicator toggle storm.
- `replay-scrub`: replay scrub with cutoff clamp.
- `streaming-50hz`: last-candle streaming updates.
- `baseline-100k`: timeframe switch under load.

## Benchmark harness
- Headless runner with fixed dataset seeds.
- Captures p50/p95 frame time, input latency, memory deltas.
- Produces artifacted JSON summary + trace ids.

## Regression policy
- Any regression beyond 10% p95 requires a fix or explicit waiver.
- Regression waivers must include a mitigation plan and an expiry milestone.

## References
- `../benchmark-regression-policy.md`
- `../responsiveness-slos.md`
- `../performance-contracts.md`
