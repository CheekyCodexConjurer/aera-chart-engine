# Aera Chart Engine

GPU-first, headless charting engine for quantitative research workloads.

## What this is
- A deterministic, debuggable rendering and interaction core for large datasets.
- A local-first engine optimized for WebGL2 and modern Chromium.
- A contract-first system built for long-lived quant workflows.

## What this is not
- Not a UI product, marketing widget, or dashboard framework.
- Not a data fetching or storage system.
- Not an indicator execution engine.
- Not a host application or workflow orchestrator.

## Boundary matrix (quant-lab vs aera-chart-engine)
| Capability | quant-lab | aera-chart-engine |
| --- | --- | --- |
| Data fetching | Owns sources, paging, cache policy | Consumes provided data, requests windows only |
| Indicator execution | Owns compute and schemas | Renders indicator outputs only |
| UI controls | Owns menus, panels, replay UX | Exposes hooks, no UI state |
| Rendering | Integrates host surfaces | Owns WebGL2 render pipeline |
| Interaction | Owns workflow state (replay, mode) | Owns pointer/keyboard state machine |
| Coordinate transforms | Uses conversion APIs | Defines time/price to screen transforms |
| Overlays | Owns DOM overlays and tables | Owns primitive overlay rendering |

## Integration intent (tight coordination, no coupling)
- The repos coordinate on contracts and versioning, not shared code.
- `quant-lab` remains the host and owns UX, data, and indicator logic.
- `aera-chart-engine` remains a pure engine with explicit contracts.

## Where to start
- `architecture.md` for the overview.
- `docs/INDEX.md` for the full documentation map.
- `docs/host-engine-responsibility-contract.md` for the non-negotiable boundary.
