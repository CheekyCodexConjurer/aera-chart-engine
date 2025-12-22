# Observability and Repro Bundle

This spec defines structured logging, renderer metrics, and the repro bundle format.

## Structured logging
- Log levels: `debug`, `info`, `warn`, `error`, `fatal`.
- Required fields in every log event:
  - `timestamp` (ISO-8601), `sessionId`, `chartId`, `engineVersion`, `engineContractVersion`.
  - `level`, `eventType`, `context`.
- Context keys (when applicable): `paneId`, `seriesId`, `overlayId`, `scaleId`, `range`.
- Retention: keep the last N events (default 512) per session for repro bundles.
- Sampling: debug logs are sampled (default 10%) and never on by default in production.

## Required event types
- `visible_range_changed`
- `data_window_requested`
- `render_window_shifted`
- `replay_state_changed`
- `diagnostic_emitted`
- `lod_level_changed`
- `cache_evicted`

## Renderer metrics
- Metrics are emitted as snapshots and counters.
- Required counters:
  - Draw calls per layer, state changes, batch counts.
  - Buffer allocations, uploads, and pool reuse counts.
  - Text atlas usage (pages, occupancy, evictions).
  - LOD selection changes and cache hit/miss rates.
- Sampling cadence:
  - Per frame for frame time and draw calls.
  - Every 250ms for atlas/cache metrics.
  - On change for LOD level transitions.

## Repro bundle format (JSON)
- `bundleFormatVersion`: semver for bundle schema.
- `meta`: engineVersion, engineContractVersion, platform, timestamp, sessionId.
- `inputs`: series snapshots, overlays, indicator outputs, and update versions.
- `view`: visible range, render window, pane layout, replay state.
- `events`: last N input events and data window requests.
- `diagnostics`: diagnostics snapshot at capture time.
- `metrics`: renderer metric snapshot and counters at capture time.
- `options`: engine options that affect rendering or time semantics.

## Capture and replay
- Capture is host-initiated; engine provides helpers.
- Replay consumes a bundle to reproduce frames deterministically.
- Bundles must be self-contained and require no external dependencies.

## References
- `../diagnostics-failure-surfaces.md`
- `../backpressure-cancellation-contract.md`
