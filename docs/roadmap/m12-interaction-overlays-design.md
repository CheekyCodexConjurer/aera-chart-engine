# M12 Interaction + Overlays Design Note

Status: approved
Owner: Interaction Agent (coordination with Architecture)

## Scope
- Deterministic pointer capture and pinch/keyboard zoom input.
- Gap-aware hit-testing aligned with replay cutoff.
- Overlay primitives and host layout events for DOM overlays.
- Event-driven coordinate conversion for host overlays.

## Decisions
### Interaction inputs
- Add `handlePinchZoom(paneId, x, scale)` with cursor-anchored zoom.
- Interaction state transitions are validated and logged when invalid.
- Active drag/zoom suppress crosshair and hit-test emissions.

### Hit-testing semantics
- Crosshair `nearestTimeMs` is `null` when cursor falls inside a gap or outside coverage.
- Replay cutoff continues to clamp hit-testing and overlay clipping.

### Overlay primitives
- Table and right-label primitives remain host-rendered; the engine emits layout anchors only.
- Overlay layout emission is verified via unit tests.

### Coordinate conversion events
- `onTransformChange` includes plot area, gutters, visible range, and devicePixelRatio.
- `onLayoutChange` includes pane index/count plus gutters for DOM overlay layout.

## Diagnostics and logs
- `interaction.state.invalid` warns on illegal state transitions.
- `data.window.incomplete` and replay diagnostics remain unchanged.

## Invariants
- Pointer and keyboard input never block the main thread.
- Hit-testing remains deterministic and stable across frames.
- Host overlays are positioned without per-frame polling.

## Rationale
Interaction semantics, hit-testing determinism, and overlay coordinate events are
engine contracts shared by every host. Keeping them inside chart-engine ensures
consistent behavior across quant-lab and other integrations.

## Files touched
- `src/core/engine/interaction.ts`
- `src/interaction/state-machine.ts`
- `src/core/engine/coordinates.ts`
- `src/core/engine/axis-layout.ts`
- `src/api/types/interaction.ts`
- `docs/interaction-model.md`
- `docs/public-api-contract.md`
