# Observability and Repro Bundle

This spec defines structured logging, renderer metrics, and the repro bundle format.

## Structured logging
- Required fields: sessionId, engineVersion, engineContractVersion, chartId.
- Log last N events: visible range, data window requests, replay state changes.
- Log severity and recoverability for diagnostics.

## Renderer metrics
- Draw calls per layer, buffers allocated, atlas usage.
- Batch counts and coalescing statistics.
- LOD selection changes and cache hit rates.

## Repro bundle format (JSON)
- `meta`: engineVersion, engineContractVersion, platform, timestamp.
- `inputs`: series snapshots, overlays, indicator outputs.
- `view`: visible range, pane layout, replay state.
- `events`: last N input events and data window requests.
- `diagnostics`: diagnostics snapshot at capture time.

## Capture and replay
- Capture is host-initiated; engine provides helpers.
- Replay consumes a bundle to reproduce frames deterministically.

## References
- `../diagnostics-failure-surfaces.md`
- `../backpressure-cancellation-contract.md`
