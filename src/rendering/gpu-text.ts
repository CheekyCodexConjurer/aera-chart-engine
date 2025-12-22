import { GlyphAtlas } from "./glyph-atlas.js";
import { parseColor } from "./color.js";
import { TextLabel } from "./text-layer.js";

type TextMetrics = {
  width: number;
  ascent: number;
  descent: number;
  height: number;
};

export type GpuTextRendererOptions = {
  font?: string;
  atlasSize?: number;
  cellSize?: number;
  padding?: number;
};

export class GpuTextRenderer {
  private atlas: GlyphAtlas;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private vertexData = new Float32Array(0);
  private vertexCount = 0;
  private width = 1;
  private height = 1;

  constructor(private gl: WebGL2RenderingContext, options: GpuTextRendererOptions = {}) {
    this.atlas = new GlyphAtlas({
      font: options.font,
      atlasSize: options.atlasSize,
      cellSize: options.cellSize,
      padding: options.padding
    });
    this.initialize();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  measureText(text: string): TextMetrics {
    const metrics = this.atlas.getFontMetrics();
    let width = 0;
    for (let i = 0; i < text.length; i += 1) {
      const glyph = this.atlas.getGlyph(text[i]);
      width += glyph.advance;
    }
    return {
      width,
      ascent: metrics.ascent,
      descent: metrics.descent,
      height: metrics.lineHeight
    };
  }

  render(labels: TextLabel[]): void {
    if (!this.program || !this.vao || !this.vbo) return;
    if (labels.length === 0) return;
    this.ensureCapacity(labels);
    this.vertexCount = 0;
    for (const label of labels) {
      this.appendLabel(label);
    }
    if (this.vertexCount === 0) return;
    this.atlas.upload(this.gl);
    this.gl.useProgram(this.program);
    this.gl.bindVertexArray(this.vao);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, this.vertexCount * 8));
    const viewportLocation = this.gl.getUniformLocation(this.program, "u_viewport");
    this.gl.uniform2f(viewportLocation, this.width, this.height);
    const texture = this.atlas.getTexture();
    if (texture) {
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      const samplerLocation = this.gl.getUniformLocation(this.program, "u_sampler");
      this.gl.uniform1i(samplerLocation, 0);
    }
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertexCount);
    this.gl.bindVertexArray(null);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }

  private initialize(): void {
    const program = createProgram(this.gl, TEXT_VERT, TEXT_FRAG);
    if (!program) return;
    this.program = program;
    this.vao = this.gl.createVertexArray();
    this.vbo = this.gl.createBuffer();
    if (!this.vao || !this.vbo) return;
    this.atlas.initialize(this.gl);
    this.gl.bindVertexArray(this.vao);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, 1024, this.gl.DYNAMIC_DRAW);
    const stride = 8 * Float32Array.BYTES_PER_ELEMENT;
    const posLoc = this.gl.getAttribLocation(program, "a_position");
    const uvLoc = this.gl.getAttribLocation(program, "a_uv");
    const colorLoc = this.gl.getAttribLocation(program, "a_color");
    this.gl.enableVertexAttribArray(posLoc);
    this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, stride, 0);
    this.gl.enableVertexAttribArray(uvLoc);
    this.gl.vertexAttribPointer(uvLoc, 2, this.gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
    this.gl.enableVertexAttribArray(colorLoc);
    this.gl.vertexAttribPointer(colorLoc, 4, this.gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
    this.gl.bindVertexArray(null);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }

  private ensureCapacity(labels: TextLabel[]): void {
    let requiredVertices = 0;
    for (const label of labels) {
      requiredVertices += label.text.length * 6;
    }
    const requiredFloats = requiredVertices * 8;
    if (this.vertexData.length < requiredFloats) {
      this.vertexData = new Float32Array(requiredFloats * 2);
      if (this.vbo) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertexData.byteLength, this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
      }
    }
  }

  private appendLabel(label: TextLabel): void {
    const text = label.text ?? "";
    if (!text) return;
    const metrics = this.measureText(text);
    let x = label.x;
    if (label.align === "center") {
      x -= metrics.width / 2;
    } else if (label.align === "right" || label.align === "end") {
      x -= metrics.width;
    }
    let baseline = label.y;
    switch (label.baseline) {
      case "top":
        baseline = label.y + metrics.ascent;
        break;
      case "bottom":
        baseline = label.y - metrics.descent;
        break;
      case "middle":
        baseline = label.y + metrics.ascent - metrics.height / 2;
        break;
      default:
        baseline = label.y;
        break;
    }
    const color = parseColor(label.color, [1, 1, 1, 1]);
    let penX = x;
    for (let i = 0; i < text.length; i += 1) {
      const glyph = this.atlas.getGlyph(text[i]);
      const gx = penX;
      const gy = baseline - glyph.ascent;
      const x0 = gx;
      const y0 = gy;
      const x1 = gx + glyph.width;
      const y1 = gy + glyph.height;
      this.pushQuad(x0, y0, x1, y1, glyph.u0, glyph.v0, glyph.u1, glyph.v1, color);
      penX += glyph.advance;
    }
  }

  private pushQuad(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    color: [number, number, number, number]
  ): void {
    const data = this.vertexData;
    let offset = this.vertexCount * 8;
    // Triangle 1
    data[offset++] = x0;
    data[offset++] = y0;
    data[offset++] = u0;
    data[offset++] = v0;
    data[offset++] = color[0];
    data[offset++] = color[1];
    data[offset++] = color[2];
    data[offset++] = color[3];
    data[offset++] = x1;
    data[offset++] = y0;
    data[offset++] = u1;
    data[offset++] = v0;
    data[offset++] = color[0];
    data[offset++] = color[1];
    data[offset++] = color[2];
    data[offset++] = color[3];
    data[offset++] = x1;
    data[offset++] = y1;
    data[offset++] = u1;
    data[offset++] = v1;
    data[offset++] = color[0];
    data[offset++] = color[1];
    data[offset++] = color[2];
    data[offset++] = color[3];
    // Triangle 2
    data[offset++] = x0;
    data[offset++] = y0;
    data[offset++] = u0;
    data[offset++] = v0;
    data[offset++] = color[0];
    data[offset++] = color[1];
    data[offset++] = color[2];
    data[offset++] = color[3];
    data[offset++] = x1;
    data[offset++] = y1;
    data[offset++] = u1;
    data[offset++] = v1;
    data[offset++] = color[0];
    data[offset++] = color[1];
    data[offset++] = color[2];
    data[offset++] = color[3];
    data[offset++] = x0;
    data[offset++] = y1;
    data[offset++] = u0;
    data[offset++] = v1;
    data[offset++] = color[0];
    data[offset++] = color[1];
    data[offset++] = color[2];
    data[offset++] = color[3];
    this.vertexCount += 6;
  }
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram | null {
  const vert = gl.createShader(gl.VERTEX_SHADER);
  const frag = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vert || !frag) return null;
  gl.shaderSource(vert, vertexSource);
  gl.shaderSource(frag, fragmentSource);
  gl.compileShader(vert);
  gl.compileShader(frag);
  if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS) || !gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null;
  }
  return program;
}

const TEXT_VERT = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
in vec4 a_color;
out vec2 v_uv;
out vec4 v_color;
uniform vec2 u_viewport;
void main() {
  vec2 ndc = vec2((a_position.x / u_viewport.x) * 2.0 - 1.0, 1.0 - (a_position.y / u_viewport.y) * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

const TEXT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_sampler;
out vec4 outColor;
void main() {
  float alpha = texture(u_sampler, v_uv).a;
  outColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;
