import type { Diagnostic, RendererMetrics } from "../api/public-types.js";
import type { PlotArea } from "../core/transform.js";
import { GpuBuffer } from "./gpu-buffer.js";
import type { GpuTextRenderer } from "./text/index.js";
import type { RenderFrame, Renderer } from "./renderer.js";
import { DynamicVertexBuffer } from "./vertex-buffer.js";
import { getRendererContext, type WebGL2RendererOptions } from "./webgl2/context.js";
import { renderFrame } from "./webgl2/frame.js";
import {
  handleContextLost as onContextLost,
  handleContextRestored as onContextRestored,
  initializeRenderer,
  resizeRenderer
} from "./webgl2/lifecycle.js";
import { dropSeriesEntry } from "./webgl2/series-cache.js";
import type { BarProgramInfo, LineProgramInfo, QuadProgramInfo, SeriesGpuEntry } from "./webgl2/state.js";

export type { WebGL2RendererOptions } from "./webgl2/context.js";

export class WebGL2Renderer implements Renderer {
  private gl: WebGL2RenderingContext | null = null;
  private dynamicProgram: WebGLProgram | null = null;
  private dynamicVao: WebGLVertexArrayObject | null = null;
  private dynamicVbo: WebGLBuffer | null = null;
  private dynamicBuffer = new DynamicVertexBuffer(6, 4096);
  private dynamicGpuBuffer = new GpuBuffer();
  private lineProgram: LineProgramInfo | null = null;
  private quadProgram: QuadProgramInfo | null = null;
  private barProgram: BarProgramInfo | null = null;
  private quadCornerBuffer: WebGLBuffer | null = null;
  private quadIndexBuffer: WebGLBuffer | null = null;
  private seriesCache = new Map<string, SeriesGpuEntry>();
  private gpuText: GpuTextRenderer | null = null;
  private diagnosticHandler?: (diag: Diagnostic) => void;
  private maxSeriesGpuBytes: number;
  private seriesGpuBytes = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private warnedMissingTextLayer = false;
  private warnedTextAtlasFull = false;
  private textMode: "gpu" | "canvas" | "none";
  private lastTextMode: "gpu" | "canvas" | "none";
  private clipStack: PlotArea[] = [];
  private hasContextListeners = false;
  private isContextLost = false;
  private contextLossCount = 0;
  private metrics = {
    frameCount: 0,
    lastFrame: {
      drawCalls: 0,
      batchCount: 0,
      stateChanges: 0,
      bufferUploads: 0,
      bufferAllocations: 0,
      bufferBytes: 0,
      bufferReuses: 0
    },
    totals: {
      drawCalls: 0,
      batchCount: 0,
      stateChanges: 0,
      bufferUploads: 0,
      bufferAllocations: 0,
      bufferBytes: 0,
      bufferReuses: 0
    },
    textAtlas: { pages: 0, glyphs: 0, capacity: 0, occupancy: 0, evictions: 0 }
  };

  constructor(private canvas: HTMLCanvasElement, private options: WebGL2RendererOptions = {}) {
    this.diagnosticHandler = options.onDiagnostic;
    this.maxSeriesGpuBytes = options.maxSeriesGpuBytes ?? 256 * 1024 * 1024;
    const preferGpuText = options.useGpuText ?? !options.textLayer;
    this.textMode = preferGpuText ? "gpu" : options.textLayer ? "canvas" : "none";
    this.lastTextMode = this.textMode;
  }

  initialize(): void { initializeRenderer(getRendererContext(this)); }
  resize(width: number, height: number, devicePixelRatio: number): void { resizeRenderer(getRendererContext(this), width, height, devicePixelRatio); }
  render(frame: RenderFrame): void { renderFrame(getRendererContext(this), frame); }
  setDiagnostics(handler: (diag: Diagnostic) => void): void { this.diagnosticHandler = handler; }
  removeSeries(seriesId: string): void { dropSeriesEntry(getRendererContext(this), seriesId); }
  getMetrics(): RendererMetrics { return { ...this.metrics, lastFrame: { ...this.metrics.lastFrame }, totals: { ...this.metrics.totals } }; }

  private handleContextLost = (event: Event): void => { onContextLost(getRendererContext(this), event); };
  private handleContextRestored = (): void => { onContextRestored(getRendererContext(this)); };
}
