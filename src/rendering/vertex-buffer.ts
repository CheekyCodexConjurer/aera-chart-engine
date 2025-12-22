export type DrawCommand = {
  mode: number;
  first: number;
  count: number;
};

export class DynamicVertexBuffer {
  private data: Float32Array;
  private length = 0;

  constructor(private stride = 6, initialVertices = 1024) {
    this.data = new Float32Array(initialVertices * stride);
  }

  reset(): void {
    this.length = 0;
  }

  get vertexCount(): number {
    return this.length / this.stride;
  }

  get buffer(): Float32Array {
    return this.data.subarray(0, this.length);
  }

  pushVertex(x: number, y: number, r: number, g: number, b: number, a: number): void {
    this.ensureCapacity(1);
    const offset = this.length;
    this.data[offset] = x;
    this.data[offset + 1] = y;
    this.data[offset + 2] = r;
    this.data[offset + 3] = g;
    this.data[offset + 4] = b;
    this.data[offset + 5] = a;
    this.length += this.stride;
  }

  private ensureCapacity(vertices: number): void {
    const required = this.length + vertices * this.stride;
    if (required <= this.data.length) return;
    let next = this.data.length * 2;
    if (next < required) next = required;
    const resized = new Float32Array(next);
    resized.set(this.data, 0);
    this.data = resized;
  }
}
