# Auto Debug Mode

This document defines a non-interactive, terminal-driven auto-debug workflow that can run without user input and produce deterministic debug artifacts.

## Goals
- Run without prompts or interactive output.
- Use deterministic inputs (fixed seeds, fixed datasets).
- Capture reproducible artifacts (logs, metrics, repro bundles, traces).
- Identify likely fault points from failing runs.
- Produce a compact report that can be consumed by an agent.

## Non-goals
- Replacing a human debugger or IDE.
- Instrumenting non-exported local functions without source transforms.
- Running networked or destructive commands.

## Execution model
1. Load `auto-debug.config.json` (or defaults if missing).
2. Build an index of repo symbols (functions, classes, methods).
3. Run configured commands/tests (no prompts).
4. Parse failures and stack traces into target selectors.
5. Optional probe pass to measure target method timings.
6. Emit a report bundle to `artifacts/auto-debug/<runId>/`.

## Inputs
- Repo source files under `src/`.
- Existing diagnostics, logs, repro bundles, and benchmarks.
- Explicit selectors from `auto-debug.config.json`.

## Outputs (required)
- `report.json`: machine-readable summary.
- `report.md`: short human summary.
- `command-<id>.stdout.log` / `command-<id>.stderr.log`.
- `index.json`: symbol index and selector matches.
- `probe-events.json` (if probes enabled).

## Safety rules (non-negotiable)
- No prompts or interactive input.
- No destructive commands (`rm`, `git reset`, network installs).
- Commands must come from an allowlist in config.
- Any blocked command is logged in the report.

## Config (summary)
`auto-debug.config.json` controls the run. See inline comments in the file.
- `run.commands`: shell commands to execute.
- `targets.selectors`: function selectors or regex filters.
- `targets.fromStacks`: enable stack-trace targeting.
- `probe.enabled`: enable class-method probes.
- `limits.maxEvents`: cap probe events in a run.

## Probe limitations
- Probes only wrap exported class methods and exported functions that can be referenced at runtime.
- Internal (non-exported) functions are analyzed statically and reported by location, not traced.

## Determinism rules
- Use fixed seeds for any synthetic datasets.
- Log runtime environment and versions in the report.
- Do not depend on current wall-clock time for logic (only for timestamps in logs).

## Report fields (report.json)
- `runId`, `timestamp`, `repoRoot`, `engineVersion`, `engineContractVersion`.
- `commands`: exit codes + timing.
- `failures`: stack traces and matched targets.
- `targets`: resolved list of functions/methods.
- `probeSummary`: counts and top timings.
- `artifacts`: files written for the run.

## References
- `public-api-contract.md` (repro/metrics/logging helpers)
- `diagnostics-failure-surfaces.md`
- `roadmap/ci-gates.md`
