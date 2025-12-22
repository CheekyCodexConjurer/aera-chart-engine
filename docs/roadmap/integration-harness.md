# Integration Harness (Host Fake / Playground)

This spec defines a minimal host harness that exercises the engine without coupling to quant-lab.

## Goals
- Provide a deterministic, repeatable environment for pan/zoom/replay/overlay flows.
- Exercise windowing, LOD, replay cutoff, and overlay layout paths.
- Support automated smoke tests and benchmark drivers.

## Required features
- Pan, zoom, and reset controls (pointer + keyboard).
- Replay controls: off, arming, paused, playing with cutoff advance.
- Overlay toggles for line, zone, marker, label, table, right-label.
- Multi-pane layout with independent Y scales.

## Dataset scenarios
- Baseline: 10k, 100k, 1M bars with 500-2k visible.
- Pathological: gaps, out-of-order attempts, bursty updates.
- Streaming: last-candle updates at 1-50 Hz.
- Overlay-heavy: markers/labels near limits.

## Automation hooks
- Headless mode for automated smoke/benchmark runs.
- Scriptable scenario runner with seedable datasets.
- Deterministic snapshot capture for replay harness.

## References
- `performance-gates.md`
- `determinism-replay.md`
- `../streaming-update-contract.md`
