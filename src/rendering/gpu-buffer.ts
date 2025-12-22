export class GpuBuffer {
  private capacityBytes = 0;

  upload(gl: WebGL2RenderingContext, data: Float32Array, usage?: number): void {
    if (data.byteLength === 0) return;
    const targetUsage = usage ?? gl.DYNAMIC_DRAW;
    if (data.byteLength > this.capacityBytes) {
      let nextCapacity = this.capacityBytes > 0 ? this.capacityBytes * 2 : 65536;
      if (nextCapacity < data.byteLength) {
        nextCapacity = data.byteLength;
      }
      gl.bufferData(gl.ARRAY_BUFFER, nextCapacity, targetUsage);
    this.capacityBytes = nextCapacity;
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  }

  getCapacityBytes(): number {
    return this.capacityBytes;
  }
}
