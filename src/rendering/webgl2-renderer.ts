import { Renderer, RenderFrame } from "./renderer.js";

export type WebGL2RendererOptions = {
  onError?: (message: string) => void;
};

export class WebGL2Renderer implements Renderer {
  private gl: WebGL2RenderingContext | null = null;

  constructor(private canvas: HTMLCanvasElement, private options: WebGL2RendererOptions = {}) {}

  initialize(): void {
    this.gl = this.canvas.getContext("webgl2");
    if (!this.gl) {
      this.options.onError?.("WebGL2 context not available");
    }
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    const dpr = Math.max(1, devicePixelRatio);
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  render(_frame: RenderFrame): void {
    if (!this.gl) return;
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
}
