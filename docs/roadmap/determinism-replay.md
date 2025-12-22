# Determinism and Replay

This spec defines deterministic update invariants and replay harness expectations.

## Determinism invariants
- Updates are idempotent: same input yields same output.
- Ordering is strict: no out-of-order inserts in incremental updates.
- LOD selection is deterministic for a given range and pixel density.
- Data window and render window rules are explicit and observable.
- Inputs are normalized to the canonical time domain before ingestion.
- Non-increasing snapshot versions are rejected with diagnostics.

## Update ordering rules (contract)
- Updates are processed FIFO per series and overlay.
- Overlapping updates within the same tick are rejected as nondeterministic.
- Replace invalidates any queued incremental updates for the same series id.

**Examples**
- Valid: snapshot v10 -> append [t=105..110] -> patch [t=110] -> overlay update.
- Invalid: append [t=105..110] and prepend [t=100..108] in the same tick.

## Replay invariants
- Global cutoff applies to candles and all overlays without exception.
- Navigation cannot move beyond cutoff + padding.
- Hit-testing respects cutoff and gaps.

## Replay harness inputs
- Scenario dataset manifest and overlay payloads (seeded, deterministic).
- `replayTrace`: ordered list of `{ state, cutoffTimeMs, previewTimeMs?, anchorTimeMs?, command? }`.
- Initial visible range and pane layout.

## Deterministic output hash (replay harness)
- Hash a canonical JSON state digest per replay step.
- Canonicalization rules:
  - Stable ordering by id (series, overlays, panes).
  - Quantize floats to 1e-4 before hashing.
  - Exclude GPU raster output and timing-only counters.
- Required digest fields:
  - `visibleRange`, `renderWindow`, `cutoffTimeMs`, `previewTimeMs`.
  - Counts: visible points per series and overlay.
  - First/last visible times per series and overlay.
- Use SHA-256 for hashing.

## Replay harness expectations
- Identical inputs produce identical hash sequences.
- Harness captures inputs, view state, engine version, and contract version.
- Harness validates crosshair/time mapping at cutoff edges.

## References
- `../replay-semantics.md`
- `../data-time-semantics.md`
- `../data-rendering-pipeline-contract.md`
- `../data-model.md`
- `integration-harness.md`
