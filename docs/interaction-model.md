# Interaction Model

This document defines the interaction state machine, pointer semantics, and multi-pane behavior.

## State machine (summary)
| State | Description | Pointer capture |
| --- | --- | --- |
| idle | no active interaction | no |
| hover | crosshair and hover overlays | no |
| active-drag | pan or selection | yes |
| active-zoom | wheel or pinch zoom | no |
| selection | active selection overlay | yes |
| disabled | interactions blocked | no |

## Pan and zoom mechanics
- Pan translates view window by pixel delta mapped to time domain.
- Zoom is cursor-anchored unless explicitly locked.
- Inertia is optional and must be explicitly enabled.

## Crosshair and hit-testing
- Crosshair uses nearest visible data in the active pane.
- Hit-testing is deterministic and stable across frames.
- Gaps are respected; no inferred points.

## Pointer semantics (replay aware)
- The engine emits continuous `timeMs` under the cursor.
- The engine also emits `nearestTimeMs` for snapping decisions.
- Snapping to bars is host-owned unless explicitly configured.
- Pointer events are coalesced and run on the main thread.

## Over gaps and between bars
- Continuous time is derived from axis transform.
- Nearest time is `null` when no data is in range.
- Host decides whether to snap or display gaps explicitly.

## Keyboard and accessibility
- Keyboard pan and zoom are supported and consistent with pointer behavior.
- Focus states are visible and deterministic.
- Accessibility hooks expose cursor time and selection state.

## Multi-pane coordination
- Crosshair can be synchronized across panes by time domain.
- Independent Y scales are allowed per pane and per series.
- Time domain is shared unless explicitly configured.

## References
- `public-api-contract.md` for event payloads.
- `replay-semantics.md` for cutoff and preview behavior.
