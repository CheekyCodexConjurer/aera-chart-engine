# Benchmark and Regression Policy

This document defines required benchmark scenarios and no-merge regression rules.

## Canonical benchmark scenarios
- Timeframe switch under load (1M bars loaded).
- Indicator toggle storm (multiple overlays on and off).
- Replay scrubbing with cutoff moving rapidly.
- Last-candle streaming updates at high frequency.
- Pan and zoom across 1M bars with overlays visible.

## Required reporting format
- Frame time: p50, p95, p99 (ms).
- Input latency: p50, p95 (ms) for pan, zoom, hover.
- Memory deltas: CPU and GPU peak usage.
- Draw calls and state changes per frame.

## No-merge rule
- Any regression beyond thresholds blocks merge.
- Performance regressions are treated as breaking changes.
- Exceptions require Architecture and Performance Gatekeeper approval.

## Evidence artifacts
- Trace capture IDs or files.
- Benchmark configuration and dataset spec.
- Before and after comparison table.
