# Packaging and Release Hygiene

This spec defines packaging targets, release hygiene, and compatibility matrices.

## Packaging targets
- ESM build with `.d.ts` types (no CommonJS).
- Explicit export surface in `src/index.ts` and `package.json` exports map.
- Versioned artifacts in `dist/` with source maps.

## Export surface (required)
- Default: `import { createChartEngine } from "aera-chart-engine"`.
- Types are exported from `dist/index.d.ts`.
- Internal modules are not exported.

## Release hygiene
- Changelog entry per release with contract version and migration notes.
- Tag releases with `vX.Y.Z` and include contract version in notes.
- Archive benchmark artifacts alongside release notes.
 - Update compatibility matrix on every release.

## Release checklist (minimum)
- `engineContractVersion` updated if behavior changed.
- Benchmarks executed for the canonical scenarios.
- Repro bundle schema version bumped if changed.
- CI gates pass (check, smoke, contracts, benchmarks).

## Compatibility matrix
- Track host adapter version x engineContractVersion.
- Require a documented support window (min: last 2 minor versions).
 - Deprecations include planned removal version.

## References
- `contracts-and-compat.md`
- `../public-api-contract.md`
