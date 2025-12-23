import type { GpuBuffer } from "../gpu-buffer.js";
import type { RenderSeries } from "../renderer.js";

export type LineBuffer = {
  buffer: WebGLBuffer;
  uploader: GpuBuffer;
  count: number;
  stride: number;
  data: Float32Array;
};

export type LineData = {
  data: Float32Array;
  count: number;
};

export type BufferRebuildContext = {
  seriesId: string;
  buffer: string;
};

export type InstanceBuffer = {
  buffer: WebGLBuffer;
  uploader: GpuBuffer;
  count: number;
  stride: number;
  data: Float32Array;
};

export type InstanceData = {
  data: Float32Array;
  count: number;
  stride: number;
};

export type CandleBuffers = {
  wickUp: LineBuffer | null;
  wickDown: LineBuffer | null;
  body: InstanceBuffer | null;
};

export type SeriesGpuEntry = {
  seriesRef: RenderSeries;
  gpuBytes?: number;
  line?: LineBuffer | null;
  area?: LineBuffer | null;
  histogram?: InstanceBuffer | null;
  candles?: CandleBuffers | null;
};

export type LineProgramInfo = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  attribs: {
    timeHigh: number;
    timeLow: number;
    value: number;
    side: number;
  };
  uniforms: {
    rangeStartHigh: WebGLUniformLocation;
    rangeStartLow: WebGLUniformLocation;
    rangeEndHigh: WebGLUniformLocation;
    rangeEndLow: WebGLUniformLocation;
    domainMin: WebGLUniformLocation;
    domainMax: WebGLUniformLocation;
    plotOrigin: WebGLUniformLocation;
    plotSize: WebGLUniformLocation;
    viewport: WebGLUniformLocation;
    color: WebGLUniformLocation;
    baseValue: WebGLUniformLocation;
    useBase: WebGLUniformLocation;
  };
};

export type QuadProgramInfo = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  attribs: {
    corner: number;
    timeHigh: number;
    timeLow: number;
    value0: number;
    value1: number;
    color: number;
  };
  uniforms: {
    rangeStartHigh: WebGLUniformLocation;
    rangeStartLow: WebGLUniformLocation;
    rangeEndHigh: WebGLUniformLocation;
    rangeEndLow: WebGLUniformLocation;
    domainMin: WebGLUniformLocation;
    domainMax: WebGLUniformLocation;
    plotOrigin: WebGLUniformLocation;
    plotSize: WebGLUniformLocation;
    viewport: WebGLUniformLocation;
    halfWidth: WebGLUniformLocation;
    colorUp: WebGLUniformLocation;
    colorDown: WebGLUniformLocation;
  };
};

export type BarProgramInfo = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  attribs: {
    corner: number;
    timeHigh: number;
    timeLow: number;
    value: number;
    color: number;
  };
  uniforms: {
    rangeStartHigh: WebGLUniformLocation;
    rangeStartLow: WebGLUniformLocation;
    rangeEndHigh: WebGLUniformLocation;
    rangeEndLow: WebGLUniformLocation;
    domainMin: WebGLUniformLocation;
    domainMax: WebGLUniformLocation;
    plotOrigin: WebGLUniformLocation;
    plotSize: WebGLUniformLocation;
    viewport: WebGLUniformLocation;
    halfWidth: WebGLUniformLocation;
    baseValue: WebGLUniformLocation;
  };
};

export type LabelMetrics = {
  width: number;
  height: number;
  ascent: number;
  descent: number;
};
