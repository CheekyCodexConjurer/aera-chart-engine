# PineScript Compatibility Matrix

Goal: 100 percent parity with PineScript behavior through a host compatibility layer, while the engine remains renderer-only.

## Status codes
- target: required for parity
- partial: supported in host or engine but missing gaps
- out-of-scope: explicitly host-only and not part of engine

## Matrix
| Area | PineScript concept | Host responsibility | Engine responsibility | Status |
| --- | --- | --- | --- | --- |
| Execution | bar-by-bar evaluation, barstate | run script, track barstate, produce outputs | none | target |
| Types | series/simple/input | enforce type rules, conversions | render typed outputs | target |
| Inputs | input.* | UI and persistence of inputs | none | target |
| TA | ta.* functions | compute and output series | none | target |
| Math/Str | math.*, str.* | compute outputs | none | target |
| Arrays/Maps | array.*, map.*, matrix.* | manage data structures | none | target |
| Plot | plot, plotshape, plotchar | normalize to primitives | render primitives | target |
| Candles | plotcandle | normalize OHLC | render candles | target |
| Lines/Boxes | line.new, box.new | normalize objects | render primitives | target |
| Labels | label.new | normalize labels | render labels | target |
| Tables | table.* | host DOM overlay | expose coordinates | target |
| Fills | fill | resolve fill pairs | render filled zones | target |
| Colors | color.* | resolve tokens in host | apply style tokens | target |
| Timeframes | request.security | host fetch and align | render outputs | target |
| Strategy | strategy.* | backtesting, orders | render markers | target |
| Alerts | alert() | host alert system | none | target |
| Limits | max_* settings | enforce host caps | enforce render caps | target |
| Errors | compile/runtime errors | host reports and bundles | diagnostics surface | target |

## Notes
- The engine must remain indicator-agnostic. Any indicator-specific behavior is forbidden.
- Host owns PineScript execution and provides normalized outputs in UTC epoch milliseconds.
- Engine enforces replay cutoff and clipping for all primitives.
- Adapter mapping lives in `tools/pinescript/adapter/index.mjs` and is validated by parity tests.
