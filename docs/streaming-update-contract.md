# Streaming Update Contract

This document defines behavior for last-candle and tick updates.

## Update frequency expectations
- Designed for 1 Hz to 50 Hz updates per series.
- Higher rates must be explicitly profiled and documented.

## Last candle updates
- Updates to the most recent bar are incremental.
- High and low changes update only the affected geometry.
- Autoscale updates are explicit and can be disabled.
  - When autoscale is enabled, scale updates must preserve the view anchor.
  - When autoscale is disabled, scale ranges remain unchanged.

## Tick updates (optional)
- Tick data is treated as append-only within a bar.
- Aggregation into bars is a host responsibility.

## Guarantees
- No memory growth proportional to update rate.
- No GC spikes in hot paths.
- Stable input latency during sustained streaming.
