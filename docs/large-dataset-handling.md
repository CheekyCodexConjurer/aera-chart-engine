# Large Dataset Handling

This document defines guarantees and expectations for large datasets (10k to 1M loaded, 500 to 2k visible).

## Guarantees under load
- No main-thread blocking during interaction.
- Bounded latency for pan, zoom, and crosshair.
- Bounded CPU and GPU memory use with explicit caps.

## Memory budgeting (baseline expectations)
- Candle series memory must be explicitly accounted for.
- Target memory math (example per bar):
  - time: 8 bytes
  - OHLC: 16 bytes
  - volume: 8 bytes (optional)
  - flags and indices: 8 bytes
  - total: ~32 to 40 bytes per bar
- Buffers and caches must publish per-series totals.

## Cache caps
- CPU cache cap per chart must be explicit and enforced.
- GPU buffer pools must be bounded and instrumented.
- Cache eviction uses LRU with visible data pinned.

## Window ownership and integration pattern
- Engine owns view window selection.
- Host owns data supply and paging.
- Engine requests a data window with explicit prefetch margin.
- Host may provide a larger window but must indicate bounds.
- Requests are coalesced while a window is pending.
- Coverage is inferred from primary series bounds unless explicitly overridden by the host.

## Stress behavior
- When under pressure, the engine must degrade gracefully:
  - Reduce LOD first.
  - Defer non-essential overlays.
  - Never block input handling.
- Any degradation is explicit and logged.

## References
- `data-model.md` for update types and window definitions.
- `performance-contracts.md` for budget rules.
