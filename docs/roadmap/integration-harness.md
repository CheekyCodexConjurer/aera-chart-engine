# Integration Harness (Host Fake / Playground)

This spec defines a minimal host harness that exercises the engine without coupling to quant-lab.

## Goals
- Provide a deterministic, repeatable environment for pan/zoom/replay/overlay flows.
- Exercise windowing, LOD, replay cutoff, and overlay layout paths.
- Support automated smoke tests and benchmark drivers.

## Harness layout (planned)
- Primary location: `tools/harness/`.
- Modules: `scenarios/`, `datasets/`, `ui/`, `headless/`, `reports/`.
- No coupling to host UI frameworks; keep DOM minimal and engine-focused.

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

## Scenario ids (shared with benchmarks)
- `baseline-10k`, `baseline-100k`, `baseline-1m`
- `gaps-sessions`
- `burst-append`
- `streaming-50hz`
- `overlay-storm`
- `replay-scrub`

## Entrypoints (planned)
- `npm run harness:dev` (interactive harness).
- `npm run harness:smoke` (headless smoke flow).
- `npm run harness:bench` (benchmark runner).

## Automation hooks
- Headless mode for automated smoke/benchmark runs.
- Scriptable scenario runner with seedable datasets.
- Deterministic snapshot capture for replay harness.

## Smoke test flow (headless)
- Load `baseline-10k` and assert visible range + data window events.
- Pan/zoom within render window; ensure no diagnostics.
- Toggle overlays (`overlay-storm` subset) and verify layout events.
- Enable replay, scrub cutoff, and assert clamp behavior.
- Exit with a non-zero code on any failed assertion.

## Non-goals
- No host UI components or menus beyond basic controls.
- No indicator execution; use precomputed overlay payloads.

## References
- `performance-gates.md`
- `determinism-replay.md`
- `../streaming-update-contract.md`
