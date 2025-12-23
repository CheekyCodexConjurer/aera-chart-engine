# M15 PineScript Parity Design Notes

## Context
PineScript execution is host-owned; the engine only renders normalized outputs. M15 delivers a reference adapter and parity coverage tooling without importing host UI or runtime concerns.

## Decisions
- Implement a host-side adapter in `tools/pinescript` that normalizes PineScript outputs into engine series and overlay primitives.
- Enforce PineScript limits in the adapter and emit typed diagnostics for limit violations or invalid outputs.
- Parity coverage tests parse the PineScript catalog coverage docs and require every entry to be marked `covered` or `exempt` (no `planned` entries).
- Coverage status in docs reflects adapter mapping completeness, not PineScript execution fidelity.

## Non-goals
- No PineScript parser or runtime implementation.
- No host UI or workflow logic.
- No engine changes that introduce PineScript-specific behavior.

## Rationale
The adapter and parity coverage checks are contract artifacts for the engine boundary. They belong in chart-engine to keep the host/engine split explicit while providing a reference mapping and validation harness.
