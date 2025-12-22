# Host Overlay Interop

## Why it matters
- Host overlays rely on precise coordinate conversion.
- Poor contracts cause jitter and layout drift.

## What good looks like
- Coordinate conversion semantics are explicit.
- Update triggers are event-driven, not polling.
- Offscreen behavior is deterministic and documented.

## Scope boundaries
- Includes time to x and price to y conversions.
- Includes layout and gutter metrics for masking.
- Excludes host UI layout or DOM rendering logic.

## Evidence and artifacts
- Coordinate conversion contract examples.
- Event-driven update triggers documented.
- Offscreen conversion rules specified.

## Review questions
- Are conversions stable under pan and zoom?
- Are host overlays updated without per-frame polling?
- Are gutter and plot area metrics available?

## Common failure modes
- Polling in rAF as the default integration path.
- Offscreen conversions that return inconsistent values.
- Missing gutter metrics for host masking.
