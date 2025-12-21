# Limits and Performance

This document defines limits required to reach PineScript parity while preserving engine budgets.

## Host limits (PineScript max_* equivalents)
- max_bars_back: host caps historical lookback.
- max_lines_count, max_labels_count, max_boxes_count: host enforces output caps.
- max_bars_back violations must be explicit errors.

## Engine limits
- Render caps per pane are enforced with diagnostics.
- Excess overlays are dropped deterministically.
- Memory budgets are enforced for large datasets.

## Target budgets
- Lines: 200k points per pane.
- Markers: 50k points per pane.
- Zones: 10k segments per pane.
- Labels: 10k labels per pane.

## Required evidence
- Benchmarks for timeframes, replay scrub, and overlay storms.
- Memory deltas for 10k, 100k, and 1M points.
