import { Diagnostic } from "../api/public-types.js";
import { RenderFrame, Renderer } from "./renderer.js";

export class NullRenderer implements Renderer {
  private lastFrame: RenderFrame | null = null;

  render(frame: RenderFrame): void {
    this.lastFrame = frame;
  }

  removeSeries(_seriesId: string): void {}

  setDiagnostics(_handler: (diag: Diagnostic) => void): void {}

  getLastFrame(): RenderFrame | null {
    return this.lastFrame;
  }
}
