# Data and Time Semantics

This document defines the canonical time domain and the required data invariants.

## Canonical time domain (hard precondition)
- The engine time domain is UTC epoch milliseconds.
- All time values are integers in milliseconds, represented as Numbers.
- The host must normalize all timestamps into this domain before ingestion.
  - ISO strings and seconds are not accepted by the engine.
  - Host converts seconds to milliseconds before ingestion.

## Timezone handling
- The engine is timezone-agnostic and does not apply timezone shifts.
- Any display timezone adjustment is a host responsibility.
- Pointer and visible range events always use the canonical domain.

## Sorting and deduplication rules
- Time values in each series snapshot are strictly increasing.
- Duplicate timestamps are rejected by default.
- If duplicates are unavoidable, the host must merge them before ingestion.

## Versioning and idempotency
- Each series snapshot carries a monotonically increasing version.
- Incremental updates must target the latest version.
- Non-increasing versions are rejected with diagnostics.
- Reapplying an update with the same version is a no-op.

## Numeric validity and candle invariants
- No NaN or Infinity values are allowed.
- OHLC constraints:
  - `low <= open <= high`
  - `low <= close <= high`
  - `high >= low`
- Volume is optional but must be non-negative when present.

## Out-of-order updates
- Incremental updates must preserve strict ordering.
- Out-of-order updates are rejected with diagnostics.
- If re-sorting is required, the host must send a full replacement snapshot.
- Append updates must start after the last snapshot time.
- Prepend updates must end before the first snapshot time.
- Patch updates must target existing timestamps only.

## Update ordering examples
- Valid append:
  - Snapshot times: `[1000, 2000, 3000]`
  - Append times: `[4000, 5000]`
- Invalid append (overlap):
  - Snapshot times: `[1000, 2000, 3000]`
  - Append times: `[3000, 4000]`
- Valid prepend:
  - Snapshot times: `[1000, 2000, 3000]`
  - Prepend times: `[200, 500]`
- Invalid patch (missing time):
  - Snapshot times: `[1000, 2000, 3000]`
  - Patch times: `[2500]`

## Gaps and session handling
- Gaps are first-class and are not auto-filled by the engine.
- The default time axis is explicit and does not compress non-trading time.
- A compressed time axis is allowed only via an explicit host-provided mapping.
- Session boundaries must be explicit if displayed.
- Gap detection uses a sampled median bar interval from the primary series.
- Adjacent points with delta greater than `gapThresholdRatio * medianInterval` are treated as gaps.
- Time axis ticks inside gap ranges are omitted to avoid misleading labels.

## Missing bars and interpolation rules
- Candle rendering does not interpolate missing bars.
- Line series interpolation is explicit and configured per series.
- Hit-testing must respect gaps and never infer data that is absent.
  - When over gaps or outside coverage, `nearestTimeMs` is `null` and must be surfaced as such.

## References
- `interaction-model.md` for pointer time semantics.
- `replay-semantics.md` for cutoff and preview behavior.
