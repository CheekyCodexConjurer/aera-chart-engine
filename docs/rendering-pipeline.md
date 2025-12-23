# Rendering Pipeline

This document defines the WebGL2-first render pipeline, resource strategy, and render graph contracts.

## Pipeline overview
- WebGL2 is the primary renderer for all series and overlays.
- Render graph passes are ordered and deterministic.
- No implicit quality downgrades or silent fallbacks.
- Theme styling is applied via uniforms for grid/axis/crosshair and candle body/wick/border colors.

## Render passes (canonical order)
1. Background and grid
2. Series geometry
3. Overlays (crosshair, selection, annotations)
4. UI text and labels

## Buffers and memory
- All geometry uses TypedArray-backed buffers.
- Buffer pools are bounded and reused across frames.
- Dynamic buffers are reserved for interaction overlays and label backgrounds.
- Series geometry is cached in GPU buffers and transformed in shader space.
- Pan/zoom steady state reuses series buffers and updates uniforms only.
- Candle borders reuse quad instance buffers with a line index buffer.
- Clip stacks restore scissor state per pane/layer without leaking across passes.

## Instancing and batching
- Batching is by material, shader, and texture atlas.
- Instance layouts are stable and versioned.
- The renderer minimizes draw calls before introducing complexity.

## Text rendering
- Default: GPU glyph atlas with cached metrics.
- CPU layout is deterministic and cached per label run.
- Canvas text is an explicit fallback when configured.
- If the GPU atlas cannot admit new glyphs, the renderer falls back once and stays deterministic.
- When no text renderer is available, label rendering is skipped with an explicit error callback.

## Precision management
- CPU transforms use double precision.
- GPU attributes use floats with explicit normalization.
- Large coordinates are normalized per pane to avoid precision loss.

## Resource lifetimes
- GPU resources are tracked by explicit lifetime handles.
- Context loss triggers a full resource rebuild from cached CPU data.
- Resource rebuilds are observable and diagnostic surfaced.
- Buffer resizes emit `render/buffer-rebuild`.
- Series cache eviction emits `render/series-cache-evicted`.

## Partial invalidation
- Dirty flags are per pass and per pane.
- Overlay changes do not invalidate series buffers.
- Axis label changes do not invalidate geometry buffers.

## References
- `data-rendering-pipeline-contract.md` for LOD output guarantees.
- `redraw-invalidation-rules.md` for redraw triggers and isolation.
