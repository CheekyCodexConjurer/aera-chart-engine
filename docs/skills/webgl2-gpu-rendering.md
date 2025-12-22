# WebGL2 and GPU Rendering

## Why it matters
- The renderer is WebGL2-first and is the primary performance boundary.
- GPU pipelines define frame cost, latency, and memory use.
- Visual correctness depends on stable GPU state and precision control.

## What good looks like
- Clear knowledge of shaders, buffers, textures, and render passes.
- Ability to batch and instance without visual regressions.
- Explicit handling of GPU resource lifetimes and loss recovery.
- Understands precision tradeoffs for large coordinate ranges.
- Knows WebGL2 limits and extension behavior on Chromium.

## Scope boundaries
- Includes shader authoring, buffer layout, batching, and GPU lifetimes.
- Includes precision management for large coordinate ranges.
- Excludes UI theming or DOM layout concerns.
- Includes context loss and recovery handling.

## Evidence and artifacts
- GPU frame capture with draw call counts and state changes.
- Shader and buffer layout notes tied to render passes.
- GPU memory budget report for typical datasets.
- Shader precision notes for large coordinate ranges.

## Review questions
- Does the change reduce draw calls or state changes?
- Are GPU resources bounded and released deterministically?
- Is output stable across devicePixelRatio changes?
- Are shader variants minimized and cached?

## Common failure modes
- Excessive draw calls or state changes per frame.
- Unbounded texture growth or leaking buffers.
- Implicit fallback to Canvas2D without visibility.
