import type { Diagnostic, RendererMetrics } from "../../api/public-types.js";
import type { PlotArea } from "../../core/transform.js";
import type { RgbaColor } from "../color.js";
import type { GpuBuffer } from "../gpu-buffer.js";
import type { GpuTextRenderer } from "../gpu-text.js";
import type { TextLayer } from "../text-layer.js";
import type { DynamicVertexBuffer } from "../vertex-buffer.js";
import type { WebGL2Renderer } from "../webgl2-renderer.js";
import type { BarProgramInfo, LineProgramInfo, QuadProgramInfo, SeriesGpuEntry } from "./state.js";

export type WebGL2RendererOptions = {
  onError?: (message: string) => void;
  onDiagnostic?: (diag: Diagnostic) => void;
  clearColor?: RgbaColor;
  textLayer?: TextLayer;
  useGpuText?: boolean;
  textFont?: string;
  maxSeriesGpuBytes?: number;
};

export type WebGL2RendererContext = {
  canvas: HTMLCanvasElement;
  options: WebGL2RendererOptions;
  gl: WebGL2RenderingContext | null;
  dynamicProgram: WebGLProgram | null;
  dynamicVao: WebGLVertexArrayObject | null;
  dynamicVbo: WebGLBuffer | null;
  dynamicBuffer: DynamicVertexBuffer;
  dynamicGpuBuffer: GpuBuffer;
  lineProgram: LineProgramInfo | null;
  quadProgram: QuadProgramInfo | null;
  barProgram: BarProgramInfo | null;
  quadCornerBuffer: WebGLBuffer | null;
  quadIndexBuffer: WebGLBuffer | null;
  seriesCache: Map<string, SeriesGpuEntry>;
  gpuText: GpuTextRenderer | null;
  diagnosticHandler?: (diag: Diagnostic) => void;
  maxSeriesGpuBytes: number;
  seriesGpuBytes: number;
  width: number;
  height: number;
  dpr: number;
  warnedMissingTextLayer: boolean;
  clipStack: PlotArea[];
  hasContextListeners: boolean;
  isContextLost: boolean;
  contextLossCount: number;
  metrics: RendererMetrics;
  handleContextLost: (event: Event) => void;
  handleContextRestored: () => void;
};

export function getRendererContext(renderer: WebGL2Renderer): WebGL2RendererContext {
  return renderer as unknown as WebGL2RendererContext;
}
