# PineScript Execution Model (Host-Owned)

This document maps PineScript execution semantics to the host runtime and defines what the engine expects to receive.

## Core execution semantics
- Scripts execute once per bar in historical mode.
- Real-time mode may execute multiple times per bar when calc_on_every_tick is enabled.
- barstate flags (isfirst, islast, isrealtime) are host-owned and never inferred by the engine.

## Stateful variables
- var: initialized once and persisted across bars.
- varip: initialized once and updated intra-bar; state snapshots are host-owned.
- The engine does not store or infer PineScript state.

## Historical vs realtime
- Historical outputs are treated as immutable snapshots.
- Realtime outputs may update the last bar; host must mark update type (append vs patch).

## Replay alignment
- Replay cutoff must be enforced by the engine on all outputs.
- Host controls playback state and bar progression.
- Any intra-bar preview remains a host concern; engine only clips by cutoff.

## Required host outputs
- Canonical time domain: UTC epoch milliseconds.
- Stable ids for plots and objects.
- Explicit update type for each output batch.
