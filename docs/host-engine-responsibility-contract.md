# Host and Engine Responsibility Contract

This contract is non-negotiable. The engine is a pure charting engine. The host is the workflow owner.

## Engine must NEVER do
- Fetch or cache market data.
- Own indicator execution or indicator schemas.
- Own user-facing UI state (menus, timeframes, replay state).
- Persist user preferences or user data.
- Infer hidden behavior or silently fall back.

## Host must ALWAYS do
- Provide normalized data and indicator outputs.
- Own user workflows (replay, timeframe switching, indicator toggles).
- Orchestrate data paging and history prefetch.
- Decide snapping rules and analysis workflow semantics.
- Provide UI controls and host-level overlays.
- Maintain an adapter layer that enforces `engineContractVersion` compatibility.

## Shared responsibilities (explicit interface only)
- Contract versioning and migration notes.
- Performance budgets and regression gates.
- Deterministic time domain normalization rules.
- Diagnostics and reproducibility workflow.

## Ownership boundaries (summary)
| Area | Engine ownership | Host ownership |
| --- | --- | --- |
| Time domain | Canonical domain and conversion APIs | Normalization into canonical domain |
| Data windows | View window selection and prefetch | Data supply and paging |
| Indicators | Rendering primitives only | Compute, schema, lifecycle |
| Replay | Cutoff enforcement and clipping | Playback state machine |
| Overlays | Primitive rendering and clipping | DOM overlays and UX |

## Consequences of violation
- If the engine starts owning host workflows, scope drift is declared.
- If the host bypasses engine contracts, outputs are undefined and must be rejected.
- Contract violations are treated as breaking changes.
