# Data Pipeline and Rendering Pipeline Contract

This document defines the invariant contract between data processing and rendering.

## LOD output invariants
- Decimation preserves extrema within each pixel bucket.
- LOD outputs are deterministic for a given input window.
- LOD transitions use hysteresis and do not flicker.
- LOD selection is based on pixel density, not dataset size.
- Default policies:
  - candles/histogram: 0.5 - 1.0 points per pixel
  - line/area: 1.0 - 2.0 points per pixel
  - hysteresis ratio: 0.15 (configurable)

## Invalidation rules
| Change | Allowed invalidation |
| --- | --- |
| Pan within current window | transform-only |
| Zoom within current window | transform-only |
| LOD level change | geometry rebuild |
| Data window change | geometry rebuild |
| Theme change | overlay and text passes only |

## Stability requirements
- Geometry buffers are immutable per version.
- Switching LOD does not change visible data meaning.
- LOD selections are cached and evicted via LRU.

## References
- `progressive-rendering-guarantees.md` for coarse-to-fine behavior.
