# M11 Data Window + LOD Design Note

Status: approved
Owner: Data Pipeline Agent (coordination with Architecture)

## Scope
- Data window request handshake with backpressure.
- LOD cache observability and deterministic selection.
- Gap-aware time axis behavior (no implicit fill).

## Decisions
### Data window handshake
- `onDataWindowRequest` includes `requestId`, `reason`, and `pendingCount`.
- Engine tracks a bounded pending request queue per pane (`dataWindowMaxPending`, default 2).
- When backpressure is hit, new requests are coalesced into the most recent request and a diagnostic is emitted.
- Coverage can be explicitly reported by the host to acknowledge completion; otherwise coverage is inferred from the primary series.

### LOD cache observability
- LOD cache evictions increment an engine metric (`lodCacheEvictions`) and are logged.
- LOD selection remains pixel-density driven with hysteresis per series.

### Gap-aware time axis
- Gap detection uses a sampled median bar interval per series.
- `gapThresholdRatio` (default 3) defines when adjacent points constitute a gap.
- Time axis ticks are filtered out inside gap ranges.
- Crosshair `nearestTimeMs` is `null` when the cursor is inside a gap or outside coverage.

## Diagnostics and logs
- `data.window.backpressure` warns when requests are coalesced.
- `data.window.coverage.invalid` errors on invalid host coverage overrides.
- `data.window.incomplete` remains the canonical warning for insufficient coverage.
- `data_window_requested` logs include request id, reason, and pending count.

## Invariants
- No main-thread blocking during interaction or window updates.
- Request coalescing is deterministic and stable across frames.
- Gaps are explicit; the engine never infers data to fill them.

## Rationale
Data window handshake, LOD cache determinism, and gap handling define engine-owned
behavior that must remain stable across hosts. These contracts belong in chart-engine
to keep replay, data windowing, and interaction outcomes deterministic and portable.

## Files touched
- `src/core/engine/windowing.ts`
- `src/core/engine/axis-layout.ts`
- `src/core/engine/coordinates.ts`
- `src/core/series.ts`
- `src/api/types/core.ts`
- `src/api/types/interaction.ts`
- `src/api/types/diagnostics.ts`
