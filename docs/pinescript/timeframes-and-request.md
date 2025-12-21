# Timeframes and Request Mapping

This document defines how multi-timeframe and request semantics map into the host and engine.

## request.security
- Host fetches higher-timeframe data and aligns to the base timeframe.
- Host must prevent repainting by freezing historical values.
- Engine only renders aligned outputs; it does not fetch or resample data.

## Timeframe identity
- All outputs are normalized to UTC epoch milliseconds.
- Host supplies explicit timeframe metadata for diagnostics only.

## Gaps and sessions
- Non-trading gaps are preserved unless host explicitly compresses time.
- Compressed time axes require host-provided mapping.

## Alignment rules
- Outputs must be time-ordered and strictly increasing.
- If multiple series share a pane, their time domains must be aligned.
