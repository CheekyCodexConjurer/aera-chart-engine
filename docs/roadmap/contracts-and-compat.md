# Contracts and Compatibility

This spec defines contract versioning, compatibility rules, and adapter guidance. It is doc-only and must be kept in sync with public API changes.

## Contract versioning
- Add `engineContractVersion` to the public API surface (string, semver).
- Contract version is independent of package version but must be compatible.
- Breaking changes require a major bump of `engineContractVersion`.

## SemVer policy (contract)
- Major: breaking contract change or removed behavior.
- Minor: backward-compatible additions with documented defaults.
- Patch: bug fixes that do not change visible behavior.

## Deprecation window
- Minimum: one minor release of deprecation notice before removal.
- Deprecations must include: reason, replacement, removal version, and migration steps.

## Contract tests (doc-first)
- Contract tests fail when the API surface changes without a version bump.
- Tests validate: event payloads, type unions, required options, and default behaviors.
- Contract test artifacts are stored alongside benchmark results.

## Adapter guidance (host-facing)
- Adapter must map host time domain to engine `TimeMs` (UTC epoch ms).
- Adapter owns indicator execution and Plot API translation.
- Adapter must pass stable ids for series and overlays.
- Adapter must surface engine diagnostics to the host UI.

## Compatibility matrix
- Maintain a matrix: host adapter version x engineContractVersion.
- Minimum: last 2 minor contract versions must remain supported.

## References
- `../public-api-contract.md`
- `../host-engine-responsibility-contract.md`
- `packaging-release.md`
