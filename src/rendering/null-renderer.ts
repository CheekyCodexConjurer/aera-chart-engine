import { RenderFrame, Renderer } from "./renderer.js";

export class NullRenderer implements Renderer {
  private lastFrame: RenderFrame | null = null;

  render(frame: RenderFrame): void {
    this.lastFrame = frame;
  }

  getLastFrame(): RenderFrame | null {
    return this.lastFrame;
  }
}
