# Overlay and Indicator Rendering Contract

This document defines the overlay primitive contract and the engine's responsibilities for rendering indicator outputs.

## Supported primitive families
| Primitive | Status | Notes |
| --- | --- | --- |
| line | native | polyline with optional step mode |
| hline / segment | native | horizontal or bounded segments |
| zone | native | filled band between two lines |
| marker | native | point markers with fixed size |
| label | native | text labels anchored to data |
| histogram | planned | requires bar batching |
| area | planned | requires fill triangulation |
| table / right-label | host overlay | DOM overlays positioned by API |

## Unsupported primitive policy
- Unsupported primitives are rejected with a typed diagnostic.
- No silent drops and no implicit fallbacks.
- Hosts may render unsupported primitives as DOM overlays.

## Plot API adapter responsibility
- `quant-lab` owns indicator schemas and plot definitions.
- The engine owns primitive rendering and clipping.
- No indicator-specific hardcoding is permitted in the engine.

## Overlay lifecycle
- Add, update, remove, and hide are explicit operations.
- Overlays require stable `overlayId` across updates.
- Partial updates that omit a known overlay remove it unless explicitly retained.

## Error handling and partial updates
- Invalid overlay updates are rejected with diagnostics.
- On rejection, the last known good overlay state remains visible.
- Explicit removals always take precedence over retention.

## Layering and z-order
- Z-order is deterministic and defined per overlay type.
- Overlays render after series geometry unless explicitly configured.
- No overlay is allowed to bypass global cutoff rules.

## Clipping and replay invariants
- Global cutoff applies to all overlays and series without exception.
- Markers, lines, zones, and labels are clipped to view and cutoff.
- Out-of-domain primitives are omitted with diagnostics.

## Multi-pane targeting
- Overlays must declare `paneId` and optional `scaleId`.
- The engine rejects overlays targeting unknown panes or scales.

## References
- `public-api-contract.md` for DOM overlay positioning APIs.
- `replay-semantics.md` for cutoff rules.
