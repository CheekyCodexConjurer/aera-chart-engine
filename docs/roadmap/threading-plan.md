# Threading Plan (Worker / OffscreenCanvas)

This spec outlines the future worker and OffscreenCanvas architecture without adding implementation.

## Goals
- Preserve main-thread responsiveness under heavy compute and rendering.
- Define a clear boundary for data handoff and cancellation.

## Planned architecture
- Option A: Worker compute + main-thread render (baseline).
- Option B: Worker compute + OffscreenCanvas render (advanced).

## API boundaries (doc-only)
- `setWorkerAdapter(adapter)` to register worker transport.
- `postComputeRequest({ windowId, version, payload })` contract.
- `cancelCompute(windowId)` contract.
- Renderer must accept a command stream from worker without blocking UI.

## Fallback policy
- If OffscreenCanvas is unavailable, fall back to main-thread renderer.
- Fallback must be explicit and surfaced via diagnostics.

## References
- `../backpressure-cancellation-contract.md`
- `../indicator-engine-performance-contract.md`
