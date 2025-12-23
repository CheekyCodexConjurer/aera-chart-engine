# Contracts and Compatibility

This spec defines contract versioning, compatibility rules, and adapter guidance. It is doc-only and must be kept in sync with public API changes.

## Contract versioning
- Add `engineContractVersion` to the public API surface (string, semver).
- Contract version is independent of package version but must be compatible.
- Breaking changes require a major bump of `engineContractVersion`.
- Initial contract version should match the package version until the first breaking change.
- Canonical engineContractVersion: `0.5.0`.

## Source of truth (required)
- The canonical contract version lives in documentation and is exposed via `getEngineInfo()`.
- Implementation must use a single constant embedded in the build.
- If multiple sources diverge, contract tests must fail.

## Public exposure (required)
- Expose metadata via `getEngineInfo()`:
  - `engineVersion`: package version string.
  - `engineContractVersion`: contract version string.
- Diagnostics and repro bundles must include both versions.

## SemVer policy (contract)
- Major: breaking contract change or removed behavior.
- Minor: backward-compatible additions with documented defaults.
- Patch: bug fixes that do not change visible behavior.

## Deprecation window
- Minimum: one minor release of deprecation notice before removal.
- Deprecations must include: reason, replacement, removal version, and migration steps.

## Migration note template (required)
- Title: "Contract change: <feature> (<engineContractVersion>)".
- Fields: rationale, old behavior, new behavior, compatibility impact, migration steps, rollback.

## Migration notes
### Contract change: Data window handshake + interaction events (0.2.0)
- Rationale: expose deterministic window paging, gap-aware cursor semantics, and event-driven overlay positioning.
- Old behavior: data window requests lacked request ids/reasons; transform events only exposed `paneId`; no pinch zoom API.
- New behavior: data window requests include `requestId`, `reason`, `pendingCount`; `setDataWindowCoverage` allows explicit coverage; `onTransformChange` includes plot area, visible range, gutters, and devicePixelRatio; `handlePinchZoom` added.
- Compatibility impact: backward-compatible additions; existing handlers remain valid.
- Migration steps: accept new payload fields, use `setDataWindowCoverage` and `dataWindowMaxPending` where paging matters, wire `handlePinchZoom` for touch input.
- Rollback: remove usage of new fields/methods and pin to engine contract 0.1.x.

### Contract change: Renderer metrics expansion + replay hashing (0.3.0)
- Rationale: expose renderer state changes/batch counts and align replay hash digest with pane render windows.
- Old behavior: `getMetrics().renderer` omitted batch/state/buffer reuse counters and text atlas evictions; replay hash digest did not include per-pane render windows.
- New behavior: renderer metrics include `batchCount`, `stateChanges`, `bufferReuses`, and `textAtlas.evictions`; replay hash digest includes per-pane `visibleRange` and `renderWindow`.
- Compatibility impact: backward-compatible additions; existing consumers can ignore new fields.
- Migration steps: accept new metrics fields in diagnostics pipelines and update any hash comparators to account for pane render windows.
- Rollback: ignore new metrics fields and pin to engine contract 0.2.x.

### Contract change: Worker compute + offscreen adapter (0.4.0)
- Rationale: move indicator compute off the main thread and expose an offscreen renderer bridge.
- Old behavior: worker APIs documented only; no worker adapter or status; compute requests were main-thread only.
- New behavior: `setWorkerAdapter` and `getWorkerStatus` are implemented; `postComputeRequest` supports optional `transfer` for worker payloads; offscreen mode posts render commands to a worker adapter.
- Compatibility impact: backward-compatible additions; existing consumers unaffected.
- Migration steps: pass a `WorkerAdapter` to `setWorkerAdapter` and handle `compute_request`/`compute_result` messages; opt into `mode: "offscreen"` only when supported.
- Rollback: remove worker adapter usage and pin to engine contract 0.3.x.

### Contract change: Renderer theme + candle styling (0.5.0)
- Rationale: allow TradingView-style candle body/wick/border styling and global renderer theming without buffer rebuilds.
- Old behavior: grid/axis/crosshair and candle colors were hardcoded with no public theme API.
- New behavior: `WebGL2Renderer` accepts a `theme` option and `setTheme` for partial updates; candle body/wick/border colors and background/grid/axis/crosshair colors are theme-driven.
- Compatibility impact: backward-compatible additions; defaults preserve existing visuals (borders disabled).
- Migration steps: pass `theme` when creating the renderer or call `setTheme` to customize colors.
- Rollback: remove theme usage and pin to engine contract 0.4.x.

## Contract tests (doc-first)
- Contract tests fail when the API surface changes without a version bump.
- Tests validate: event payloads, type unions, required options, and default behaviors.
- Contract test artifacts are stored alongside benchmark results.
- Failure conditions: missing version bump, undocumented payload change, or removal without deprecation window.

## Contract test matrix (required)
The contract test suite must validate the following surfaces against the canonical docs:
- Public API surface: method list, signatures, and required options.
- Event payloads: visible range, data window, crosshair, hit-test, layout events.
- Type unions: series types, overlay primitives, interaction commands.
- Default values: options and behavior defaults documented in `public-api-contract.md`.
- Error contracts: diagnostic codes and severity expectations.

**Sources of truth**
- `docs/public-api-contract.md`
- `docs/host-engine-responsibility-contract.md`
- `docs/data-time-semantics.md`

## Adapter guidance (host-facing)
- Adapter must map host time domain to engine `TimeMs` (UTC epoch ms).
- Adapter owns indicator execution and Plot API translation.
- Adapter must pass stable ids for series and overlays.
- Adapter must surface engine diagnostics to the host UI.

## Adapter compatibility checklist
- Read `getEngineInfo()` and validate `engineContractVersion` before initialization.
- Enforce update ordering rules (append/prepend/patch) before ingestion.
- Normalize time domain and timezone before sending any data.
- Surface diagnostics and replay cutoff violations to the host UX.
- Record adapter version in the compatibility matrix on release.

## Compatibility matrix
- Maintain a matrix in `docs/compatibility-matrix.md`: host adapter version x engineContractVersion.
- Minimum: last 2 minor contract versions must remain supported.

## References
- `../public-api-contract.md`
- `../host-engine-responsibility-contract.md`
- `packaging-release.md`
