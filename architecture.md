# Architecture

## 1. High-level system overview

### What this library is
- A GPU-first, headless charting engine for quantitative research workloads.
- A deterministic rendering and interaction core that targets large datasets (10k to 1M points loaded, 500 to 2k visible).
- A local-first engine built for modern Chromium and WebGL2, optimized for sustained interaction.

### What this library is NOT
- Not a UI toy, marketing widget, or general-purpose dashboard framework.
- Not a server-rendered charting solution.
- Not a data ingestion or storage platform.
- Not a "magical" auto-tuning system that hides cost or behavior.

### Core design principles
- Deterministic performance: frame time and memory behavior are measurable, repeatable, and bounded.
- Explicit architecture: each subsystem has clear ownership, inputs, outputs, and lifecycle.
- Zero-jitter interaction: pan, zoom, and crosshair never block or stutter.
- No partial UX: every interactive element has hover, active, focus, and disabled states.
- No silent fallbacks: every behavior is explicit, observable, and debuggable.
- Local-first: all core functionality works offline and does not depend on remote services.

### Terminology and invariants
- Data domain: the full logical dataset range for a series.
- View domain: the current visible range, derived from axis scale and pane size.
- Pane: a rectangular region with its own axes, series, and overlays.
- Series: a typed renderer with immutable, versioned data snapshots.
- Overlay: transient visual layers such as crosshair or selection.
- Invariants:
  - Data is time-ordered within a series.
  - Data snapshots are immutable once published to the core engine.
  - A frame is the atomic unit of state and render updates.

## 2. Performance targets (non-negotiable)

### Targets and budgets
| Metric | Target | Notes |
| --- | --- | --- |
| FPS (interaction) | 60 fps sustained | 16.6 ms frame budget, including event handling |
| FPS (idle) | 30 fps or lower | Idle throttling permitted if no visual changes |
| Frame budget (render) | 8 ms | Remaining time reserved for input and scheduling |
| Main thread blocking | 0 ms during interaction | Heavy compute must be off-thread |
| Memory (GPU) | Bounded, explicit caps | Texture and buffer pools with hard limits |
| Memory (CPU) | Predictable, bounded | TypedArray pooling, no unbounded caches |
| GC behavior | Minimal allocations per frame | No per-frame object churn |
| Time to interactive | < 1.5 s for 1M points | First meaningful draw within budget |

### Enforcement expectations
- Every hot path has a measurable budget and a profiler target.
- No regression merges without benchmark deltas.
- All allocations in hot paths must be justified and logged.

### Measurement and reporting
- Frame time is measured per pass and reported as histograms.
- Input latency is measured end-to-end for pan, zoom, and hover.
- GPU time is measured using WebGL timer queries when available.
- Memory usage is reported for both CPU and GPU pools.

## 3. Layered architecture

### Layer overview (data and control flow)
```
Input Events -> Interaction State Machine -> Core Engine -> Render Graph -> WebGL2
Data Sources -> Data Pipeline -> Core Engine
Indicators -> Compute Layer (Worker/WASM) -> Data Pipeline
```

### Ownership boundaries
- Each layer has a single owner and a single public contract.
- Layers communicate via immutable snapshots, not shared mutable state.
- Cross-layer changes require explicit versioning and migration notes.

### 3.1 Core Engine (headless)
**Responsibilities**
- Owns the scene graph and pane hierarchy.
- Owns axes, series lifecycle, and layout.
- Owns interaction state machine and coordinate transforms.
- Owns dirty-flag scheduling and partial invalidation.

**Key components**
- Scene graph: panes, axes, series, overlays, and interaction layers.
- Panes and axes lifecycle:
  - Explicit create, mount, update, unmount.
  - Layout invalidation only on change.
- Series lifecycle:
  - Stable identity, versioned data snapshots.
  - Explicit attach/detach to panes.
- Interaction state machine:
  - States: idle, hover, active-drag, active-zoom, selection, disabled.
  - Transitions are explicit and debuggable.
- Dirty-flag scheduling:
  - Flags per layer: data, layout, axis, overlays, text, GPU resources.
  - Dirty flags are cleared only after render completion.
- Coordinate transforms:
  - World space, data space, and screen space are distinct.
  - All transforms are cached and updated only when inputs change.
  - All transforms are invertible and tested for precision loss.

**State ownership**
- Engine owns authoritative view state and axis mapping.
- Render layer owns GPU state and render graph configuration.
- Data pipeline owns data window selection and LOD selection.

**Axis models**
- Time axis supports explicit session boundaries and gap display.
- Linear axis supports hard min and max constraints.
- Log axis enforces positive domains and explicit clamps.
- Axis constraints are resolved before layout and hit-testing.

**Layout invariants**
- Pane layout is deterministic and order-independent.
- Axis sizes are computed once per frame and cached.

### 3.2 Rendering Layer
**WebGL2-first pipeline**
- WebGL2 is the primary renderer for all series and overlays.
- Render graph defines passes: background, grids, series, overlays, crosshair.
- No implicit "auto quality" switches; any quality change is explicit.

**GPU state management**
- Shader programs are cached and versioned by layout signature.
- State changes are minimized and ordered to reduce pipeline stalls.
- All GPU resources are tracked by explicit lifetime handles.

**Buffer strategy**
- TypedArray-backed buffers only; no per-frame allocations.
- Pooling policy:
  - Fixed-size pools for common buffer sizes.
  - Explicit eviction policy for large buffers.
- Dynamic vs static buffers:
  - Static buffers for immutable geometry.
  - Dynamic buffers for interaction overlays only.

**Instancing and batching**
- Batch by material, shader, and texture atlas.
- Instance data layout is stable and versioned.
- Minimize draw calls for series with shared shaders.

**Text rendering strategy**
- SDF glyph atlas for axis labels and overlays.
- CPU layout with cached glyph metrics.
- Tradeoffs:
  - SDF: faster GPU draw, modest memory cost, slight blur at small sizes.
  - Bitmap: crisper text, larger memory footprint, slower atlas updates.
- Policy: default to SDF, optional bitmap for debug tools only.

**Canvas2D fallback policy**
- No Canvas2D fallback for core rendering.
- Canvas2D allowed only for debug snapshots or offscreen diagnostics.
- Any fallback path must be explicit and logged.

**Precision and quality**
- All coordinate transforms use double precision on the CPU.
- GPU attributes use float precision with explicit scale normalization.
- Axis labels are snapped to pixel boundaries only when specified.

**Context loss and recovery**
- WebGL context loss is handled with explicit re-init paths.
- Resource rebuild uses cached CPU buffers and scene state.
- Recovery events are logged and exposed to diagnostics.

### 3.3 Data Pipeline
**Windowed data loading**
- Data window defined by visible domain plus prefetch margin.
- No implicit data fetches outside configured window.
  - Prefetch margin is explicit and configurable per series.

**LOD and decimation**
- Multi-resolution caches (raw, mid, coarse).
- Decimation is deterministic and stable across frames.
- LOD selection is based on pixel density, not dataset size.
  - LOD transitions are hysteresis-based to avoid flicker.

**Cache model**
- Tiered cache: hot (visible), warm (prefetch), cold (evicted).
- Eviction policy: LRU with hard memory cap.
- Cache entries are immutable snapshots with version tags.
  - Cache misses are surfaced via diagnostics.

**Incremental updates vs full rebuilds**
- Incremental updates preferred for append or small edits.
- Full rebuild only when schema or axis mapping changes.
- All updates are staged and applied atomically per frame.
  - Incremental updates are idempotent and order-independent.

**Time alignment and gaps**
- Gaps are first-class and never auto-filled.
- Series may expose gap policies, but defaults are explicit.
- Mixed timebases require an explicit mapping strategy.

**Schema and validation**
- Data schemas are versioned and validated before ingestion.
- Validation failures surface as typed, user-visible errors.
- Schema changes require full rebuild and version bump.

### 3.4 Compute Layer
**Where indicators run**
- Indicators execute in Web Workers or WASM workers.
- Main thread never performs heavy indicator computation.

**Worker and WASM boundaries**
- Work units are data windows with explicit contracts.
- Workers return immutable result buffers plus metadata.

**Data handoff contracts**
- Preferred transport: Transferable ArrayBuffer or SharedArrayBuffer.
- All buffers include version, length, and domain metadata.

**Thread isolation guarantees**
- Main thread only applies results; it never blocks on compute.
- Worker results are applied only if version matches current view.
  - Results include sequence numbers for ordering and cancellation.
  - Backpressure is enforced when compute queue exceeds limits.

**Determinism and numeric consistency**
- Indicator computations are deterministic for a given input window.
- Floating point behavior is documented for each indicator type.
- Results include numeric precision metadata when relevant.

### 3.5 Integration Layer
**React adapter philosophy**
- Adapter is thin and imperative; it does not re-render on every frame.
- React manages configuration and lifecycle, not per-frame drawing.

**Imperative vs declarative boundaries**
- Declarative: initial chart config, series definitions, themes.
- Imperative: viewport control, interactions, and streaming updates.

**Public API stability rules**
- Backwards-compatible changes only in minor releases.
- Breaking changes require deprecation cycle and migration guide.
- No hidden state or global singletons.
  - API changes include explicit performance impact notes.

## 4. Interaction model

### Interaction state machine summary
| State | Allowed transitions | Notes |
| --- | --- | --- |
| idle | hover, active-drag, active-zoom, selection | No pointer capture |
| hover | idle, active-drag, active-zoom | Hover only updates overlays |
| active-drag | idle | Pointer capture required |
| active-zoom | idle | Wheel or pinch only |
| selection | idle | Selection owns focus |
| disabled | idle | Only explicit re-enable |

### Pan and zoom mechanics
- Pan: pixel delta mapped to data domain via current axis scale.
- Zoom: cursor-anchored; zoom center is pointer position unless locked.
- Inertia: optional and explicit; never default.
- Multi-axis: zoom and pan respect axis locks and constraints.

### Crosshair and hit-testing
- Crosshair uses nearest visible data in the active pane.
- Hit-testing uses binary search on sorted data with per-series tolerance.
- Results are stable across frames and do not "jump" with tiny moves.

### Selection and annotation semantics
- Selection is explicit and owned by the interaction state machine.
- Selection geometry is in view space, not data space.
- Annotations are treated as overlays with explicit lifecycles.

### Pointer safety rules
- Pointer capture only during active drag or selection.
- All pointer events are normalized; no device-specific behavior changes.
- No interaction side effects on pointer-move unless state is active.
  - Pointer cancel events revert state to idle safely.

### Keyboard and accessibility rules
- Full keyboard pan, zoom, and focus traversal.
- Focus states are visible and consistent across panes.
- Accessibility hooks expose data cursor and selection state.

## 5. Rendering lifecycle

### Frame scheduling
- All renders are driven by requestAnimationFrame.
- A single frame scheduler orchestrates dirty flags and passes.

### Coalescing and re-entrancy
- Multiple invalidations are coalesced into a single frame.
- Render passes are never re-entrant.
- Scheduling avoids layout thrash during rapid input.

### Frame phases
1. Ingest input and pending data updates.
2. Resolve interaction state and axis transforms.
3. Update layout and dirty flags.
4. Update CPU buffers and GPU resources.
5. Issue draw calls per render pass.
6. Publish diagnostics and clear dirty flags.

### Redraw triggers
- Data window changes.
- Axis scale or layout changes.
- Theme or style changes.
- Interaction state changes that affect visible overlays.
- DevicePixelRatio changes or resize events.

### What must NEVER trigger a redraw
- Pointer moves when no visible overlay changes.
- Background compute completion for data outside current window.
- Logging, diagnostics, or telemetry updates.
- Redundant state updates that do not change render state.

### Partial invalidation
- Dirty flags are per-layer and per-pane.
- Overlay updates do not invalidate series geometry.
- Axis label changes do not invalidate data buffers.
- GPU resource changes are isolated to the owning pass.

## 6. Explicit non-goals
- Server-side rendering.
- Auto-generated indicators without explicit user request.
- Generic dashboard or widget layout system.
- Real-time market data ingestion or storage.
- Mobile-first interaction or touch-only UX.
- Automatic data smoothing or data correction.
- Hidden adaptive quality changes without user control.

## 7. Evolution strategy

### Growth without breaking users
- Semantic versioning with explicit compatibility rules.
- Deprecation windows with migration guides.
- Feature flags for experimental APIs.
- Compatibility test suite for public APIs.

### Phased delivery model
- Phase 0: stable core engine, basic series, deterministic interaction.
- Phase 1: scalable data pipeline and LOD, worker compute.
- Phase 2: advanced overlays, diagnostics, and extensibility.

### Backward compatibility rules
- Public APIs do not change behavior without opt-in flags.
- Defaults remain stable across minor releases.
- Any performance regression is treated as a breaking change.

## 8. Debuggability and observability

### Diagnostics surfaces
- Debug overlays for frame time, draw calls, and cache state.
- Structured logs with versioned state snapshots.
- Deterministic replay inputs for interaction and data updates.
  - Replay includes viewport, data window, and interaction state.

### Failure visibility
- All failures surface as explicit, typed errors.
- No silent fallback paths for render, compute, or data.

## 9. Failure handling and recovery

### GPU and rendering failures
- GPU context loss triggers explicit recovery or hard error.
- Recovery attempts are bounded and user-visible.

### Compute failures
- Worker crashes surface with explicit error states.
- Stale results are discarded and logged.

### Data pipeline failures
- Validation errors are surfaced immediately with context.
- Cache corruption triggers safe eviction and rebuild.
