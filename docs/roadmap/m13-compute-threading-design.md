# M13 Compute + Threading Design

Rationale: worker boundaries, cancellation, and renderer isolation are engine-owned contracts; host workflow details stay in quant-lab.

## Goals
- Move indicator compute off the main thread with explicit backpressure.
- Keep worker scheduling deterministic and cancel stale work.
- Provide an optional OffscreenCanvas render path without blocking UI.

## Decisions
- Add a worker adapter interface (`WorkerAdapter`) to bridge messages.
- Implement a `WorkerComputePipeline` that enforces queue caps and cancellation.
- Use a `WorkerRenderer` bridge that posts render commands to a worker when offscreen mode is enabled.
- Default mode is `worker` (compute only); `offscreen` is opt-in and falls back with diagnostics if unsupported.

## Worker protocol (engine -> worker)
- `compute_request`: `{ request, requestId }`.
- `compute_cancel_indicator`: `{ indicatorId, version? }`.
- `compute_cancel_window`: `{ windowId }`.
- `compute_cancel_request`: `{ indicatorId, windowId, version }`.
- `render_command`: `{ type: "initialize" | "resize" | "render" | "removeSeries", ... }`.

## Worker protocol (worker -> engine)
- `compute_result`: `{ result, requestId? }`.
- `diagnostic`: `{ diagnostic }`.
- `status`: `{ status }`.

## Backpressure + cancellation
- Queue depth stays capped per indicator/series (default 2).
- Dropped requests emit diagnostics and trigger `compute_cancel_request` to the worker.
- Results are rejected deterministically if stale or canceled.

## Offscreen mode
- `setWorkerAdapter(adapter, { mode: "offscreen" })` swaps the renderer to a worker bridge.
- If `supportsOffscreenCanvas` is falsy, the engine falls back to `worker` mode with `worker.offscreen.unavailable` diagnostics.
- Render commands use structured clone (no transfers) to avoid detaching cached buffers.

## Diagnostics
- `worker.offscreen.unavailable`
- `worker.message.unknown`

## Non-goals
- No CommonJS or legacy worker shims.
- No remote or server-side compute.
- No host-specific worker bootstrapping.

## Files to touch
- `src/api/types/worker.ts`
- `src/compute/worker-pipeline.ts`
- `src/compute/worker-protocol.ts`
- `src/rendering/worker-renderer.ts`
- `src/core/engine/worker.ts`
- `src/core/chart-engine.ts`
- `docs/roadmap/threading-plan.md`
- `docs/public-api-contract.md`
- `docs/diagnostics-failure-surfaces.md`
- `docs/roadmap/contracts-and-compat.md`
- `ROADMAP.md`

## Verification
- `npm run check`
- `npm run test:contracts`
- `npm run test:public-api`
- `npm run test:compute`
- `npm run test:ui:smoke`
