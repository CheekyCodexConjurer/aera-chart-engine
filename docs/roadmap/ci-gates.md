# CI and Gates

This spec defines the minimum CI pipeline and gating policy.

## Pipeline stages
- Typecheck and build (`npm run check`).
- Unit tests for data/LOD/replay (when added).
- Harness smoke tests (playground headless).
- Benchmark suite (when available).

## Gate policy
- PRs fail if contract tests or smoke tests fail.
- Performance regressions block merge once benchmarks are live.
- Any contract change requires version bump and migration notes.
- Contract tests must verify `engineContractVersion` against a golden spec.

## Local run guidance
- `npm run check`
- `npm run test:ui:smoke`
- `npm run harness:smoke` (planned)
- `npm run bench` (planned)

## References
- `performance-gates.md`
- `contracts-and-compat.md`
