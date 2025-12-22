import { ComputeRequest, ComputeResult, Diagnostic, OverlayBatch } from "../api/public-types.js";

export type ComputePipelineOptions = {
  maxPendingPerIndicator?: number;
  maxPendingPerSeries?: number;
  applyOverlays?: (batch: OverlayBatch) => void;
  emitDiagnostic?: (diagnostic: Diagnostic) => void;
};

export class ComputePipeline {
  private pendingByIndicator = new Map<string, ComputeRequest[]>();
  private pendingBySeries = new Map<string, ComputeRequest[]>();
  private latestRequested = new Map<string, number>();
  private latestApplied = new Map<string, number>();
  private canceledIndicators = new Map<string, number>();
  private canceledWindows = new Set<string>();
  private maxPendingPerIndicator: number;
  private maxPendingPerSeries: number;
  private applyOverlays?: (batch: OverlayBatch) => void;
  private emitDiagnostic?: (diagnostic: Diagnostic) => void;

  constructor(options: ComputePipelineOptions = {}) {
    this.maxPendingPerIndicator = Math.max(1, options.maxPendingPerIndicator ?? 2);
    this.maxPendingPerSeries = Math.max(1, options.maxPendingPerSeries ?? 2);
    this.applyOverlays = options.applyOverlays;
    this.emitDiagnostic = options.emitDiagnostic;
  }

  postRequest(request: ComputeRequest): void {
    this.latestRequested.set(request.indicatorId, request.version);
    this.enqueue(request.indicatorId, request, this.pendingByIndicator, this.maxPendingPerIndicator, "indicator");
    if (request.seriesId) {
      this.enqueue(request.seriesId, request, this.pendingBySeries, this.maxPendingPerSeries, "series");
    }
  }

  cancelIndicator(indicatorId: string, version?: number): void {
    const cancelVersion = version ?? Number.MAX_SAFE_INTEGER;
    this.canceledIndicators.set(indicatorId, cancelVersion);
    this.pendingByIndicator.delete(indicatorId);
    this.emitDiagnosticEvent("compute.request.canceled", "compute requests canceled", "info", {
      indicatorId,
      version: version ?? "all"
    });
  }

  cancelWindow(windowId: string): void {
    this.canceledWindows.add(windowId);
    this.emitDiagnosticEvent("compute.request.canceled", "compute requests canceled", "info", {
      windowId
    });
  }

  applyResult(result: ComputeResult): boolean {
    this.removePending(result.indicatorId, result.version, this.pendingByIndicator);
    if (result.seriesId) {
      this.removePending(result.seriesId, result.version, this.pendingBySeries);
    }

    if (this.canceledWindows.has(result.windowId)) {
      this.emitDiagnosticEvent("compute.result.canceled", "compute result dropped for canceled window", "warn", {
        indicatorId: result.indicatorId,
        windowId: result.windowId,
        version: result.version
      });
      return false;
    }
    const canceledVersion = this.canceledIndicators.get(result.indicatorId);
    if (canceledVersion !== undefined && result.version <= canceledVersion) {
      this.emitDiagnosticEvent("compute.result.canceled", "compute result dropped for canceled indicator", "warn", {
        indicatorId: result.indicatorId,
        version: result.version
      });
      return false;
    }

    const latestRequested = this.latestRequested.get(result.indicatorId);
    if (latestRequested !== undefined && result.version < latestRequested) {
      this.emitDiagnosticEvent("compute.result.stale", "compute result dropped as stale", "warn", {
        indicatorId: result.indicatorId,
        version: result.version,
        latestRequested
      });
      return false;
    }

    if (latestRequested !== undefined && result.version > latestRequested) {
      this.emitDiagnosticEvent("compute.result.untracked", "compute result version is newer than latest request", "warn", {
        indicatorId: result.indicatorId,
        version: result.version,
        latestRequested
      });
      return false;
    }

    const lastApplied = this.latestApplied.get(result.indicatorId);
    if (lastApplied !== undefined && result.version <= lastApplied) {
      this.emitDiagnosticEvent("compute.result.stale", "compute result dropped as stale", "warn", {
        indicatorId: result.indicatorId,
        version: result.version,
        lastApplied
      });
      return false;
    }

    this.latestApplied.set(result.indicatorId, result.version);
    if (this.applyOverlays) {
      this.applyOverlays(result.batch);
    }
    return true;
  }

  getStatus(): { pendingIndicators: number; pendingSeries: number } {
    return {
      pendingIndicators: this.pendingByIndicator.size,
      pendingSeries: this.pendingBySeries.size
    };
  }

  private enqueue(
    key: string,
    request: ComputeRequest,
    map: Map<string, ComputeRequest[]>,
    maxPending: number,
    scope: "indicator" | "series"
  ): void {
    const queue = map.get(key) ?? [];
    queue.push(request);
    if (queue.length > maxPending) {
      const dropped = queue.shift();
      if (dropped) {
        this.emitDiagnosticEvent("compute.queue.overrun", "compute queue exceeded max depth", "warn", {
          scope,
          key,
          maxPending,
          droppedVersion: dropped.version
        });
      }
    }
    map.set(key, queue);
  }

  private removePending(key: string, version: number, map: Map<string, ComputeRequest[]>): void {
    const queue = map.get(key);
    if (!queue) return;
    const filtered = queue.filter((request) => request.version !== version);
    if (filtered.length === 0) {
      map.delete(key);
    } else {
      map.set(key, filtered);
    }
  }

  private emitDiagnosticEvent(
    code: string,
    message: string,
    severity: Diagnostic["severity"],
    context: Record<string, unknown>
  ): void {
    this.emitDiagnostic?.({
      code,
      message,
      severity,
      recoverable: severity !== "fatal",
      context
    });
  }
}
