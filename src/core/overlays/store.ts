import type { OverlayBatch, OverlayPrimitive } from "../../api/public-types.js";

export class OverlayStore {
  private batches = new Map<string, OverlayPrimitive[]>();

  setBatch(batch: OverlayBatch): void {
    this.batches.set(batch.batchId, batch.overlays);
  }

  removeBatch(batchId: string): void {
    this.batches.delete(batchId);
  }

  getAll(): OverlayPrimitive[] {
    const overlays: OverlayPrimitive[] = [];
    for (const batch of this.batches.values()) {
      overlays.push(...batch);
    }
    return overlays;
  }

  getBatches(): OverlayBatch[] {
    const batches: OverlayBatch[] = [];
    for (const [batchId, overlays] of this.batches.entries()) {
      batches.push({ batchId, overlays: overlays.map((overlay) => ({ ...overlay })) });
    }
    return batches;
  }
}
