# Replay and Time-Travel Semantics

This document defines replay behavior in engine terms. The host owns the replay state machine; the engine enforces cutoff and clipping.

## Roles and ownership
- Host owns replay states and transitions.
- Engine enforces cutoff, clipping, and navigation clamps.
- No indicator-specific behavior is permitted.

## Canonical inputs
- `cutoffTimeMs`: the last visible time.
- `previewTimeMs`: optional hover or scrub preview time.
- `anchorTimeMs`: host-selected anchor for replay start.

## Replay states (host inputs)
| State | Host intent | Engine behavior |
| --- | --- | --- |
| off | full history visible | no clipping |
| arming | select anchor | show preview cursor only |
| paused | fixed cutoff | clip all rendering to cutoff |
| playing | moving cutoff | clip and advance cutoff |

## Cutoff semantics (global and absolute)
- Cutoff applies to candles, indicators, overlays, and hit-testing.
- No primitive renders beyond the cutoff without exception.
- A small future padding is allowed for navigation only, max 2 bars.

## Preview semantics
- Preview affects only overlays and cursor feedback.
- Preview never changes the cutoff.
- Preview does not alter hit-testing unless host opts in.

## Navigation clamp
- Panning and zooming cannot move the view window beyond cutoff plus padding.
- Host may request reset around anchor when data windows shift.

## Data window shifts during replay
- If the anchor falls out of the data window, the engine emits a diagnostic.
- The host must provide additional data or reset the viewport.

## Responsibilities summary
**Host**
- Owns playback speed, state transitions, and UI.
- Chooses snapping and replay mode UX.

**Engine**
- Enforces cutoff and clipping.
- Guarantees deterministic rendering under replay.
