export type Glyph = {
  char: string;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  width: number;
  height: number;
  advance: number;
  ascent: number;
  descent: number;
};

export type GlyphAtlasOptions = {
  font?: string;
  atlasSize?: number;
  cellSize?: number;
  padding?: number;
};

export class GlyphAtlas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private texture: WebGLTexture | null = null;
  private glyphs = new Map<string, Glyph>();
  private nextIndex = 0;
  private cols: number;
  private rows: number;
  private ascent = 0;
  private descent = 0;
  private dirty = true;
  private font: string;
  private atlasSize: number;
  private cellSize: number;
  private padding: number;

  constructor(options: GlyphAtlasOptions = {}) {
    this.font = options.font ?? "12px sans-serif";
    this.atlasSize = options.atlasSize ?? 512;
    this.cellSize = options.cellSize ?? 32;
    this.padding = options.padding ?? 4;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.atlasSize;
    this.canvas.height = this.atlasSize;
    this.ctx = this.canvas.getContext("2d");
    this.cols = Math.max(1, Math.floor(this.atlasSize / this.cellSize));
    this.rows = Math.max(1, Math.floor(this.atlasSize / this.cellSize));
    this.configureContext();
    this.seedAsciiGlyphs();
  }

  initialize(gl: WebGL2RenderingContext): void {
    if (this.texture) return;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.upload(gl);
  }

  getTexture(): WebGLTexture | null {
    return this.texture;
  }

  getFontMetrics(): { ascent: number; descent: number; lineHeight: number } {
    return {
      ascent: this.ascent,
      descent: this.descent,
      lineHeight: this.ascent + this.descent
    };
  }

  getMetrics(): { pages: number; glyphs: number; capacity: number; occupancy: number } {
    const capacity = this.getCapacity();
    const glyphs = this.getGlyphCount();
    const occupancy = capacity > 0 ? glyphs / capacity : 0;
    return { pages: 1, glyphs, capacity, occupancy };
  }

  getCapacity(): number {
    return this.cols * this.rows;
  }

  getGlyphCount(): number {
    return Math.min(this.nextIndex, this.getCapacity());
  }

  hasGlyph(char: string): boolean {
    return this.glyphs.has(this.normalizeChar(char));
  }

  getGlyph(char: string): Glyph {
    const normalized = this.normalizeChar(char);
    let glyph = this.glyphs.get(normalized);
    if (!glyph) {
      glyph = this.addGlyph(normalized);
    }
    return glyph ?? this.glyphs.get("?")!;
  }

  upload(gl: WebGL2RenderingContext): void {
    if (!this.texture || !this.ctx) return;
    if (!this.dirty) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    this.dirty = false;
  }

  private configureContext(): void {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.atlasSize, this.atlasSize);
    this.ctx.font = this.font;
    this.ctx.textBaseline = "alphabetic";
    this.ctx.textAlign = "left";
    this.ctx.fillStyle = "#ffffff";
    const metrics = this.ctx.measureText("M");
    this.ascent = metrics.actualBoundingBoxAscent || 10;
    this.descent = metrics.actualBoundingBoxDescent || 4;
  }

  private normalizeChar(char: string): string {
    if (!char) return "?";
    return char[0] ?? "?";
  }

  private seedAsciiGlyphs(): void {
    for (let code = 32; code <= 126; code += 1) {
      const char = String.fromCharCode(code);
      this.addGlyph(char);
    }
    if (!this.glyphs.has("?")) {
      this.addGlyph("?");
    }
  }

  private addGlyph(char: string): Glyph | undefined {
    if (!this.ctx) return undefined;
    if (this.glyphs.has(char)) return this.glyphs.get(char)!;
    if (this.nextIndex >= this.cols * this.rows) {
      return this.glyphs.get("?");
    }
    const index = this.nextIndex;
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    const x = col * this.cellSize;
    const y = row * this.cellSize;
    this.ctx.clearRect(x, y, this.cellSize, this.cellSize);
    this.ctx.font = this.font;
    this.ctx.fillStyle = "#ffffff";
    const baseline = y + this.cellSize - this.padding;
    this.ctx.fillText(char, x + this.padding, baseline);
    const metrics = this.ctx.measureText(char);
    const width = metrics.width;
    const ascent = metrics.actualBoundingBoxAscent || this.ascent;
    const descent = metrics.actualBoundingBoxDescent || this.descent;
    const height = ascent + descent;
    const u0 = x / this.atlasSize;
    const v0 = y / this.atlasSize;
    const u1 = (x + this.cellSize) / this.atlasSize;
    const v1 = (y + this.cellSize) / this.atlasSize;
    const glyph: Glyph = {
      char,
      u0,
      v0,
      u1,
      v1,
      width,
      height,
      advance: width,
      ascent,
      descent
    };
    this.glyphs.set(char, glyph);
    this.nextIndex += 1;
    this.dirty = true;
    return glyph;
  }
}
