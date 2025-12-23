import { Diagnostic, RendererMetrics } from "../api/public-types.js";
import { RenderFrame, Renderer } from "./renderer.js";

export class NullRenderer implements Renderer {
  private lastFrame: RenderFrame | null = null;

  render(frame: RenderFrame): void {
    this.lastFrame = frame;
  }

  removeSeries(_seriesId: string): void {}

  setDiagnostics(_handler: (diag: Diagnostic) => void): void {}

  getMetrics(): RendererMetrics {
    return {
      frameCount: 0,
      lastFrame: {
        drawCalls: 0,
        batchCount: 0,
        stateChanges: 0,
        bufferUploads: 0,
        bufferAllocations: 0,
        bufferBytes: 0,
        bufferReuses: 0
      },
      totals: {
        drawCalls: 0,
        batchCount: 0,
        stateChanges: 0,
        bufferUploads: 0,
        bufferAllocations: 0,
        bufferBytes: 0,
        bufferReuses: 0
      },
      textAtlas: { pages: 0, glyphs: 0, capacity: 0, occupancy: 0, evictions: 0 }
    };
  }

  getLastFrame(): RenderFrame | null {
    return this.lastFrame;
  }
}
