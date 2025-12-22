# Quant-Lab Interop Skill

## Why it matters
- The engine must integrate tightly without copying host responsibilities.
- Adapter boundaries are the primary source of integration bugs.

## What good looks like
- Clear mapping from Plot API outputs to engine primitives.
- Explicit division of responsibilities between host and engine.
- Replay cutoff propagation is documented end-to-end.

## Scope boundaries
- Includes adapter mapping and data transformation responsibilities.
- Excludes host UI components, menus, and layout systems.
- Explicitly forbids importing quant-lab UI concepts into engine docs.

## Evidence and artifacts
- Mapping table from Plot API to engine primitives.
- Integration notes that reference only contracts, not host internals.
- Replay cutoff propagation description.

## Review questions
- Is the boundary between host and engine explicit?
- Are mappings documented without host-specific UI coupling?
- Does replay cutoff propagate to overlays deterministically?

## Common failure modes
- Copying host UI concepts into engine scope.
- Implicit transformations that hide host responsibilities.
- Indicator-specific behavior baked into engine docs.
