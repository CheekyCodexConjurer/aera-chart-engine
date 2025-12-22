# Diagnostics and Failure Surfaces

This document defines error surfaces, diagnostic expectations, and reproducibility artifacts for production research usage.

## Error taxonomy
| Severity | Meaning | Recoverable |
| --- | --- | --- |
| info | non-critical status | yes |
| warn | degraded behavior | yes |
| error | invalid input or contract breach | maybe |
| fatal | engine cannot continue | no |

## Typed error contract
- Errors include: `code`, `message`, `severity`, `recoverable`, `context`.
- Context includes `paneId`, `seriesId`, `version`, and time domain where relevant.

## Diagnostic code policy
- Codes are stable, kebab-case identifiers.
- Prefix by domain: `data/*`, `render/*`, `replay/*`, `worker/*`, `api/*`.
- Any new code requires a doc update in this file.

**Minimum required codes**
- `data/invalid-time-domain`
- `data/out-of-order-update`
- `data/duplicate-timestamp`
- `data/invalid-ohlc`
- `render/context-lost`
- `render/context-restored`
- `render/buffer-allocation-failed`
- `render/buffer-rebuild`
- `render/series-cache-evicted`
- `render/unsupported-primitive`
- `replay/cutoff-violation`
- `replay/window-out-of-range`
- `worker/unavailable`
- `worker/offscreen-unavailable`
- `api/invalid-command`

## Failure surfaces (must be explicit)
- Data validation failures (ordering, NaN, duplicates).
- Unsupported primitives or API calls.
- GPU context loss and resource rebuild failures.
- Replay cutoff or window out-of-range conditions.

## Diagnostics surfaces
- Debug overlays for frame time, draw calls, cache state.
- Structured logs with versioned state snapshots.
- Counters for queue depth, cache hits, and dropped results.

## Deterministic reproduction bundles
**Required contents**
- Data snapshots and indicator outputs used by the engine.
- View state (visible range, pane layout, replay state).
- Engine version, config, and feature flags.
 - Diagnostics snapshot with codes and contexts.

**Rules**
- Repro bundles are stable and portable.
- No external dependencies are required to replay.

## Unsupported behavior policy
- Any unsupported feature emits a diagnostic with explicit guidance.
- No silent fallback is permitted.
