# Main Thread Blocking Budget

This document defines what is allowed on the main thread during interaction.

## Budget rule
- Main-thread blocking during interaction is effectively 0 ms.
- Any synchronous task over 1 ms must be explicitly justified and measured.

## Allowed during interaction
- Transform updates and matrix math.
- Dirty-flag scheduling and render graph selection.
- Small buffer updates for overlays only.

## Disallowed during interaction
- Sorting or reordering large datasets.
- Allocating or copying large arrays.
- Parsing timestamps or constructing new data structures.
- LOD recomputation for large series.

## Required documentation
- Any unavoidable main-thread work must include:
  - Worst-case bounds.
  - Benchmark evidence.
  - Mitigation plan for spikes.
