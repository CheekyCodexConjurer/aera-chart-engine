# Rendering Pipeline

This document defines the WebGL2-first render pipeline, resource strategy, and render graph contracts.

## Pipeline overview
- WebGL2 is the primary renderer for all series and overlays.
- Render graph passes are ordered and deterministic.
- No implicit quality downgrades or silent fallbacks.

## Render passes (canonical order)
1. Background and grid
2. Series geometry
3. Overlays (crosshair, selection, annotations)
4. UI text and labels

## Buffers and memory
- All geometry uses TypedArray-backed buffers.
- Buffer pools are bounded and reused across frames.
- Dynamic buffers are reserved for interaction overlays only.

## Instancing and batching
- Batching is by material, shader, and texture atlas.
- Instance layouts are stable and versioned.
- The renderer minimizes draw calls before introducing complexity.

## Text rendering
- Default: SDF glyph atlas with cached metrics.
- CPU layout is deterministic and cached per label.
- Text fallbacks are explicit and logged.

## Precision management
- CPU transforms use double precision.
- GPU attributes use floats with explicit normalization.
- Large coordinates are normalized per pane to avoid precision loss.

## Resource lifetimes
- GPU resources are tracked by explicit lifetime handles.
- Context loss triggers a full resource rebuild from cached CPU data.
- Resource rebuilds are observable and diagnostic surfaced.

## Partial invalidation
- Dirty flags are per pass and per pane.
- Overlay changes do not invalidate series buffers.
- Axis label changes do not invalidate geometry buffers.

## References
- `data-rendering-pipeline-contract.md` for LOD output guarantees.
- `redraw-invalidation-rules.md` for redraw triggers and isolation.
