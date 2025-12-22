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

## Scenario matrix (required)
| scenarioId | bars | pattern | focus |
| --- | --- | --- | --- |
| baseline-10k | 10k | no gaps, stable updates | smoke baseline, controls |
| baseline-100k | 100k | no gaps, stable updates | performance baseline |
| baseline-1m | 1m | no gaps, stable updates | LOD and render stress |
| gaps-sessions | 100k | gap segments + session boundaries | gap rendering and cursor semantics |
| burst-append | 100k | append bursts, out-of-order attempts | update ordering and backpressure |
| streaming-50hz | 10k | last-candle updates at 50 Hz | streaming update path |
| overlay-storm | 100k | overlay counts near limits | overlay layout and batching |
| replay-scrub | 100k | cutoff + preview sweeps | replay clamp and determinism |

## Dataset schema (required)
- Canonical input format: JSON manifest + binary payloads.
- Manifest fields:
  - `scenarioId`, `seed`, `timeDomain` (UTC ms), `barCount`, `visibleTarget`.
  - `series`: list of series ids with type and field names.
  - `overlays`: list of overlay batches with stable ids.
- Binary payloads:
  - `timeMs`, `open`, `high`, `low`, `close`, `volume` as TypedArray blobs.
  - Overlay points encoded as compact float arrays.

## Seed and determinism
- Every scenario has a fixed `seed` in the manifest.
- Host harness must be able to regenerate identical datasets from the same seed.
- Dataset generation must be versioned to avoid drift across releases.

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

## Replay harness inputs (required)
- `replayTrace`: ordered list of `{ state, cutoffTimeMs, previewTimeMs?, anchorTimeMs?, command? }`.
- Initial visible range and pane layout for each scenario.
- All inputs reference the canonical time domain (UTC ms).

## Headless runner outputs
- Emits a JSON report per run:
  - `scenarioId`, `seed`, `engineVersion`, `engineContractVersion`.
  - Assertions passed/failed with timestamps.
  - Diagnostics summary and counts by severity.
  - `stateHashes`: ordered list of SHA-256 hashes per replay step (see `determinism-replay.md`).
- Stores artifacts in `tools/harness/reports/` with a stable filename pattern.

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
