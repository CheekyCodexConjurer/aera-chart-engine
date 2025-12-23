# Threading Plan (Worker / OffscreenCanvas)

This spec outlines the worker and OffscreenCanvas architecture and the implemented boundary.

## Goals
- Preserve main-thread responsiveness under heavy compute and rendering.
- Define a clear boundary for data handoff and cancellation.

## Planned architecture
- Option A: Worker compute + main-thread render (baseline).
- Option B: Worker compute + OffscreenCanvas render (advanced).

## Data flow diagrams (text)
- Option A:
  - Host inputs -> main thread -> `compute_request` -> worker
  - worker -> `compute_result` -> main thread -> renderer
- Option B:
  - Host inputs -> main thread -> `compute_request` -> worker
  - worker -> `render_command` -> OffscreenCanvas renderer
  - main thread receives diagnostics + status only

## Message channels (planned)
- `compute_request`: input window, version, and payload for indicator compute.
- `compute_result`: versioned outputs with stable ids.
- `render_command`: draw command stream (option B).
- `diagnostic`: worker-side diagnostics mirrored to host.
- `control`: lifecycle and backpressure signals.

## API boundaries (implemented)
- `setWorkerAdapter(adapter, { mode? })` to register worker transport.
- `postComputeRequest({ windowId, version, payload, priority? })`.
- `cancelCompute(windowId)` to drop stale work.
- `getWorkerStatus()` to report availability and mode.
- Renderer must accept a command stream from worker without blocking UI.

**Worker status**
```
{ available: boolean, mode: "main" | "worker" | "offscreen", reason?: string }
```

## Compute request payload (planned)
```
{
  windowId: string,
  version: number,
  timeDomain: "utc-ms",
  cutoffTimeMs?: number,
  seriesInputs: [{ seriesId, type, fields, buffers }],
  overlayInputs: [{ overlayId, type, fields, buffers }],
  options?: { lodPolicy?, maxPoints?, themeVersion? }
}
```

## Compute result payload (planned)
```
{
  windowId: string,
  version: number,
  seriesOutputs: [{ seriesId, buffers, stats }],
  overlayOutputs: [{ overlayId, buffers, stats }]
}
```

## Data handoff rules
- Use transferables for compute payloads when provided; no blocking on worker.
- Render commands use structured clone to avoid detaching cached buffers.
- SharedArrayBuffer is allowed only when COOP/COEP is enabled.
- Results are versioned and tagged with `seriesId`/`overlayId`.

## Cancellation and backpressure
- Each request carries a monotonically increasing `requestId`.
- The engine drops any result with a stale `requestId`.
- Max queue depth must be bounded; overflow emits diagnostics.

## Worker message channels (implemented)
- `compute_request` -> worker, `compute_result` -> engine.
- `compute_cancel_indicator` / `compute_cancel_window` / `compute_cancel_request`.
- `render_command` for offscreen renderer (`initialize`, `resize`, `render`, `removeSeries`).
- `diagnostic` and `status` for worker-side reporting.

## Fallback policy
- If OffscreenCanvas is unavailable, fall back to main-thread renderer.
- Fallback must be explicit and surfaced via diagnostics.
 - Diagnostic codes: `worker.offscreen.unavailable`.

## References
- `../backpressure-cancellation-contract.md`
- `../indicator-engine-performance-contract.md`
