# Packaging and Release Hygiene

This spec defines packaging targets, release hygiene, and compatibility matrices.

## Packaging targets
- ESM build with `.d.ts` types.
- Explicit export surface in `src/index.ts`.
- Versioned artifacts in `dist/`.

## Release hygiene
- Changelog entry per release with contract version and migration notes.
- Tag releases with `vX.Y.Z` and include contract version in notes.
- Archive benchmark artifacts alongside release notes.

## Compatibility matrix
- Track host adapter version x engineContractVersion.
- Require a documented support window (min: last 2 minor versions).

## References
- `contracts-and-compat.md`
- `../public-api-contract.md`
