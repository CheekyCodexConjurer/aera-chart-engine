# Performance Debug Checklist

This checklist is required for any change that touches performance-critical paths.

## Required evidence
- Before and after benchmark deltas.
- Trace capture or profiler output.
- Dataset spec and visible range.

## Mandatory focus areas
- Window selection or prefetch changes.
- Overlay ingestion or clipping changes.
- Coordinate transform changes.
- Replay cutoff or preview changes.
- Multi-pane layout or scale changes.

## Required artifacts
- Frame time histograms (p50, p95, p99).
- Input latency histograms (pan, zoom, hover).
- Memory deltas (CPU and GPU).

## No-merge rule
- Missing evidence blocks merge.
