import type { WorkerAdapter } from "../api/public-types.js";
import type { RenderFrame, Renderer } from "./renderer.js";
import type { WorkerMessage } from "../compute/worker-protocol.js";

export class WorkerRenderer implements Renderer {
  constructor(private adapter: WorkerAdapter<WorkerMessage>) {}

  initialize(): void {
    this.adapter.post({ type: "render_command", command: { type: "initialize" } });
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.adapter.post({
      type: "render_command",
      command: { type: "resize", width, height, devicePixelRatio }
    });
  }

  render(frame: RenderFrame): void {
    this.adapter.post({ type: "render_command", command: { type: "render", frame } });
  }

  removeSeries(seriesId: string): void {
    this.adapter.post({ type: "render_command", command: { type: "removeSeries", seriesId } });
  }
}
