export type TextLabel = {
  x: number;
  y: number;
  text: string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  background?: string;
  padding?: number;
};

export interface TextLayer {
  resize(width: number, height: number, devicePixelRatio: number): void;
  clear(): void;
  drawLabel(label: TextLabel): void;
}

export type CanvasTextLayerOptions = {
  font?: string;
  color?: string;
  background?: string;
  padding?: number;
};

export class CanvasTextLayer implements TextLayer {
  private ctx: CanvasRenderingContext2D | null;
  private font: string;
  private color: string;
  private background: string | undefined;
  private padding: number;
  private width = 0;
  private height = 0;

  constructor(private canvas: HTMLCanvasElement, options: CanvasTextLayerOptions = {}) {
    this.ctx = canvas.getContext("2d");
    this.font = options.font ?? "12px sans-serif";
    this.color = options.color ?? "#ffffff";
    this.background = options.background;
    this.padding = options.padding ?? 4;
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    if (!this.ctx) return;
    this.width = width;
    this.height = height;
    const dpr = Math.max(1, devicePixelRatio);
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.font = this.font;
  }

  clear(): void {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  drawLabel(label: TextLabel): void {
    if (!this.ctx) return;
    const padding = label.padding ?? this.padding;
    const color = label.color ?? this.color;
    this.ctx.font = this.font;
    this.ctx.textAlign = label.align ?? "left";
    this.ctx.textBaseline = label.baseline ?? "middle";
    if (label.background ?? this.background) {
      const metrics = this.ctx.measureText(label.text);
      const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      const width = metrics.width;
      const x = label.x - padding;
      const y = label.y - height / 2 - padding;
      this.ctx.fillStyle = label.background ?? this.background ?? "rgba(0,0,0,0.6)";
      this.ctx.fillRect(x, y, width + padding * 2, height + padding * 2);
    }
    this.ctx.fillStyle = color;
    this.ctx.fillText(label.text, label.x, label.y);
  }
}
