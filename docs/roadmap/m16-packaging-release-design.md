# M16 Packaging + Release Design

Rationale: packaging and release hygiene are engine-owned; host workflow details remain in quant-lab.

## Goals
- Ship ESM + `.d.ts` artifacts in `dist/` with source maps.
- Lock the public surface to the root entrypoint via `exports`.
- Require release checks for changelog and compatibility updates.
- Keep release gates deterministic and reproducible.

## Decisions
- Single entrypoint: `src/index.ts` mapped to `dist/index.js` and `dist/index.d.ts`.
- `package.json` `exports` exposes only `.` with `types` + `default`.
- Release notes live in `CHANGELOG.md` and include the engine contract version.
- Compatibility matrix lives in `docs/compatibility-matrix.md` and is updated per release.
- Release gate validates changelog + compatibility matrix and runs `npm pack --dry-run`.

## Non-goals
- No CommonJS build.
- No deep import support.
- No host adapter implementation.

## Files to touch
- `tsconfig.json`
- `package.json`
- `tests/public-api-surface.mjs`
- `tools/release/verify.mjs`
- `.github/workflows/release.yml`
- `docs/roadmap/packaging-release.md`
- `docs/roadmap/ci-gates.md`
- `docs/roadmap/contracts-and-compat.md`
- `docs/compatibility-matrix.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `docs/roadmap/INDEX.md`
- `docs/INDEX.md`

## Verification
- `npm run check`
- `npm run test:contracts`
- `npm run test:public-api`
- `npm pack --dry-run`
