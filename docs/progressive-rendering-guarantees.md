# Progressive Rendering Guarantees

This document defines the coarse-to-fine rendering contract for large datasets.

## Core guarantees
- The engine may render a coarse LOD first, then refine.
- Refinement must be deterministic and stable.
- LOD transitions must not flicker.

## Refinement schedule
- Coarse render must occur within the first meaningful frame.
- Refinement occurs when compute and data are ready.
- Refinement is cancelled if the view window changes.

## Hysteresis rules
- LOD transitions require stable pixel density thresholds.
- LOD switching uses hysteresis to prevent rapid toggling.

## Diagnostics
- LOD level and transitions are observable in diagnostics.
