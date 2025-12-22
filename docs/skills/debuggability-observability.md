# Debuggability and Observability

## Why it matters
- All behavior must be observable and debuggable.
- Performance and correctness are tied to clear diagnostics.
- Deterministic replay requires structured state capture.

## What good looks like
- Built-in counters, traces, and debug overlays.
- Deterministic reproduction using logs and versioned inputs.
- Clear error modes and actionable diagnostics.
- Metrics are exposed without impacting render performance.
- Debug tools are opt-in and well scoped.

## Scope boundaries
- Includes metrics, tracing, logging, and debug overlays.
- Includes state capture and deterministic replay tooling.
- Excludes external telemetry by default.
- Includes debug gating to avoid hot path overhead.

## Evidence and artifacts
- Debug overlay screenshots with explained metrics.
- Structured log examples tied to a reproduction case.
- Trace capture and replay instructions.
- Error taxonomy with severity and remediation.

## Review questions
- Can issues be reproduced with captured inputs?
- Are logs structured and versioned?
- Do diagnostics avoid impacting frame budgets?
- Are debug overlays non-invasive and deterministic?

## Common failure modes
- Hidden fallbacks that mask issues.
- Non-reproducible bugs due to missing state capture.
- Silent errors that degrade output quality.
