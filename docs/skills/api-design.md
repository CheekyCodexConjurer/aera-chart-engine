# API Design for Long-Lived Libraries

## Why it matters
- Users must trust API stability for long-term research tools.
- Breaking changes are expensive in quant environments.
- API design impacts performance and debuggability.

## What good looks like
- Clear, minimal surface area with explicit lifecycles.
- Backward-compatible evolution and deprecation plans.
- Stable defaults and explicit opt-in for behavior changes.
- Clear separation between declarative and imperative APIs.
- Ensures error handling is explicit and user-visible.

## Scope boundaries
- Includes lifecycle management and versioning strategy.
- Includes error handling and configuration defaults.
- Excludes application-specific UI concerns.
- Includes adapter-specific constraints and escape hatches.

## Evidence and artifacts
- Public API surface review with lifecycle diagrams.
- Deprecation plan templates and example migrations.
- API usage samples that show stable defaults.
- API compatibility test results across versions.

## Review questions
- Is there a clear migration path for changes?
- Are defaults explicit and stable?
- Are imperative and declarative boundaries respected?
- Are error modes documented and testable?

## Common failure modes
- Leaky abstractions that expose internal state.
- Implicit behavior changes in minor versions.
- Config explosion without clear boundaries.
