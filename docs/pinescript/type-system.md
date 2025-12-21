# PineScript Type System Mapping

This document describes how PineScript types map to host outputs and engine primitives.

## Type categories
- simple: scalar values evaluated per bar.
- series: time-aligned arrays of values.
- input: user-provided configuration values.
- object types: line, box, label, table.

## Mapping rules
- series values are normalized into arrays aligned to the canonical time domain.
- simple values may be expanded to series if plotted.
- input values never reach the engine; they are resolved in the host.

## Null and na handling
- na values are represented as gaps in series outputs.
- Gaps are preserved; the engine does not interpolate by default.

## Casting and validation
- Host performs type casting and validation.
- Engine validates only numeric correctness and time ordering.
