import type { BarProgramInfo, LineProgramInfo, QuadProgramInfo } from "./state.js";

export function splitFloat64(value: number): [number, number] {
  const high = Math.fround(value);
  const low = value - high;
  return [high, low];
}

export function createLineProgramInfo(gl: WebGL2RenderingContext, program: WebGLProgram): LineProgramInfo {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("Failed to allocate line VAO");
  }
  gl.bindVertexArray(vao);
  const timeHigh = gl.getAttribLocation(program, "a_timeHigh");
  const timeLow = gl.getAttribLocation(program, "a_timeLow");
  const value = gl.getAttribLocation(program, "a_value");
  const side = gl.getAttribLocation(program, "a_side");
  gl.enableVertexAttribArray(timeHigh);
  gl.enableVertexAttribArray(timeLow);
  gl.enableVertexAttribArray(value);
  gl.enableVertexAttribArray(side);
  gl.bindVertexArray(null);
  return {
    program,
    vao,
    attribs: { timeHigh, timeLow, value, side },
    uniforms: {
      rangeStartHigh: gl.getUniformLocation(program, "u_rangeStartHigh")!,
      rangeStartLow: gl.getUniformLocation(program, "u_rangeStartLow")!,
      rangeEndHigh: gl.getUniformLocation(program, "u_rangeEndHigh")!,
      rangeEndLow: gl.getUniformLocation(program, "u_rangeEndLow")!,
      domainMin: gl.getUniformLocation(program, "u_domainMin")!,
      domainMax: gl.getUniformLocation(program, "u_domainMax")!,
      plotOrigin: gl.getUniformLocation(program, "u_plotOrigin")!,
      plotSize: gl.getUniformLocation(program, "u_plotSize")!,
      viewport: gl.getUniformLocation(program, "u_viewport")!,
      color: gl.getUniformLocation(program, "u_color")!,
      baseValue: gl.getUniformLocation(program, "u_baseValue")!,
      useBase: gl.getUniformLocation(program, "u_useBase")!
    }
  };
}

export function createQuadProgramInfo(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  cornerBuffer: WebGLBuffer,
  indexBuffer: WebGLBuffer
): QuadProgramInfo {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("Failed to allocate quad VAO");
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  const corner = gl.getAttribLocation(program, "a_corner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(corner, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  const timeHigh = gl.getAttribLocation(program, "a_timeHigh");
  const timeLow = gl.getAttribLocation(program, "a_timeLow");
  const value0 = gl.getAttribLocation(program, "a_value0");
  const value1 = gl.getAttribLocation(program, "a_value1");
  const color = gl.getAttribLocation(program, "a_color");
  gl.enableVertexAttribArray(timeHigh);
  gl.enableVertexAttribArray(timeLow);
  gl.enableVertexAttribArray(value0);
  gl.enableVertexAttribArray(value1);
  gl.enableVertexAttribArray(color);
  gl.bindVertexArray(null);
  return {
    program,
    vao,
    attribs: { corner, timeHigh, timeLow, value0, value1, color },
    uniforms: {
      rangeStartHigh: gl.getUniformLocation(program, "u_rangeStartHigh")!,
      rangeStartLow: gl.getUniformLocation(program, "u_rangeStartLow")!,
      rangeEndHigh: gl.getUniformLocation(program, "u_rangeEndHigh")!,
      rangeEndLow: gl.getUniformLocation(program, "u_rangeEndLow")!,
      domainMin: gl.getUniformLocation(program, "u_domainMin")!,
      domainMax: gl.getUniformLocation(program, "u_domainMax")!,
      plotOrigin: gl.getUniformLocation(program, "u_plotOrigin")!,
      plotSize: gl.getUniformLocation(program, "u_plotSize")!,
      viewport: gl.getUniformLocation(program, "u_viewport")!,
      halfWidth: gl.getUniformLocation(program, "u_halfWidth")!
    }
  };
}

export function createBarProgramInfo(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  cornerBuffer: WebGLBuffer,
  indexBuffer: WebGLBuffer
): BarProgramInfo {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("Failed to allocate bar VAO");
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  const corner = gl.getAttribLocation(program, "a_corner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(corner, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  const timeHigh = gl.getAttribLocation(program, "a_timeHigh");
  const timeLow = gl.getAttribLocation(program, "a_timeLow");
  const value = gl.getAttribLocation(program, "a_value");
  const color = gl.getAttribLocation(program, "a_color");
  gl.enableVertexAttribArray(timeHigh);
  gl.enableVertexAttribArray(timeLow);
  gl.enableVertexAttribArray(value);
  gl.enableVertexAttribArray(color);
  gl.bindVertexArray(null);
  return {
    program,
    vao,
    attribs: { corner, timeHigh, timeLow, value, color },
    uniforms: {
      rangeStartHigh: gl.getUniformLocation(program, "u_rangeStartHigh")!,
      rangeStartLow: gl.getUniformLocation(program, "u_rangeStartLow")!,
      rangeEndHigh: gl.getUniformLocation(program, "u_rangeEndHigh")!,
      rangeEndLow: gl.getUniformLocation(program, "u_rangeEndLow")!,
      domainMin: gl.getUniformLocation(program, "u_domainMin")!,
      domainMax: gl.getUniformLocation(program, "u_domainMax")!,
      plotOrigin: gl.getUniformLocation(program, "u_plotOrigin")!,
      plotSize: gl.getUniformLocation(program, "u_plotSize")!,
      viewport: gl.getUniformLocation(program, "u_viewport")!,
      halfWidth: gl.getUniformLocation(program, "u_halfWidth")!,
      baseValue: gl.getUniformLocation(program, "u_baseValue")!
    }
  };
}

export const VERT_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec4 a_color;
out vec4 v_color;
void main() {
  v_color = a_color;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FRAG_SHADER_SOURCE = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;

export const SERIES_LINE_VERT = `#version 300 es
in float a_timeHigh;
in float a_timeLow;
in float a_value;
in float a_side;
uniform float u_rangeStartHigh;
uniform float u_rangeStartLow;
uniform float u_rangeEndHigh;
uniform float u_rangeEndLow;
uniform float u_domainMin;
uniform float u_domainMax;
uniform vec2 u_plotOrigin;
uniform vec2 u_plotSize;
uniform vec2 u_viewport;
uniform float u_baseValue;
uniform float u_useBase;
uniform vec4 u_color;
out vec4 v_color;

float combineTime(float high, float low) {
  return high + low;
}

void main() {
  float time = combineTime(a_timeHigh, a_timeLow);
  float rangeStart = combineTime(u_rangeStartHigh, u_rangeStartLow);
  float rangeEnd = combineTime(u_rangeEndHigh, u_rangeEndLow);
  float t = (time - rangeStart) / (rangeEnd - rangeStart);
  float value = mix(a_value, u_baseValue, a_side * u_useBase);
  float v = (value - u_domainMin) / (u_domainMax - u_domainMin);
  float x = u_plotOrigin.x + t * u_plotSize.x;
  float y = u_plotOrigin.y + u_plotSize.y - clamp(v, 0.0, 1.0) * u_plotSize.y;
  vec2 ndc = vec2((x / u_viewport.x) * 2.0 - 1.0, 1.0 - (y / u_viewport.y) * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_color = u_color;
}
`;

export const SERIES_LINE_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;

export const SERIES_QUAD_VERT = `#version 300 es
in vec2 a_corner;
in float a_timeHigh;
in float a_timeLow;
in float a_value0;
in float a_value1;
in vec4 a_color;
uniform float u_rangeStartHigh;
uniform float u_rangeStartLow;
uniform float u_rangeEndHigh;
uniform float u_rangeEndLow;
uniform float u_domainMin;
uniform float u_domainMax;
uniform vec2 u_plotOrigin;
uniform vec2 u_plotSize;
uniform vec2 u_viewport;
uniform float u_halfWidth;
out vec4 v_color;

float combineTime(float high, float low) {
  return high + low;
}

void main() {
  float time = combineTime(a_timeHigh, a_timeLow);
  float rangeStart = combineTime(u_rangeStartHigh, u_rangeStartLow);
  float rangeEnd = combineTime(u_rangeEndHigh, u_rangeEndLow);
  float t = (time - rangeStart) / (rangeEnd - rangeStart);
  float minValue = min(a_value0, a_value1);
  float maxValue = max(a_value0, a_value1);
  float mixValue = (a_corner.y + 0.5);
  float value = mix(minValue, maxValue, mixValue);
  float v = (value - u_domainMin) / (u_domainMax - u_domainMin);
  float x = u_plotOrigin.x + t * u_plotSize.x + a_corner.x * u_halfWidth * u_plotSize.x / (rangeEnd - rangeStart);
  float y = u_plotOrigin.y + u_plotSize.y - clamp(v, 0.0, 1.0) * u_plotSize.y;
  vec2 ndc = vec2((x / u_viewport.x) * 2.0 - 1.0, 1.0 - (y / u_viewport.y) * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_color = a_color;
}
`;

export const SERIES_QUAD_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;

export const SERIES_BAR_VERT = `#version 300 es
in vec2 a_corner;
in float a_timeHigh;
in float a_timeLow;
in float a_value;
in vec4 a_color;
uniform float u_rangeStartHigh;
uniform float u_rangeStartLow;
uniform float u_rangeEndHigh;
uniform float u_rangeEndLow;
uniform float u_domainMin;
uniform float u_domainMax;
uniform vec2 u_plotOrigin;
uniform vec2 u_plotSize;
uniform vec2 u_viewport;
uniform float u_halfWidth;
uniform float u_baseValue;
out vec4 v_color;

float combineTime(float high, float low) {
  return high + low;
}

void main() {
  float time = combineTime(a_timeHigh, a_timeLow);
  float rangeStart = combineTime(u_rangeStartHigh, u_rangeStartLow);
  float rangeEnd = combineTime(u_rangeEndHigh, u_rangeEndLow);
  float t = (time - rangeStart) / (rangeEnd - rangeStart);
  float minValue = min(a_value, u_baseValue);
  float maxValue = max(a_value, u_baseValue);
  float mixValue = (a_corner.y + 0.5);
  float value = mix(minValue, maxValue, mixValue);
  float v = (value - u_domainMin) / (u_domainMax - u_domainMin);
  float x = u_plotOrigin.x + t * u_plotSize.x + a_corner.x * u_halfWidth * u_plotSize.x / (rangeEnd - rangeStart);
  float y = u_plotOrigin.y + u_plotSize.y - clamp(v, 0.0, 1.0) * u_plotSize.y;
  vec2 ndc = vec2((x / u_viewport.x) * 2.0 - 1.0, 1.0 - (y / u_viewport.y) * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_color = a_color;
}
`;

export const SERIES_BAR_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;
