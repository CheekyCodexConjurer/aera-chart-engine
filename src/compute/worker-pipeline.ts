import type {
  ComputeRequest,
  ComputeResult,
  Diagnostic,
  OverlayBatch,
  WorkerAdapter,
  WorkerStatus
} from "../api/public-types.js";
import { ComputePipeline, ComputePipelineLike, type ComputeQueueDrop } from "./pipeline.js";
import type { WorkerMessage } from "./worker-protocol.js";

export type WorkerComputePipelineOptions = {
  maxPendingPerIndicator?: number;
  maxPendingPerSeries?: number;
  applyOverlays: (batch: OverlayBatch) => void;
  emitDiagnostic: (diagnostic: Diagnostic) => void;
  onStatus?: (status: WorkerStatus) => void;
};

export class WorkerComputePipeline implements ComputePipelineLike {
  private pipeline: ComputePipeline;
  private adapter: WorkerAdapter<WorkerMessage>;
  private unsubscribe: (() => void) | null = null;
  private requestId = 0;
  private emitDiagnostic: (diagnostic: Diagnostic) => void;
  private onStatus?: (status: WorkerStatus) => void;
  private disposed = false;

  constructor(adapter: WorkerAdapter<WorkerMessage>, options: WorkerComputePipelineOptions) {
    this.adapter = adapter;
    this.emitDiagnostic = options.emitDiagnostic;
    this.onStatus = options.onStatus;
    this.pipeline = new ComputePipeline({
      maxPendingPerIndicator: options.maxPendingPerIndicator,
      maxPendingPerSeries: options.maxPendingPerSeries,
      applyOverlays: options.applyOverlays,
      emitDiagnostic: options.emitDiagnostic,
      onDrop: (drop) => this.handleDrop(drop)
    });
    this.unsubscribe = this.adapter.onMessage((message) => this.handleMessage(message));
  }

  postRequest(request: ComputeRequest): void {
    this.pipeline.postRequest(request);
    const requestId = (this.requestId += 1);
    const transfer = request.transfer ?? [];
    this.adapter.post({ type: "compute_request", request, requestId }, transfer);
  }

  cancelIndicator(indicatorId: string, version?: number): void {
    this.pipeline.cancelIndicator(indicatorId, version);
    this.adapter.post({ type: "compute_cancel_indicator", indicatorId, version });
  }

  cancelWindow(windowId: string): void {
    this.pipeline.cancelWindow(windowId);
    this.adapter.post({ type: "compute_cancel_window", windowId });
  }

  applyResult(result: ComputeResult): boolean {
    return this.pipeline.applyResult(result);
  }

  getStatus(): { pendingIndicators: number; pendingSeries: number } {
    return this.pipeline.getStatus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.adapter.terminate();
  }

  private handleDrop(drop: ComputeQueueDrop): void {
    this.adapter.post({
      type: "compute_cancel_request",
      indicatorId: drop.request.indicatorId,
      windowId: drop.request.windowId,
      version: drop.request.version
    });
  }

  private handleMessage(message: WorkerMessage): void {
    switch (message.type) {
      case "compute_result":
        this.pipeline.applyResult(message.result);
        return;
      case "diagnostic":
        this.emitDiagnostic(message.diagnostic);
        return;
      case "status":
        this.onStatus?.(message.status);
        return;
      default:
        this.emitDiagnostic({
          code: "worker.message.unknown",
          message: "worker message not recognized",
          severity: "warn",
          recoverable: true,
          context: {
            type: (message as { type?: string }).type ?? "unknown"
          }
        });
    }
  }
}
