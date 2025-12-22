# Replay Semantics Stewardship

## Why it matters
- Replay correctness is critical for quant analysis workflows.
- Small inconsistencies break trust in results.

## What good looks like
- Global cutoff applies to all rendering and hit-testing.
- Navigation clamp is deterministic and documented.
- Snapping rules are explicit and consistent.

## Scope boundaries
- Includes replay cutoff, preview, and clipping rules.
- Excludes host playback UI and state machine code.

## Evidence and artifacts
- Replay-specific benchmark results.
- Replay semantic contract updates.
- Edge case list for gaps and window shifts.

## Review questions
- Does global cutoff apply to all primitives and hit-tests?
- Are snapping and preview rules explicit?
- Are replay-specific regressions measured?

## Common failure modes
- Indicator-specific replay exceptions.
- Inconsistent cutoff application across overlays.
- Silent changes to snapping or clamp behavior.
