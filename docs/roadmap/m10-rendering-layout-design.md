# M10 Rendering + Layout Design Note

Status: implemented
Owner: Architecture + Rendering (coordination)

## Scope
- Renderer: persistent GPU buffers, instancing usage, clip stack guardrails.
- Text: GPU glyph atlas with deterministic fallback when capacity is exceeded.
- Layout: gutter sizing hysteresis and scale-visibility alignment for axis ticks.

## Non-goals
- Shader rewrites or render-graph restructuring.
- Host UI or DOM overlay behavior changes.
- Data window/LOD contract changes.

## Decisions
1) Persistent GPU buffers are maintained per series entry; pan/zoom steady state uses uniform-only updates while buffers stay resident.
2) GPU text is the primary path when enabled; if the atlas cannot admit new glyphs, the renderer falls back to the configured canvas text layer once and stays there for determinism.
3) Gutter widths are snapped and shrink with hysteresis to avoid label jitter while still expanding immediately to prevent clipping.
4) Layout uses the same single-scale-per-side rule as render state so gutter sizing matches visible scale selection.

## Diagnostics and performance evidence
- Buffer reallocations continue to emit `render/buffer-rebuild`; series evictions emit `render/series-cache-evicted`.
- Headless benchmarks are recorded for frame time and interaction latency; GPU profiling remains a follow-up for on-device captures.

## Rationale
Rendering and axis layout are engine-owned contracts that must be deterministic across hosts; the fallback policy and gutter hysteresis belong in chart-engine, not quant-lab, to keep behavior consistent and observable.
