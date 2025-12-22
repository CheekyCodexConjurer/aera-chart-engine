# Multithreading in the Browser (Workers, OffscreenCanvas)

## Why it matters
- The main thread must never block during interaction.
- Compute and rendering must be isolated and predictable.
- Worker boundaries define latency and determinism.

## What good looks like
- Uses Workers for indicators and heavy transforms.
- Uses OffscreenCanvas where it improves isolation and throughput.
- Defines stable, versioned data handoff contracts.
- Cancels stale work and enforces backpressure.
- Keeps worker scheduling deterministic under load.

## Scope boundaries
- Includes Worker protocols, OffscreenCanvas usage, and cancellation.
- Includes data transfer and shared buffer patterns.
- Excludes server-side compute or remote execution.
- Includes scheduling fairness across panes and indicators.

## Evidence and artifacts
- Worker timing traces with queue depth metrics.
- Data handoff format specification and versioning notes.
- Demonstrated main-thread responsiveness under load.
- Cancellation and backpressure test outputs.

## Review questions
- Does any path block the main thread during interaction?
- Are data transfers zero-copy where possible?
- Is ordering deterministic under rapid updates?
- Is stale work cancelled without leaks?

## Common failure modes
- Blocking on Worker results in the render loop.
- Excessive structured cloning or data copies.
- Worker and main thread drift leading to stale results.
