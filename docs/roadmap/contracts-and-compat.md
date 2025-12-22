# Contracts and Compatibility

This spec defines contract versioning, compatibility rules, and adapter guidance. It is doc-only and must be kept in sync with public API changes.

## Contract versioning
- Add `engineContractVersion` to the public API surface (string, semver).
- Contract version is independent of package version but must be compatible.
- Breaking changes require a major bump of `engineContractVersion`.
- Initial contract version should match the package version until the first breaking change.

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
- Maintain a matrix: host adapter version x engineContractVersion.
- Minimum: last 2 minor contract versions must remain supported.

## References
- `../public-api-contract.md`
- `../host-engine-responsibility-contract.md`
- `packaging-release.md`
