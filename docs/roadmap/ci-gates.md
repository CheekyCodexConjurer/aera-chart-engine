# CI and Gates

This spec defines the minimum CI pipeline and gating policy.

## Pipeline stages
- Typecheck and build (`npm run check`).
- Unit tests for data/LOD/replay (when added).
- Harness smoke tests (`npm run harness:smoke`).
- Replay harness (`npm run test:replay`).
- PineScript parity (`npm run test:pinescript:parity`).
- Benchmark suite (`npm run bench:baseline`, `npm run bench:interaction`).
- Contract tests (`npm run test:contracts`).
- Compute pipeline tests (`npm run test:compute`).
- Public API surface check (`npm run test:public-api`).

## Gate policy
- PRs fail if contract tests or smoke tests fail.
- Performance regressions block merge once benchmarks are live.
- Benchmark thresholds and waiver rules are defined in `performance-gates.md` and require explicit approval.
- Any contract change requires version bump and migration notes.
- Contract tests must verify `engineContractVersion` against a golden spec.

## Release workflow (tags)
- Tags `vX.Y.Z` trigger a release gate workflow.
- Release gate runs the CI suite plus `npm run release:check` and `npm pack --dry-run`.
- Release gate fails if `CHANGELOG.md` or `docs/compatibility-matrix.md` are not updated for the tagged version.

## Benchmark gate rollout
- Phase A: observe-only (collect artifacts, no gating).
- Phase B: warn-on-regression (labels required for merge).
- Phase C: hard gate (no merge on regression).
- Promotion between phases requires at least 10 stable runs.

## CI artifacts (required)
- Build logs and `npm run check` output.
- Harness smoke report JSON.
- Benchmark report JSON + trace ids (when benchmarks are enabled).
- Contract test report with detected surface changes.

## Local run guidance
- `npm run check`
- `npm run test:ui:smoke`
- `npm run harness:smoke`
- `npm run test:contracts`
- `npm run test:replay`
- `npm run test:pinescript:parity`
- `npm run test:compute`
- `npm run test:public-api`
- `npm run bench:baseline`
- `npm run bench:interaction`
- `npm run bench:gate`

## References
- `performance-gates.md`
- `contracts-and-compat.md`
