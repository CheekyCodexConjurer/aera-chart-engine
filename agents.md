# AGENTS

This file defines specialized agent roles, ownership boundaries, and review requirements. Each agent is accountable for correctness, performance, and observability in their domain.

## Goal
Build a GPU-first, headless charting engine for quantitative research with deterministic performance, explicit contracts, and debuggable behavior.

## Order of Precedence
1. Platform Rules
2. User Instructions
3. This AGENTS.md

## Golden Path (Workflow)
1. Identify Mode (A/B/C).
2. Read skills: `.agent-docs/SKILLS.md`, `skills.md`, and the relevant playbook; scan `skills/` for `*/SKILL.md`.
3. Plan: phased when more than one step.
4. Implement: small, measurable changes only.
5. Verify: run required checks.
6. Sync docs: update indexes and contract pages.

## Task Modes
### Mode A (Plan Only)
- Produce a plan and doc updates only.
- No code changes.

### Mode B (Implementation)
- Plan, implement, and verify.
- Update docs and tests for contract changes.

### Mode C (Report)
- Analyze and report only.
- No file changes.

## Engineering Rules
- Hard cap: 500 lines per file. Split before crossing the limit.
- Context optimization: always read `.agent-docs/architecture.md` first.
- Deterministic performance is mandatory: avoid main-thread stalls.

## Shared rules
- Every change must have a clear owning agent.
- Cross-cutting changes require explicit coordination before implementation.
- Performance budgets are owned jointly by Architecture and the relevant domain agent.
- No agent may introduce silent fallbacks or hidden behavior changes.

## Cross-agent approval triggers
- Changes to frame scheduling or render lifecycle.
- Changes to data window semantics or buffer formats.
- New interaction modes or accessibility behavior changes.
- New compute execution modes or worker boundaries.
- Public API changes or lifecycle changes.

## Review process
- Changes that affect budgets require before and after metrics.
- Contract changes require updates to the owning doc and a migration note.
- Interaction changes require explicit state machine updates.
- Rendering changes require GPU profiling evidence.

## Handoff and escalation
- If a change touches two layers, write a short design note first.
- Escalate conflicts to the Architecture Agent for resolution.
- Use explicit version bumps for cross-layer contracts.

## Coordination matrix
| Change type | Required agents |
| --- | --- |
| Render graph or shader changes | Architecture, Rendering |
| Data window or LOD contract changes | Architecture, Data Pipeline, Data/Time Semantics Curator |
| Interaction state machine changes | Architecture, Interaction, Replay Semantics Owner (if replay) |
| Worker protocol or compute changes | Architecture, Compute |
| Public API or lifecycle changes | Architecture, Integration, API and Contract Steward |
| Crosshair or hit-testing changes | Rendering, Interaction, Data Pipeline |
| Replay cutoff or time-travel changes | Architecture, Replay Semantics Owner, Interaction |
| Diagnostics or error taxonomy changes | Architecture, Diagnostics and Reproducibility |
| Overlay primitive changes | Rendering, Interaction, Overlay Semantics Owner |

## Definition of done
- Performance budgets are respected and measured.
- Contracts and docs are updated with version notes.
- Diagnostics are updated for new behavior.
- Interaction states remain complete and deterministic.
- `npm run check` passes.
- If rendering or interaction changes, `npm run test:ui:smoke` passes.
- Docs are synced.

## Definition of done for documentation changes
- Cross-links are updated and validated.
- Invariants and SLOs are referenced when relevant.
- Any new doc page includes a short rationale: why this belongs in chart-engine and not quant-lab.

## Cadence and audits
- Monthly performance budget review.
- Quarterly API stability review.
- Release checkpoints for deprecations and removals.
- Postmortems required for regressions in core budgets.


## Agent Roles
- Detailed role definitions live in `docs/agents/roles.md`.
