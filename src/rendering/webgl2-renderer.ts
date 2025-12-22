import { RenderCrosshair, RenderFrame, RenderSeries, Renderer } from "./renderer.js";
import { createProgram } from "./gl-utils.js";
import { GpuBuffer } from "./gpu-buffer.js";
import {
  DEFAULT_CLEAR,
  DEFAULT_AXIS,
  DEFAULT_CROSSHAIR,
  DEFAULT_GRID,
  DEFAULT_DOWN_CANDLE,
  DEFAULT_OVERLAY,
  DEFAULT_OVERLAY_FILL,
  DEFAULT_UP_CANDLE,
  RgbaColor,
  colorFromId,
  parseColor,
  withAlpha
} from "./color.js";
import { DynamicVertexBuffer, DrawCommand } from "./vertex-buffer.js";
import { PlotArea, timeToX, priceToY } from "../core/transform.js";
import { TextLabel, TextLayer } from "./text-layer.js";
import { formatTimestamp } from "../core/axis.js";
import {
  AreaOverlayData,
  CrosshairEvent,
  Diagnostic,
  HistogramOverlayData,
  HLineOverlayData,
  LabelOverlayData,
  LineOverlayData,
  MarkerOverlayData,
  OverlayPrimitive,
  Range,
  ZoneOverlayData
} from "../api/public-types.js";
import { OverlayRenderItem } from "../core/overlays.js";
import { GpuTextRenderer } from "./gpu-text.js";

export type WebGL2RendererOptions = {
  onError?: (message: string) => void;
  onDiagnostic?: (diag: Diagnostic) => void;
  clearColor?: RgbaColor;
  textLayer?: TextLayer;
  useGpuText?: boolean;
  textFont?: string;
  maxSeriesGpuBytes?: number;
};

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
  private clipStack: PlotArea[] = [];
  private hasContextListeners = false;
  private isContextLost = false;
  private contextLossCount = 0;

  constructor(private canvas: HTMLCanvasElement, private options: WebGL2RendererOptions = {}) {
    this.diagnosticHandler = options.onDiagnostic;
    this.maxSeriesGpuBytes = options.maxSeriesGpuBytes ?? 256 * 1024 * 1024;
  }

  initialize(): void {
    if (!this.hasContextListeners) {
      this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
      this.hasContextListeners = true;
    }
    if (this.isContextLost) {
      return;
    }
    this.gl = this.canvas.getContext("webgl2");
    if (!this.gl) {
      this.emitDiagnostic({
        code: "render/context-lost",
        message: "WebGL2 context not available",
        severity: "error",
        recoverable: true
      });
      this.options.onError?.("WebGL2 context not available");
      return;
    }
    const dynamicProgram = createProgram(this.gl, VERT_SHADER_SOURCE, FRAG_SHADER_SOURCE);
    if (!dynamicProgram) {
      this.options.onError?.("Failed to compile WebGL2 program");
      return;
    }
    this.dynamicProgram = dynamicProgram;
    this.dynamicVao = this.gl.createVertexArray();
    this.dynamicVbo = this.gl.createBuffer();
    if (!this.dynamicVao || !this.dynamicVbo) {
      this.options.onError?.("Failed to allocate WebGL buffers");
      return;
    }
    this.gl.bindVertexArray(this.dynamicVao);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.dynamicVbo);
    const positionLocation = this.gl.getAttribLocation(dynamicProgram, "a_position");
    const colorLocation = this.gl.getAttribLocation(dynamicProgram, "a_color");
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, stride, 0);
    this.gl.enableVertexAttribArray(colorLocation);
    this.gl.vertexAttribPointer(
      colorLocation,
      4,
      this.gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT
    );
    this.gl.bindVertexArray(null);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);

    this.quadCornerBuffer = this.gl.createBuffer();
    this.quadIndexBuffer = this.gl.createBuffer();
    if (!this.quadCornerBuffer || !this.quadIndexBuffer) {
      this.options.onError?.("Failed to allocate quad buffers");
      return;
    }
    const corners = new Float32Array([
      -0.5, -0.5,
      0.5, -0.5,
      0.5, 0.5,
      -0.5, 0.5
    ]);
    const indices = new Uint16Array([0, 1, 2, 2, 3, 0]);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadCornerBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, corners, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);

    const lineProgram = createProgram(this.gl, SERIES_LINE_VERT, SERIES_LINE_FRAG);
    if (!lineProgram) {
      this.options.onError?.("Failed to compile series line program");
      return;
    }
    try {
      this.lineProgram = createLineProgramInfo(this.gl, lineProgram);
    } catch (error) {
      this.emitDiagnostic({
        code: "render/buffer-allocation-failed",
        message: "Failed to allocate line VAO",
        severity: "error",
        recoverable: false,
        context: { error: String(error) }
      });
      this.options.onError?.("Failed to allocate line VAO");
      return;
    }

    const quadProgram = createProgram(this.gl, SERIES_QUAD_VERT, SERIES_QUAD_FRAG);
    if (!quadProgram) {
      this.options.onError?.("Failed to compile series quad program");
      return;
    }
    try {
      this.quadProgram = createQuadProgramInfo(this.gl, quadProgram, this.quadCornerBuffer, this.quadIndexBuffer);
    } catch (error) {
      this.emitDiagnostic({
        code: "render/buffer-allocation-failed",
        message: "Failed to allocate quad VAO",
        severity: "error",
        recoverable: false,
        context: { error: String(error) }
      });
      this.options.onError?.("Failed to allocate quad VAO");
      return;
    }

    const barProgram = createProgram(this.gl, SERIES_BAR_VERT, SERIES_BAR_FRAG);
    if (!barProgram) {
      this.options.onError?.("Failed to compile series bar program");
      return;
    }
    try {
      this.barProgram = createBarProgramInfo(this.gl, barProgram, this.quadCornerBuffer, this.quadIndexBuffer);
    } catch (error) {
      this.emitDiagnostic({
        code: "render/buffer-allocation-failed",
        message: "Failed to allocate bar VAO",
        severity: "error",
        recoverable: false,
        context: { error: String(error) }
      });
      this.options.onError?.("Failed to allocate bar VAO");
      return;
    }

    const useGpuText = this.options.useGpuText ?? !this.options.textLayer;
    if (useGpuText) {
      this.gpuText = new GpuTextRenderer(this.gl, { font: this.options.textFont });
    }
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.max(1, devicePixelRatio);
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.options.textLayer?.resize(width, height, this.dpr);
    this.gpuText?.resize(width, height);
  }

  render(frame: RenderFrame): void {
    if (
      !this.gl ||
      !this.dynamicProgram ||
      !this.dynamicVao ||
      !this.dynamicVbo ||
      !this.lineProgram ||
      !this.quadProgram ||
      !this.barProgram
    ) {
      return;
    }
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    const clear = this.options.clearColor ?? DEFAULT_CLEAR;
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const labels: TextLabel[] = [];
    const bottomPaneId = this.findBottomPaneId(frame.panes);
    const crosshairs = frame.crosshairs ?? [];
    for (const pane of frame.panes) {
      const isBottom = pane.paneId === bottomPaneId;
      const paneCrosshairs = crosshairs.filter((item) => item.paneId === pane.paneId);
      labels.push(...this.renderPane(gl, pane, frame.overlays, isBottom, paneCrosshairs));
    }

    if (this.options.textLayer) {
      this.options.textLayer.clear();
      for (const label of labels) {
        this.options.textLayer.drawLabel(label);
      }
    } else if (labels.length > 0 && !this.warnedMissingTextLayer) {
      if (this.gpuText) {
        this.renderLabelBackgrounds(labels);
        this.gpuText.render(labels);
      } else {
        this.options.onError?.("Label overlays skipped: text layer not configured");
        this.warnedMissingTextLayer = true;
      }
    }

    gl.disable(gl.SCISSOR_TEST);
  }

  setDiagnostics(handler: (diag: Diagnostic) => void): void {
    this.diagnosticHandler = handler;
  }

  removeSeries(seriesId: string): void {
    this.dropSeriesEntry(seriesId);
  }

  private emitDiagnostic(diag: Diagnostic): void {
    this.diagnosticHandler?.(diag);
  }

  private emitBufferRebuild(context: BufferRebuildContext | undefined, before: number, after: number): void {
    if (!context || after <= before) return;
    this.emitDiagnostic({
      code: "render/buffer-rebuild",
      message: "GPU buffer resized",
      severity: "info",
      recoverable: true,
      context: {
        seriesId: context.seriesId,
        buffer: context.buffer,
        beforeBytes: before,
        afterBytes: after
      }
    });
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.isContextLost) return;
    this.isContextLost = true;
    this.contextLossCount += 1;
    this.emitDiagnostic({
      code: "render/context-lost",
      message: "WebGL2 context lost",
      severity: "error",
      recoverable: true,
      context: { count: this.contextLossCount }
    });
    this.resetGpuState();
  };

  private handleContextRestored = (): void => {
    if (!this.isContextLost) return;
    this.isContextLost = false;
    this.emitDiagnostic({
      code: "render/context-restored",
      message: "WebGL2 context restored",
      severity: "info",
      recoverable: true
    });
    this.initialize();
    if (this.width > 0 && this.height > 0) {
      this.resize(this.width, this.height, this.dpr);
    }
  };

  private resetGpuState(): void {
    if (this.gl) {
      if (this.dynamicVbo) this.gl.deleteBuffer(this.dynamicVbo);
      if (this.dynamicVao) this.gl.deleteVertexArray(this.dynamicVao);
      if (this.dynamicProgram) this.gl.deleteProgram(this.dynamicProgram);
      if (this.quadCornerBuffer) this.gl.deleteBuffer(this.quadCornerBuffer);
      if (this.quadIndexBuffer) this.gl.deleteBuffer(this.quadIndexBuffer);
      if (this.lineProgram) this.gl.deleteProgram(this.lineProgram.program);
      if (this.quadProgram) this.gl.deleteProgram(this.quadProgram.program);
      if (this.barProgram) this.gl.deleteProgram(this.barProgram.program);
      for (const entry of this.seriesCache.values()) {
        this.releaseSeriesEntry(entry);
      }
    }
    this.seriesCache.clear();
    this.seriesGpuBytes = 0;
    this.dynamicProgram = null;
    this.dynamicVao = null;
    this.dynamicVbo = null;
    this.lineProgram = null;
    this.quadProgram = null;
    this.barProgram = null;
    this.quadCornerBuffer = null;
    this.quadIndexBuffer = null;
    this.gpuText = null;
    this.gl = null;
  }

  private renderPane(
    gl: WebGL2RenderingContext,
    pane: RenderFrame["panes"][number],
    overlays: OverlayRenderItem[],
    isBottomPane: boolean,
    crosshairs: RenderCrosshair[]
  ): TextLabel[] {
    const plotArea = pane.plotArea;
    if (plotArea.width <= 0 || plotArea.height <= 0) return [];
    this.pushClip(gl, plotArea);

    const labels: TextLabel[] = [];
    const commands: DrawCommand[] = [];
    this.dynamicBuffer.reset();

    const paneOverlays = overlays.filter(
      (item) => (item.overlay.paneId ?? "price") === pane.paneId
    );
    const below = paneOverlays.filter((item) => (item.overlay.layer ?? "above") === "below");
    const above = paneOverlays.filter((item) => (item.overlay.layer ?? "above") === "above");
    const ui = paneOverlays.filter((item) => item.overlay.layer === "ui");

    this.appendGridAndAxes(pane, commands, labels, isBottomPane);
    this.appendOverlays(pane, below, commands, labels);
    this.flushDynamic(gl, commands);
    this.drawSeries(gl, pane);
    this.appendOverlays(pane, above, commands, labels);
    this.appendOverlays(pane, ui, commands, labels);
    if (crosshairs.length > 0) {
      for (const crosshair of crosshairs) {
        this.appendCrosshair(pane, crosshair, commands, labels);
      }
    }
    this.flushDynamic(gl, commands);

    this.popClip(gl);
    return labels;
  }

  private appendSeries(
    pane: RenderFrame["panes"][number],
    series: RenderSeries,
    commands: DrawCommand[]
  ): void {
    const range = pane.visibleRange;
    const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
    if (!domain) return;
    if (series.type === "candles") {
      this.appendCandleSeries(range, pane, series, commands);
      return;
    }
    if (series.type === "histogram") {
      this.appendHistogramSeries(range, pane, series, commands);
      return;
    }
    if (series.type === "area") {
      this.appendAreaSeries(range, pane, series, commands);
      return;
    }
    this.appendLineSeries(range, pane, series, commands);
  }

  private appendLineSeries(
    range: Range,
    pane: RenderFrame["panes"][number],
    series: RenderSeries,
    commands: DrawCommand[]
  ): void {
    const values = series.fields.value;
    if (!values) return;
    const color = colorFromId(series.id, 1);
    const start = this.dynamicBuffer.vertexCount;
    for (let i = 0; i < series.timeMs.length; i += 1) {
      const x = timeToX(range, pane.plotArea, series.timeMs[i]);
      const y = priceToY(pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price, pane.plotArea, values[i]);
      if (x === null || y === null) continue;
      const [nx, ny] = this.toNdc(x, y);
      this.dynamicBuffer.pushVertex(nx, ny, color[0], color[1], color[2], color[3]);
    }
    const count = this.dynamicBuffer.vertexCount - start;
    if (count > 1) {
      commands.push({ mode: this.glLineStrip(), first: start, count });
    }
  }

  private appendAreaSeries(
    range: Range,
    pane: RenderFrame["panes"][number],
    series: RenderSeries,
    commands: DrawCommand[]
  ): void {
    const values = series.fields.value;
    if (!values) return;
    const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
    if (!domain) return;
    const baseValue = domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
    const baseY = priceToY(domain, pane.plotArea, baseValue);
    if (baseY === null) return;

    const fillColor = withAlpha(colorFromId(series.id, 1), 0.2);
    let prevX: number | null = null;
    let prevY: number | null = null;
    for (let i = 0; i < series.timeMs.length; i += 1) {
      const x = timeToX(range, pane.plotArea, series.timeMs[i]);
      const y = priceToY(domain, pane.plotArea, values[i]);
      if (x === null || y === null) continue;
      if (prevX !== null && prevY !== null) {
        const [x0, y0] = this.toNdc(prevX, prevY);
        const [x1, y1] = this.toNdc(x, y);
        const [x0b, y0b] = this.toNdc(prevX, baseY);
        const [x1b, y1b] = this.toNdc(x, baseY);
        const start = this.dynamicBuffer.vertexCount;
        this.dynamicBuffer.pushVertex(x0, y0, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x1b, y1b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        const count = this.dynamicBuffer.vertexCount - start;
        if (count > 0) {
          commands.push({ mode: this.glTriangles(), first: start, count });
        }
      }
      prevX = x;
      prevY = y;
    }
    this.appendLineSeries(range, pane, series, commands);
  }

  private appendHistogramSeries(
    range: Range,
    pane: RenderFrame["panes"][number],
    series: RenderSeries,
    commands: DrawCommand[]
  ): void {
    const values = series.fields.value;
    if (!values) return;
    const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
    if (!domain) return;
    const baseValue = domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
    const baseY = priceToY(domain, pane.plotArea, baseValue);
    if (baseY === null) return;
    const barColor = colorFromId(series.id, 1);
    const barWidth = this.computeBarWidth(pane, series.timeMs.length);
    for (let i = 0; i < series.timeMs.length; i += 1) {
      const x = timeToX(range, pane.plotArea, series.timeMs[i]);
      const y = priceToY(domain, pane.plotArea, values[i]);
      if (x === null || y === null) continue;
      const left = x - barWidth * 0.5;
      const right = x + barWidth * 0.5;
      const top = Math.min(y, baseY);
      const bottom = Math.max(y, baseY);
      const [lx, ty] = this.toNdc(left, top);
      const [rx, by] = this.toNdc(right, bottom);
      const start = this.dynamicBuffer.vertexCount;
      this.dynamicBuffer.pushVertex(lx, ty, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.dynamicBuffer.pushVertex(lx, by, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.dynamicBuffer.pushVertex(rx, ty, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.dynamicBuffer.pushVertex(rx, ty, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.dynamicBuffer.pushVertex(lx, by, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.dynamicBuffer.pushVertex(rx, by, barColor[0], barColor[1], barColor[2], barColor[3]);
      const count = this.dynamicBuffer.vertexCount - start;
      if (count > 0) {
        commands.push({ mode: this.glTriangles(), first: start, count });
      }
    }
  }

  private appendCandleSeries(
    range: Range,
    pane: RenderFrame["panes"][number],
    series: RenderSeries,
    commands: DrawCommand[]
  ): void {
    const open = series.fields.open;
    const high = series.fields.high;
    const low = series.fields.low;
    const close = series.fields.close;
    if (!open || !high || !low || !close) return;
    const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
    if (!domain) return;

    const candleWidth = this.computeBarWidth(pane, series.timeMs.length);
    const wickStart = this.dynamicBuffer.vertexCount;
    for (let i = 0; i < series.timeMs.length; i += 1) {
      const x = timeToX(range, pane.plotArea, series.timeMs[i]);
      if (x === null) continue;
      const openY = priceToY(domain, pane.plotArea, open[i]);
      const closeY = priceToY(domain, pane.plotArea, close[i]);
      const highY = priceToY(domain, pane.plotArea, high[i]);
      const lowY = priceToY(domain, pane.plotArea, low[i]);
      if (openY === null || closeY === null || highY === null || lowY === null) continue;
      const isUp = close[i] >= open[i];
      const color = isUp ? DEFAULT_UP_CANDLE : DEFAULT_DOWN_CANDLE;
      const [nx, nyHigh] = this.toNdc(x, highY);
      const [nx2, nyLow] = this.toNdc(x, lowY);
      this.dynamicBuffer.pushVertex(nx, nyHigh, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(nx2, nyLow, color[0], color[1], color[2], color[3]);
    }
    const wickCount = this.dynamicBuffer.vertexCount - wickStart;
    if (wickCount > 0) {
      commands.push({ mode: this.glLines(), first: wickStart, count: wickCount });
    }

    const bodyStart = this.dynamicBuffer.vertexCount;
    for (let i = 0; i < series.timeMs.length; i += 1) {
      const x = timeToX(range, pane.plotArea, series.timeMs[i]);
      if (x === null) continue;
      const openY = priceToY(domain, pane.plotArea, open[i]);
      const closeY = priceToY(domain, pane.plotArea, close[i]);
      if (openY === null || closeY === null) continue;
      const top = Math.min(openY, closeY);
      const bottom = Math.max(openY, closeY);
      const left = x - candleWidth * 0.5;
      const right = x + candleWidth * 0.5;
      const isUp = close[i] >= open[i];
      const color = isUp ? DEFAULT_UP_CANDLE : DEFAULT_DOWN_CANDLE;
      const [lx, ty] = this.toNdc(left, top);
      const [rx, by] = this.toNdc(right, bottom);
      this.dynamicBuffer.pushVertex(lx, ty, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(rx, by, color[0], color[1], color[2], color[3]);
    }
    const bodyCount = this.dynamicBuffer.vertexCount - bodyStart;
    if (bodyCount > 0) {
      commands.push({ mode: this.glTriangles(), first: bodyStart, count: bodyCount });
    }
  }

  private appendOverlays(
    pane: RenderFrame["panes"][number],
    overlays: OverlayRenderItem[],
    commands: DrawCommand[],
    labels: TextLabel[]
  ): void {
    const sorted = overlays.slice().sort((a, b) => {
      const zA = a.overlay.zIndex ?? 0;
      const zB = b.overlay.zIndex ?? 0;
      return zA - zB;
    });
    for (const item of sorted) {
      const overlay = item.overlay;
      const scaleId = overlay.scaleId ?? "price";
      const domain = pane.scaleDomains[scaleId] ?? pane.scaleDomains.price;
      if (!domain) continue;
      switch (overlay.type) {
        case "line":
          this.appendOverlayLine(pane, overlay, item.clippedData as LineOverlayData, commands);
          break;
        case "area":
          this.appendOverlayArea(pane, overlay, item.clippedData as AreaOverlayData, commands);
          break;
        case "histogram":
          this.appendOverlayHistogram(pane, overlay, item.clippedData as HistogramOverlayData, commands);
          break;
        case "hline":
          this.appendOverlayHLine(pane, overlay, item.clippedData as HLineOverlayData, commands);
          break;
        case "zone":
          this.appendOverlayZone(pane, overlay, item.clippedData as ZoneOverlayData, commands);
          break;
        case "marker":
          this.appendOverlayMarkers(pane, overlay, item.clippedData as MarkerOverlayData, commands);
          break;
        case "label":
          this.appendOverlayLabels(pane, overlay, item.clippedData as LabelOverlayData, labels);
          break;
        default:
          break;
      }
    }
  }

  private drawSeries(gl: WebGL2RenderingContext, pane: RenderFrame["panes"][number]): void {
    for (const series of pane.series) {
      const domain = pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price;
      if (!domain) continue;
      const entry = this.getSeriesEntry(gl, series);
      if (!entry) continue;
      if (series.type === "candles" && entry.candles) {
        this.drawCandleSeries(gl, pane, series, entry.candles, domain);
        continue;
      }
      if (series.type === "histogram" && entry.histogram) {
        this.drawHistogramSeries(gl, pane, series, entry.histogram, domain);
        continue;
      }
      if (series.type === "area" && entry.area && entry.line) {
        this.drawAreaSeries(gl, pane, series, entry.area, entry.line, domain);
        continue;
      }
      if (series.type === "line" && entry.line) {
        this.drawLineSeries(gl, pane, series, entry.line, domain);
      }
    }
  }

  private flushDynamic(gl: WebGL2RenderingContext, commands: DrawCommand[]): void {
    if (!this.dynamicProgram || !this.dynamicVao || !this.dynamicVbo) return;
    if (commands.length === 0 || this.dynamicBuffer.vertexCount === 0) {
      this.dynamicBuffer.reset();
      commands.length = 0;
      return;
    }
    const data = this.dynamicBuffer.buffer;
    const optimized = coalesceDrawCommands(commands);
    gl.useProgram(this.dynamicProgram);
    gl.bindVertexArray(this.dynamicVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVbo);
    this.dynamicGpuBuffer.upload(gl, data, gl.DYNAMIC_DRAW);
    for (const command of optimized) {
      gl.drawArrays(command.mode, command.first, command.count);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.dynamicBuffer.reset();
    commands.length = 0;
  }

  private getSeriesEntry(gl: WebGL2RenderingContext, series: RenderSeries): SeriesGpuEntry | null {
    const cached = this.seriesCache.get(series.id);
    if (cached) {
      if (cached.seriesRef === series) {
        this.touchSeries(series.id);
        return cached;
      }
      const typeChanged = cached.seriesRef.type !== series.type;
      const previousBytes = cached.gpuBytes ?? 0;
      const updated = this.updateSeriesEntry(gl, cached, series);
      if (updated) {
        this.updateSeriesBytes(updated, previousBytes);
        this.touchSeries(series.id);
        this.enforceSeriesBudget();
        return updated;
      }
      this.dropSeriesEntry(series.id);
      if (typeChanged) {
        this.emitDiagnostic({
          code: "render/buffer-rebuild",
          message: "series type changed; rebuilding GPU buffers",
          severity: "info",
          recoverable: true,
          context: { seriesId: series.id }
        });
      }
    }
    const entry = this.buildSeriesEntry(gl, series);
    if (!entry) return null;
    entry.gpuBytes = this.computeEntryBytes(entry);
    this.seriesGpuBytes += entry.gpuBytes;
    this.seriesCache.set(series.id, entry);
    this.touchSeries(series.id);
    this.enforceSeriesBudget();
    return entry;
  }

  private updateSeriesEntry(
    gl: WebGL2RenderingContext,
    entry: SeriesGpuEntry,
    series: RenderSeries
  ): SeriesGpuEntry | null {
    if (entry.seriesRef.type !== series.type) {
      return null;
    }
    entry.seriesRef = series;
    if (series.type === "line") {
      entry.line = this.upsertLineBuffer(
        gl,
        entry.line ?? null,
        this.buildLineData(series.timeMs, series.fields.value, 0),
        { seriesId: series.id, buffer: "line" }
      );
      return entry.line ? entry : null;
    }
    if (series.type === "area") {
      entry.line = this.upsertLineBuffer(
        gl,
        entry.line ?? null,
        this.buildLineData(series.timeMs, series.fields.value, 0),
        { seriesId: series.id, buffer: "line" }
      );
      entry.area = this.upsertLineBuffer(
        gl,
        entry.area ?? null,
        this.buildAreaData(series.timeMs, series.fields.value),
        { seriesId: series.id, buffer: "area" }
      );
      return entry.line && entry.area ? entry : null;
    }
    if (series.type === "histogram") {
      entry.histogram = this.upsertInstanceBuffer(
        gl,
        entry.histogram ?? null,
        this.buildBarData(series.timeMs, series.fields.value, series.id),
        { seriesId: series.id, buffer: "histogram" }
      );
      return entry.histogram ? entry : null;
    }
    if (series.type === "candles") {
      const wickData = this.buildCandleWickData(series);
      if (!wickData) return null;
      const body = this.upsertInstanceBuffer(
        gl,
        entry.candles?.body ?? null,
        this.buildCandleBodyData(series),
        { seriesId: series.id, buffer: "candle-body" }
      );
      const wickUp = this.upsertLineBuffer(
        gl,
        entry.candles?.wickUp ?? null,
        wickData.up,
        { seriesId: series.id, buffer: "candle-wick-up" }
      );
      const wickDown = this.upsertLineBuffer(
        gl,
        entry.candles?.wickDown ?? null,
        wickData.down,
        { seriesId: series.id, buffer: "candle-wick-down" }
      );
      entry.candles = {
        wickUp,
        wickDown,
        body
      };
      return entry.candles.body ? entry : null;
    }
    return null;
  }

  private releaseSeriesEntry(entry: SeriesGpuEntry): void {
    if (!this.gl) return;
    const gl = this.gl;
    this.releaseLineBuffer(gl, entry.line ?? null);
    this.releaseLineBuffer(gl, entry.area ?? null);
    this.releaseInstanceBuffer(gl, entry.histogram ?? null);
    if (entry.candles) {
      this.releaseLineBuffer(gl, entry.candles.wickUp ?? null);
      this.releaseLineBuffer(gl, entry.candles.wickDown ?? null);
      this.releaseInstanceBuffer(gl, entry.candles.body ?? null);
    }
  }

  private dropSeriesEntry(seriesId: string): void {
    const entry = this.seriesCache.get(seriesId);
    if (!entry) return;
    this.seriesCache.delete(seriesId);
    this.seriesGpuBytes -= entry.gpuBytes ?? 0;
    this.releaseSeriesEntry(entry);
  }

  private touchSeries(seriesId: string): void {
    const entry = this.seriesCache.get(seriesId);
    if (!entry) return;
    this.seriesCache.delete(seriesId);
    this.seriesCache.set(seriesId, entry);
  }

  private updateSeriesBytes(entry: SeriesGpuEntry, previousBytes: number): void {
    const nextBytes = this.computeEntryBytes(entry);
    entry.gpuBytes = nextBytes;
    this.seriesGpuBytes += nextBytes - previousBytes;
  }

  private computeEntryBytes(entry: SeriesGpuEntry): number {
    let bytes = 0;
    bytes += this.getBufferBytes(entry.line ?? null);
    bytes += this.getBufferBytes(entry.area ?? null);
    bytes += this.getBufferBytes(entry.histogram ?? null);
    if (entry.candles) {
      bytes += this.getBufferBytes(entry.candles.wickUp ?? null);
      bytes += this.getBufferBytes(entry.candles.wickDown ?? null);
      bytes += this.getBufferBytes(entry.candles.body ?? null);
    }
    return bytes;
  }

  private getBufferBytes(buffer: LineBuffer | InstanceBuffer | null): number {
    if (!buffer) return 0;
    return buffer.uploader.getCapacityBytes();
  }

  private enforceSeriesBudget(): void {
    if (this.maxSeriesGpuBytes <= 0) return;
    while (this.seriesGpuBytes > this.maxSeriesGpuBytes && this.seriesCache.size > 1) {
      const oldest = this.seriesCache.keys().next().value as string | undefined;
      if (!oldest) break;
      const entry = this.seriesCache.get(oldest);
      if (!entry) break;
      this.seriesCache.delete(oldest);
      this.seriesGpuBytes -= entry.gpuBytes ?? 0;
      this.releaseSeriesEntry(entry);
      this.emitDiagnostic({
        code: "render/series-cache-evicted",
        message: "series GPU cache evicted to honor budget",
        severity: "warn",
        recoverable: true,
        context: { seriesId: oldest, totalBytes: this.seriesGpuBytes, maxBytes: this.maxSeriesGpuBytes }
      });
    }
  }

  private buildSeriesEntry(gl: WebGL2RenderingContext, series: RenderSeries): SeriesGpuEntry | null {
    const entry: SeriesGpuEntry = { seriesRef: series };
    if (series.type === "line") {
      entry.line = this.createLineBuffer(gl, series.timeMs, series.fields.value, 0);
    } else if (series.type === "area") {
      entry.line = this.createLineBuffer(gl, series.timeMs, series.fields.value, 0);
      entry.area = this.createAreaBuffer(gl, series.timeMs, series.fields.value);
    } else if (series.type === "histogram") {
      entry.histogram = this.createBarBuffer(gl, series.timeMs, series.fields.value, series.id);
    } else if (series.type === "candles") {
      const wick = this.createCandleWickBuffers(gl, series);
      entry.candles = {
        wickUp: wick?.up ?? null,
        wickDown: wick?.down ?? null,
        body: this.createCandleBodyBuffer(gl, series)
      };
    }
    return entry;
  }

  private buildLineData(
    timeMs: Float64Array,
    values: Float64Array | undefined,
    side: number
  ): LineData | null {
    if (!values || values.length === 0) return null;
    const count = Math.min(timeMs.length, values.length);
    if (count === 0) return null;
    const data = new Float32Array(count * 4);
    let offset = 0;
    for (let i = 0; i < count; i += 1) {
      const [hi, lo] = splitFloat64(timeMs[i]);
      data[offset++] = hi;
      data[offset++] = lo;
      data[offset++] = values[i];
      data[offset++] = side;
    }
    return { data, count };
  }

  private buildAreaData(timeMs: Float64Array, values: Float64Array | undefined): LineData | null {
    if (!values || values.length === 0) return null;
    const count = Math.min(timeMs.length, values.length);
    if (count === 0) return null;
    const data = new Float32Array(count * 2 * 4);
    let offset = 0;
    for (let i = 0; i < count; i += 1) {
      const [hi, lo] = splitFloat64(timeMs[i]);
      data[offset++] = hi;
      data[offset++] = lo;
      data[offset++] = values[i];
      data[offset++] = 0;
      data[offset++] = hi;
      data[offset++] = lo;
      data[offset++] = values[i];
      data[offset++] = 1;
    }
    return { data, count: count * 2 };
  }

  private buildBarData(
    timeMs: Float64Array,
    values: Float64Array | undefined,
    seriesId: string
  ): InstanceData | null {
    if (!values || values.length === 0) return null;
    const count = Math.min(timeMs.length, values.length);
    if (count === 0) return null;
    const data = new Float32Array(count * 7);
    let offset = 0;
    const color = colorFromId(seriesId, 1);
    for (let i = 0; i < count; i += 1) {
      const [hi, lo] = splitFloat64(timeMs[i]);
      data[offset++] = hi;
      data[offset++] = lo;
      data[offset++] = values[i];
      data[offset++] = color[0];
      data[offset++] = color[1];
      data[offset++] = color[2];
      data[offset++] = color[3];
    }
    return { data, count, stride: 7 };
  }

  private buildCandleBodyData(series: RenderSeries): InstanceData | null {
    const open = series.fields.open;
    const close = series.fields.close;
    if (!open || !close) return null;
    const count = Math.min(series.timeMs.length, open.length, close.length);
    if (count === 0) return null;
    const data = new Float32Array(count * 8);
    let offset = 0;
    for (let i = 0; i < count; i += 1) {
      const [hi, lo] = splitFloat64(series.timeMs[i]);
      const isUp = close[i] >= open[i];
      const color = isUp ? DEFAULT_UP_CANDLE : DEFAULT_DOWN_CANDLE;
      data[offset++] = hi;
      data[offset++] = lo;
      data[offset++] = open[i];
      data[offset++] = close[i];
      data[offset++] = color[0];
      data[offset++] = color[1];
      data[offset++] = color[2];
      data[offset++] = color[3];
    }
    return { data, count, stride: 8 };
  }

  private buildCandleWickData(series: RenderSeries): { up: LineData | null; down: LineData | null } | null {
    const open = series.fields.open;
    const high = series.fields.high;
    const low = series.fields.low;
    const close = series.fields.close;
    if (!open || !high || !low || !close) return null;
    let upCount = 0;
    let downCount = 0;
    const count = Math.min(series.timeMs.length, open.length, high.length, low.length, close.length);
    for (let i = 0; i < count; i += 1) {
      if (close[i] >= open[i]) upCount += 1;
      else downCount += 1;
    }
    const upData = upCount > 0 ? new Float32Array(upCount * 2 * 4) : null;
    const downData = downCount > 0 ? new Float32Array(downCount * 2 * 4) : null;
    let upOffset = 0;
    let downOffset = 0;
    for (let i = 0; i < count; i += 1) {
      const [hi, lo] = splitFloat64(series.timeMs[i]);
      const isUp = close[i] >= open[i];
      if (isUp && upData) {
        upData[upOffset++] = hi;
        upData[upOffset++] = lo;
        upData[upOffset++] = high[i];
        upData[upOffset++] = 0;
        upData[upOffset++] = hi;
        upData[upOffset++] = lo;
        upData[upOffset++] = low[i];
        upData[upOffset++] = 0;
      } else if (!isUp && downData) {
        downData[downOffset++] = hi;
        downData[downOffset++] = lo;
        downData[downOffset++] = high[i];
        downData[downOffset++] = 0;
        downData[downOffset++] = hi;
        downData[downOffset++] = lo;
        downData[downOffset++] = low[i];
        downData[downOffset++] = 0;
      }
    }
    return {
      up: upData ? { data: upData, count: upCount * 2 } : null,
      down: downData ? { data: downData, count: downCount * 2 } : null
    };
  }

  private createLineBuffer(
    gl: WebGL2RenderingContext,
    timeMs: Float64Array,
    values: Float64Array | undefined,
    side: number
  ): LineBuffer | null {
    const payload = this.buildLineData(timeMs, values, side);
    if (!payload) return null;
    return this.uploadLineBuffer(gl, payload.data, payload.count);
  }

  private uploadLineBuffer(
    gl: WebGL2RenderingContext,
    data: Float32Array,
    count: number
  ): LineBuffer | null {
    if (count <= 0) return null;
    const buffer = gl.createBuffer();
    if (!buffer) {
      this.emitDiagnostic({
        code: "render/buffer-allocation-failed",
        message: "Failed to allocate line buffer",
        severity: "error",
        recoverable: false
      });
      return null;
    }
    const uploader = new GpuBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    uploader.upload(gl, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { buffer, uploader, count, stride: 4, data };
  }

  private createAreaBuffer(
    gl: WebGL2RenderingContext,
    timeMs: Float64Array,
    values: Float64Array | undefined
  ): LineBuffer | null {
    const payload = this.buildAreaData(timeMs, values);
    if (!payload) return null;
    return this.uploadLineBuffer(gl, payload.data, payload.count);
  }

  private createBarBuffer(
    gl: WebGL2RenderingContext,
    timeMs: Float64Array,
    values: Float64Array | undefined,
    seriesId = "histogram"
  ): InstanceBuffer | null {
    const payload = this.buildBarData(timeMs, values, seriesId);
    if (!payload) return null;
    return this.createInstanceBuffer(gl, payload);
  }

  private createCandleWickBuffers(
    gl: WebGL2RenderingContext,
    series: RenderSeries
  ): { up: LineBuffer | null; down: LineBuffer | null } | null {
    const payload = this.buildCandleWickData(series);
    if (!payload) return null;
    const up = payload.up ? this.uploadLineBuffer(gl, payload.up.data, payload.up.count) : null;
    const down = payload.down ? this.uploadLineBuffer(gl, payload.down.data, payload.down.count) : null;
    return { up, down };
  }

  private createCandleBodyBuffer(gl: WebGL2RenderingContext, series: RenderSeries): InstanceBuffer | null {
    const payload = this.buildCandleBodyData(series);
    if (!payload) return null;
    return this.createInstanceBuffer(gl, payload);
  }

  private upsertLineBuffer(
    gl: WebGL2RenderingContext,
    existing: LineBuffer | null,
    payload: LineData | null,
    context?: BufferRebuildContext
  ): LineBuffer | null {
    if (!payload || payload.count === 0) {
      this.releaseLineBuffer(gl, existing);
      return null;
    }
    if (!existing) {
      return this.uploadLineBuffer(gl, payload.data, payload.count);
    }
    const before = existing.uploader.getCapacityBytes();
    gl.bindBuffer(gl.ARRAY_BUFFER, existing.buffer);
    existing.uploader.upload(gl, payload.data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    existing.count = payload.count;
    existing.data = payload.data;
    const after = existing.uploader.getCapacityBytes();
    if (after > before) {
      this.emitBufferRebuild(context, before, after);
    }
    return existing;
  }

  private upsertInstanceBuffer(
    gl: WebGL2RenderingContext,
    existing: InstanceBuffer | null,
    payload: InstanceData | null,
    context?: BufferRebuildContext
  ): InstanceBuffer | null {
    if (!payload || payload.count === 0) {
      this.releaseInstanceBuffer(gl, existing);
      return null;
    }
    if (!existing) {
      return this.createInstanceBuffer(gl, payload);
    }
    const before = existing.uploader.getCapacityBytes();
    gl.bindBuffer(gl.ARRAY_BUFFER, existing.buffer);
    existing.uploader.upload(gl, payload.data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    existing.count = payload.count;
    existing.stride = payload.stride;
    existing.data = payload.data;
    const after = existing.uploader.getCapacityBytes();
    if (after > before) {
      this.emitBufferRebuild(context, before, after);
    }
    return existing;
  }

  private createInstanceBuffer(gl: WebGL2RenderingContext, payload: InstanceData): InstanceBuffer | null {
    const buffer = gl.createBuffer();
    if (!buffer) {
      this.emitDiagnostic({
        code: "render/buffer-allocation-failed",
        message: "Failed to allocate instance buffer",
        severity: "error",
        recoverable: false
      });
      return null;
    }
    const uploader = new GpuBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    uploader.upload(gl, payload.data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { buffer, uploader, count: payload.count, stride: payload.stride, data: payload.data };
  }

  private releaseLineBuffer(gl: WebGL2RenderingContext, buffer: LineBuffer | null): void {
    if (!buffer) return;
    gl.deleteBuffer(buffer.buffer);
  }

  private releaseInstanceBuffer(gl: WebGL2RenderingContext, buffer: InstanceBuffer | null): void {
    if (!buffer) return;
    gl.deleteBuffer(buffer.buffer);
  }

  private drawLineSeries(
    gl: WebGL2RenderingContext,
    pane: RenderFrame["panes"][number],
    series: RenderSeries,
    buffer: LineBuffer,
    domain: { min: number; max: number }
  ): void {
    if (!this.lineProgram || buffer.count < 2) return;
    if (!this.setLineUniforms(gl, pane, domain, series, colorFromId(series.id, 1), 0, 0)) return;
    gl.useProgram(this.lineProgram.program);
    this.bindLineBuffer(gl, this.lineProgram, buffer);
    gl.drawArrays(gl.LINE_STRIP, 0, buffer.count);
  }

  private drawAreaSeries(
    gl: WebGL2RenderingContext,
    pane: RenderFrame["panes"][number],
    series: RenderSeries,
    fill: LineBuffer,
    line: LineBuffer,
    domain: { min: number; max: number }
  ): void {
    if (!this.lineProgram) return;
    const baseValue = domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
    const fillColor = withAlpha(colorFromId(series.id, 1), 0.2);
    if (this.setLineUniforms(gl, pane, domain, series, fillColor, baseValue, 1)) {
      gl.useProgram(this.lineProgram.program);
      this.bindLineBuffer(gl, this.lineProgram, fill);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, fill.count);
    }
    this.drawLineSeries(gl, pane, series, line, domain);
  }

  private drawHistogramSeries(
    gl: WebGL2RenderingContext,
    pane: RenderFrame["panes"][number],
    series: RenderSeries,
    buffer: InstanceBuffer,
    domain: { min: number; max: number }
  ): void {
    if (!this.barProgram || !this.quadIndexBuffer || buffer.count === 0) return;
    const baseValue = domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
    const halfWidth = this.computeBarHalfWidthTime(pane, series.timeMs.length);
    if (!this.setBarUniforms(gl, pane, domain, series, halfWidth, baseValue)) return;
    gl.useProgram(this.barProgram.program);
    this.bindBarBuffer(gl, this.barProgram, buffer);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, buffer.count);
  }

  private drawCandleSeries(
    gl: WebGL2RenderingContext,
    pane: RenderFrame["panes"][number],
    series: RenderSeries,
    buffers: CandleBuffers,
    domain: { min: number; max: number }
  ): void {
    if (!this.lineProgram || !this.quadProgram) return;
    if (buffers.wickUp && buffers.wickUp.count > 1) {
      if (this.setLineUniforms(gl, pane, domain, series, DEFAULT_UP_CANDLE, 0, 0)) {
        gl.useProgram(this.lineProgram.program);
        this.bindLineBuffer(gl, this.lineProgram, buffers.wickUp);
        gl.drawArrays(gl.LINES, 0, buffers.wickUp.count);
      }
    }
    if (buffers.wickDown && buffers.wickDown.count > 1) {
      if (this.setLineUniforms(gl, pane, domain, series, DEFAULT_DOWN_CANDLE, 0, 0)) {
        gl.useProgram(this.lineProgram.program);
        this.bindLineBuffer(gl, this.lineProgram, buffers.wickDown);
        gl.drawArrays(gl.LINES, 0, buffers.wickDown.count);
      }
    }
    if (buffers.body && buffers.body.count > 0) {
      const halfWidth = this.computeBarHalfWidthTime(pane, series.timeMs.length);
      if (!this.setQuadUniforms(gl, pane, domain, series, halfWidth)) return;
      gl.useProgram(this.quadProgram.program);
      this.bindQuadBuffer(gl, this.quadProgram, buffers.body);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, buffers.body.count);
    }
  }

  private setLineUniforms(
    gl: WebGL2RenderingContext,
    pane: RenderFrame["panes"][number],
    domain: { min: number; max: number },
    series: RenderSeries,
    color: RgbaColor,
    baseValue: number,
    useBase: number
  ): boolean {
    if (!this.lineProgram) return false;
    if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) return false;
    if (pane.plotArea.width <= 0 || pane.plotArea.height <= 0) return false;
    const range = pane.visibleRange;
    if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs) || range.endMs <= range.startMs) return false;
    const [rsHi, rsLo] = splitFloat64(range.startMs);
    const [reHi, reLo] = splitFloat64(range.endMs);
    gl.useProgram(this.lineProgram.program);
    gl.uniform1f(this.lineProgram.uniforms.rangeStartHigh, rsHi);
    gl.uniform1f(this.lineProgram.uniforms.rangeStartLow, rsLo);
    gl.uniform1f(this.lineProgram.uniforms.rangeEndHigh, reHi);
    gl.uniform1f(this.lineProgram.uniforms.rangeEndLow, reLo);
    gl.uniform1f(this.lineProgram.uniforms.domainMin, domain.min);
    gl.uniform1f(this.lineProgram.uniforms.domainMax, domain.max);
    gl.uniform2f(this.lineProgram.uniforms.plotOrigin, pane.plotArea.x, pane.plotArea.y);
    gl.uniform2f(this.lineProgram.uniforms.plotSize, pane.plotArea.width, pane.plotArea.height);
    gl.uniform2f(this.lineProgram.uniforms.viewport, this.width, this.height);
    gl.uniform4f(this.lineProgram.uniforms.color, color[0], color[1], color[2], color[3]);
    gl.uniform1f(this.lineProgram.uniforms.baseValue, baseValue);
    gl.uniform1f(this.lineProgram.uniforms.useBase, useBase);
    return true;
  }

  private setQuadUniforms(
    gl: WebGL2RenderingContext,
    pane: RenderFrame["panes"][number],
    domain: { min: number; max: number },
    series: RenderSeries,
    halfWidth: number
  ): boolean {
    if (!this.quadProgram) return false;
    if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) return false;
    if (pane.plotArea.width <= 0 || pane.plotArea.height <= 0) return false;
    const range = pane.visibleRange;
    if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs) || range.endMs <= range.startMs) return false;
    const [rsHi, rsLo] = splitFloat64(range.startMs);
    const [reHi, reLo] = splitFloat64(range.endMs);
    gl.useProgram(this.quadProgram.program);
    gl.uniform1f(this.quadProgram.uniforms.rangeStartHigh, rsHi);
    gl.uniform1f(this.quadProgram.uniforms.rangeStartLow, rsLo);
    gl.uniform1f(this.quadProgram.uniforms.rangeEndHigh, reHi);
    gl.uniform1f(this.quadProgram.uniforms.rangeEndLow, reLo);
    gl.uniform1f(this.quadProgram.uniforms.domainMin, domain.min);
    gl.uniform1f(this.quadProgram.uniforms.domainMax, domain.max);
    gl.uniform2f(this.quadProgram.uniforms.plotOrigin, pane.plotArea.x, pane.plotArea.y);
    gl.uniform2f(this.quadProgram.uniforms.plotSize, pane.plotArea.width, pane.plotArea.height);
    gl.uniform2f(this.quadProgram.uniforms.viewport, this.width, this.height);
    gl.uniform1f(this.quadProgram.uniforms.halfWidth, halfWidth);
    return true;
  }

  private setBarUniforms(
    gl: WebGL2RenderingContext,
    pane: RenderFrame["panes"][number],
    domain: { min: number; max: number },
    series: RenderSeries,
    halfWidth: number,
    baseValue: number
  ): boolean {
    if (!this.barProgram) return false;
    if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) return false;
    if (pane.plotArea.width <= 0 || pane.plotArea.height <= 0) return false;
    const range = pane.visibleRange;
    if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs) || range.endMs <= range.startMs) return false;
    const [rsHi, rsLo] = splitFloat64(range.startMs);
    const [reHi, reLo] = splitFloat64(range.endMs);
    gl.useProgram(this.barProgram.program);
    gl.uniform1f(this.barProgram.uniforms.rangeStartHigh, rsHi);
    gl.uniform1f(this.barProgram.uniforms.rangeStartLow, rsLo);
    gl.uniform1f(this.barProgram.uniforms.rangeEndHigh, reHi);
    gl.uniform1f(this.barProgram.uniforms.rangeEndLow, reLo);
    gl.uniform1f(this.barProgram.uniforms.domainMin, domain.min);
    gl.uniform1f(this.barProgram.uniforms.domainMax, domain.max);
    gl.uniform2f(this.barProgram.uniforms.plotOrigin, pane.plotArea.x, pane.plotArea.y);
    gl.uniform2f(this.barProgram.uniforms.plotSize, pane.plotArea.width, pane.plotArea.height);
    gl.uniform2f(this.barProgram.uniforms.viewport, this.width, this.height);
    gl.uniform1f(this.barProgram.uniforms.halfWidth, halfWidth);
    gl.uniform1f(this.barProgram.uniforms.baseValue, baseValue);
    return true;
  }

  private bindLineBuffer(gl: WebGL2RenderingContext, info: LineProgramInfo, buffer: LineBuffer): void {
    gl.bindVertexArray(info.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
    const stride = buffer.stride * Float32Array.BYTES_PER_ELEMENT;
    gl.vertexAttribPointer(info.attribs.timeHigh, 1, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(
      info.attribs.timeLow,
      1,
      gl.FLOAT,
      false,
      stride,
      Float32Array.BYTES_PER_ELEMENT
    );
    gl.vertexAttribPointer(
      info.attribs.value,
      1,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.vertexAttribPointer(
      info.attribs.side,
      1,
      gl.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT
    );
  }

  private bindQuadBuffer(gl: WebGL2RenderingContext, info: QuadProgramInfo, buffer: InstanceBuffer): void {
    gl.bindVertexArray(info.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
    const stride = buffer.stride * Float32Array.BYTES_PER_ELEMENT;
    gl.vertexAttribDivisor(info.attribs.timeHigh, 1);
    gl.vertexAttribDivisor(info.attribs.timeLow, 1);
    gl.vertexAttribDivisor(info.attribs.value0, 1);
    gl.vertexAttribDivisor(info.attribs.value1, 1);
    gl.vertexAttribDivisor(info.attribs.color, 1);
    gl.vertexAttribPointer(info.attribs.timeHigh, 1, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(
      info.attribs.timeLow,
      1,
      gl.FLOAT,
      false,
      stride,
      Float32Array.BYTES_PER_ELEMENT
    );
    gl.vertexAttribPointer(
      info.attribs.value0,
      1,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.vertexAttribPointer(
      info.attribs.value1,
      1,
      gl.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.vertexAttribPointer(
      info.attribs.color,
      4,
      gl.FLOAT,
      false,
      stride,
      4 * Float32Array.BYTES_PER_ELEMENT
    );
  }

  private bindBarBuffer(gl: WebGL2RenderingContext, info: BarProgramInfo, buffer: InstanceBuffer): void {
    gl.bindVertexArray(info.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
    const stride = buffer.stride * Float32Array.BYTES_PER_ELEMENT;
    gl.vertexAttribDivisor(info.attribs.timeHigh, 1);
    gl.vertexAttribDivisor(info.attribs.timeLow, 1);
    gl.vertexAttribDivisor(info.attribs.value, 1);
    gl.vertexAttribDivisor(info.attribs.color, 1);
    gl.vertexAttribPointer(info.attribs.timeHigh, 1, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(
      info.attribs.timeLow,
      1,
      gl.FLOAT,
      false,
      stride,
      Float32Array.BYTES_PER_ELEMENT
    );
    gl.vertexAttribPointer(
      info.attribs.value,
      1,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.vertexAttribPointer(
      info.attribs.color,
      4,
      gl.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT
    );
  }

  private computeBarHalfWidthTime(pane: RenderFrame["panes"][number], count: number): number {
    if (pane.plotArea.width <= 0) return 0;
    const span = pane.visibleRange.endMs - pane.visibleRange.startMs;
    if (!Number.isFinite(span) || span <= 0) return 0;
    const barWidthPx = this.computeBarWidth(pane, count);
    const widthTime = (barWidthPx / pane.plotArea.width) * span;
    return widthTime * 0.5;
  }

  private renderLabelBackgrounds(labels: TextLabel[]): void {
    if (!this.gl || !this.dynamicProgram || !this.dynamicVao || !this.dynamicVbo) return;
    const gl = this.gl;
    const commands: DrawCommand[] = [];
    this.dynamicBuffer.reset();
    for (const label of labels) {
      if (!label.background) continue;
      const padding = label.padding ?? 4;
      const metrics = this.measureLabel(label.text);
      const rect = computeLabelRect(label, metrics, padding);
      const color = parseColor(label.background, [0, 0, 0, 0.6]);
      this.appendRect(rect.x, rect.y, rect.width, rect.height, color, commands);
    }
    this.flushDynamic(gl, commands);
  }

  private measureLabel(text: string): LabelMetrics {
    if (this.gpuText) {
      const metrics = this.gpuText.measureText(text);
      return { width: metrics.width, height: metrics.height, ascent: metrics.ascent, descent: metrics.descent };
    }
    const width = Math.max(1, text.length * 7);
    return { width, height: 12, ascent: 9, descent: 3 };
  }

  private appendRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: RgbaColor,
    commands: DrawCommand[]
  ): void {
    const [x0, y0] = this.toNdc(x, y);
    const [x1, y1] = this.toNdc(x + width, y + height);
    const start = this.dynamicBuffer.vertexCount;
    this.dynamicBuffer.pushVertex(x0, y0, color[0], color[1], color[2], color[3]);
    this.dynamicBuffer.pushVertex(x1, y0, color[0], color[1], color[2], color[3]);
    this.dynamicBuffer.pushVertex(x1, y1, color[0], color[1], color[2], color[3]);
    this.dynamicBuffer.pushVertex(x1, y1, color[0], color[1], color[2], color[3]);
    this.dynamicBuffer.pushVertex(x0, y1, color[0], color[1], color[2], color[3]);
    this.dynamicBuffer.pushVertex(x0, y0, color[0], color[1], color[2], color[3]);
    const count = this.dynamicBuffer.vertexCount - start;
    if (count > 0) {
      commands.push({ mode: this.glTriangles(), first: start, count });
    }
  }

  private pushClip(gl: WebGL2RenderingContext, plotArea: PlotArea): void {
    this.clipStack.push(plotArea);
    this.applyScissor(gl, plotArea);
  }

  private popClip(gl: WebGL2RenderingContext): void {
    this.clipStack.pop();
    const next = this.clipStack[this.clipStack.length - 1];
    if (next) {
      this.applyScissor(gl, next);
    } else {
      gl.scissor(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private appendGridAndAxes(
    pane: RenderFrame["panes"][number],
    commands: DrawCommand[],
    labels: TextLabel[],
    isBottomPane: boolean
  ): void {
    const plotArea = pane.plotArea;
    const axis = pane.axis;
    const primaryScale =
      axis.left.find((item) => item.scaleId === axis.primaryScaleId) ??
      axis.right.find((item) => item.scaleId === axis.primaryScaleId) ??
      axis.right[0] ??
      axis.left[0];
    const yTicks = primaryScale?.ticks ?? [];
    const xTicks = axis.time ?? [];

    const domain = pane.scaleDomains[axis.primaryScaleId] ?? pane.scaleDomains.price;
    const gridStart = this.dynamicBuffer.vertexCount;
    if (domain) {
      for (const tick of yTicks) {
      const y = priceToY(domain, plotArea, tick.value);
      if (y === null) continue;
      const [x0, y0] = this.toNdc(plotArea.x, y);
      const [x1, y1] = this.toNdc(plotArea.x + plotArea.width, y);
      this.dynamicBuffer.pushVertex(x0, y0, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
      this.dynamicBuffer.pushVertex(x1, y1, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
    }
    }
    for (const tick of xTicks) {
      const x = timeToX(pane.visibleRange, plotArea, tick.value);
      if (x === null) continue;
      const [x0, y0] = this.toNdc(x, plotArea.y);
      const [x1, y1] = this.toNdc(x, plotArea.y + plotArea.height);
      this.dynamicBuffer.pushVertex(x0, y0, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
      this.dynamicBuffer.pushVertex(x1, y1, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
    }
    const gridCount = this.dynamicBuffer.vertexCount - gridStart;
    if (gridCount > 0) {
      commands.push({ mode: this.glLines(), first: gridStart, count: gridCount });
    }

    const axisStart = this.dynamicBuffer.vertexCount;
    if (axis.left.length > 0) {
      const [lx0, ly0] = this.toNdc(plotArea.x, plotArea.y);
      const [lx1, ly1] = this.toNdc(plotArea.x, plotArea.y + plotArea.height);
      this.dynamicBuffer.pushVertex(lx0, ly0, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
      this.dynamicBuffer.pushVertex(lx1, ly1, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
    }
    if (axis.right.length > 0) {
      const axisX = plotArea.x + plotArea.width;
      const [rx0, ry0] = this.toNdc(axisX, plotArea.y);
      const [rx1, ry1] = this.toNdc(axisX, plotArea.y + plotArea.height);
      this.dynamicBuffer.pushVertex(rx0, ry0, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
      this.dynamicBuffer.pushVertex(rx1, ry1, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
    }
    const axisCount = this.dynamicBuffer.vertexCount - axisStart;
    if (axisCount > 0) {
      commands.push({ mode: this.glLines(), first: axisStart, count: axisCount });
    }

    for (const scale of axis.left) {
      if (!scale.visible) continue;
      const domain = pane.scaleDomains[scale.scaleId];
      if (!domain) continue;
      const labelX = plotArea.x - 6;
      for (const tick of scale.ticks) {
        const y = priceToY(domain, plotArea, tick.value);
        if (y === null) continue;
        labels.push({
          x: labelX,
          y,
          text: tick.label,
          color: "#cfd3da",
          align: "right",
          baseline: "middle"
        });
      }
    }
    for (const scale of axis.right) {
      if (!scale.visible) continue;
      const domain = pane.scaleDomains[scale.scaleId];
      if (!domain) continue;
      const labelX = plotArea.x + plotArea.width + 6;
      for (const tick of scale.ticks) {
        const y = priceToY(domain, plotArea, tick.value);
        if (y === null) continue;
        labels.push({
          x: labelX,
          y,
          text: tick.label,
          color: "#cfd3da",
          align: "left",
          baseline: "middle"
        });
      }
    }

    if (isBottomPane) {
      const labelY = plotArea.y + plotArea.height - 12;
      for (const tick of xTicks) {
        const x = timeToX(pane.visibleRange, plotArea, tick.value);
        if (x === null) continue;
        labels.push({
          x,
          y: labelY,
          text: tick.label,
          color: "#cfd3da",
          align: "center",
          baseline: "top"
        });
      }
    }
  }

  private appendCrosshair(
    pane: RenderFrame["panes"][number],
    crosshair: RenderCrosshair,
    commands: DrawCommand[],
    labels: TextLabel[]
  ): void {
    const plotArea = pane.plotArea;
    const x = crosshair.x;
    const y = crosshair.y ?? plotArea.y;
    if (x < plotArea.x || x > plotArea.x + plotArea.width) return;
    if (crosshair.showHorizontal && (y < plotArea.y || y > plotArea.y + plotArea.height)) return;

    const start = this.dynamicBuffer.vertexCount;
    if (crosshair.showVertical) {
      const [vx0, vy0] = this.toNdc(x, plotArea.y);
      const [vx1, vy1] = this.toNdc(x, plotArea.y + plotArea.height);
      this.dynamicBuffer.pushVertex(vx0, vy0, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
      this.dynamicBuffer.pushVertex(vx1, vy1, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
    }
    if (crosshair.showHorizontal) {
      const [hx0, hy0] = this.toNdc(plotArea.x, y);
      const [hx1, hy1] = this.toNdc(plotArea.x + plotArea.width, y);
      this.dynamicBuffer.pushVertex(hx0, hy0, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
      this.dynamicBuffer.pushVertex(hx1, hy1, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
    }

    const count = this.dynamicBuffer.vertexCount - start;
    if (count > 0) {
      commands.push({ mode: this.glLines(), first: start, count });
    }

    if (crosshair.showPriceLabel && crosshair.price != null && Number.isFinite(crosshair.price) && crosshair.showHorizontal) {
      labels.push({
        x: plotArea.x + plotArea.width + 6,
        y,
        text: formatPrice(crosshair.price),
        color: "#ffffff",
        align: "left",
        baseline: "middle",
        background: "rgba(0,0,0,0.6)",
        padding: 3
      });
    }

    if (crosshair.showTimeLabel) {
      labels.push({
        x,
        y: plotArea.y + plotArea.height - 12,
        text: formatTimestamp(crosshair.timeMs),
        color: "#ffffff",
        align: "center",
        baseline: "top",
        background: "rgba(0,0,0,0.6)",
        padding: 3
      });
    }
  }

  private appendOverlayLine(
    pane: RenderFrame["panes"][number],
    overlay: OverlayPrimitive,
    data: LineOverlayData,
    commands: DrawCommand[]
  ): void {
    const range = pane.visibleRange;
    const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
    if (!domain) return;
    const color = colorFromId(overlay.id, 1);
    const start = this.dynamicBuffer.vertexCount;
    let prevX: number | null = null;
    let prevY: number | null = null;
    for (const point of data.points) {
      const x = timeToX(range, pane.plotArea, point.timeMs);
      const y = priceToY(domain, pane.plotArea, point.value);
      if (x === null || y === null) continue;
      if (data.step && prevX !== null && prevY !== null) {
        const [sx, sy] = this.toNdc(x, prevY);
        this.dynamicBuffer.pushVertex(sx, sy, color[0], color[1], color[2], color[3]);
      }
      const [nx, ny] = this.toNdc(x, y);
      this.dynamicBuffer.pushVertex(nx, ny, color[0], color[1], color[2], color[3]);
      prevX = x;
      prevY = y;
    }
    const count = this.dynamicBuffer.vertexCount - start;
    if (count > 1) {
      commands.push({ mode: this.glLineStrip(), first: start, count });
    }
  }

  private appendOverlayArea(
    pane: RenderFrame["panes"][number],
    overlay: OverlayPrimitive,
    data: AreaOverlayData,
    commands: DrawCommand[]
  ): void {
    const range = pane.visibleRange;
    const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
    if (!domain) return;
    const baseValue =
      data.baseValue !== undefined ? data.baseValue : domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
    const baseY = priceToY(domain, pane.plotArea, baseValue);
    if (baseY === null) return;
    const fillColor = withAlpha(colorFromId(overlay.id, 1), 0.2);
    let prevX: number | null = null;
    let prevY: number | null = null;
    for (const point of data.points) {
      const x = timeToX(range, pane.plotArea, point.timeMs);
      const y = priceToY(domain, pane.plotArea, point.value);
      if (x === null || y === null) continue;
      if (prevX !== null && prevY !== null) {
        const [x0, y0] = this.toNdc(prevX, prevY);
        const [x1, y1] = this.toNdc(x, y);
        const [x0b, y0b] = this.toNdc(prevX, baseY);
        const [x1b, y1b] = this.toNdc(x, baseY);
        const start = this.dynamicBuffer.vertexCount;
        this.dynamicBuffer.pushVertex(x0, y0, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.dynamicBuffer.pushVertex(x1b, y1b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        const count = this.dynamicBuffer.vertexCount - start;
        if (count > 0) {
          commands.push({ mode: this.glTriangles(), first: start, count });
        }
      }
      prevX = x;
      prevY = y;
    }
    this.appendOverlayLine(pane, overlay, { points: data.points, step: data.step }, commands);
  }

  private appendOverlayHistogram(
    pane: RenderFrame["panes"][number],
    overlay: OverlayPrimitive,
    data: HistogramOverlayData,
    commands: DrawCommand[]
  ): void {
    const range = pane.visibleRange;
    const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
    if (!domain) return;
    const baseValue =
      data.baseValue !== undefined ? data.baseValue : domain.min <= 0 && domain.max >= 0 ? 0 : domain.min;
    const baseY = priceToY(domain, pane.plotArea, baseValue);
    if (baseY === null) return;
    const color = colorFromId(overlay.id, 1);
    const barWidth = this.computeBarWidth(pane, data.points.length);
    for (const point of data.points) {
      const x = timeToX(range, pane.plotArea, point.timeMs);
      const y = priceToY(domain, pane.plotArea, point.value);
      if (x === null || y === null) continue;
      const left = x - barWidth * 0.5;
      const right = x + barWidth * 0.5;
      const top = Math.min(y, baseY);
      const bottom = Math.max(y, baseY);
      const [lx, ty] = this.toNdc(left, top);
      const [rx, by] = this.toNdc(right, bottom);
      const start = this.dynamicBuffer.vertexCount;
      this.dynamicBuffer.pushVertex(lx, ty, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(rx, by, color[0], color[1], color[2], color[3]);
      const count = this.dynamicBuffer.vertexCount - start;
      if (count > 0) {
        commands.push({ mode: this.glTriangles(), first: start, count });
      }
    }
  }

  private appendOverlayHLine(
    pane: RenderFrame["panes"][number],
    overlay: OverlayPrimitive,
    data: HLineOverlayData,
    commands: DrawCommand[]
  ): void {
    const range = pane.visibleRange;
    const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
    if (!domain) return;
    const y = priceToY(domain, pane.plotArea, data.value);
    if (y === null) return;
    const startTime = data.fromTimeMs ?? range.startMs;
    const endTime = data.toTimeMs ?? range.endMs;
    const x0 = timeToX(range, pane.plotArea, clampTime(range, startTime));
    const x1 = timeToX(range, pane.plotArea, clampTime(range, endTime));
    if (x0 === null || x1 === null) return;
    const color = DEFAULT_OVERLAY;
    const start = this.dynamicBuffer.vertexCount;
    const [nx0, ny] = this.toNdc(x0, y);
    const [nx1, ny1] = this.toNdc(x1, y);
    this.dynamicBuffer.pushVertex(nx0, ny, color[0], color[1], color[2], color[3]);
    this.dynamicBuffer.pushVertex(nx1, ny1, color[0], color[1], color[2], color[3]);
    const count = this.dynamicBuffer.vertexCount - start;
    if (count > 0) {
      commands.push({ mode: this.glLines(), first: start, count });
    }
  }

  private appendOverlayZone(
    pane: RenderFrame["panes"][number],
    overlay: OverlayPrimitive,
    data: ZoneOverlayData,
    commands: DrawCommand[]
  ): void {
    const range = pane.visibleRange;
    const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
    if (!domain) return;
    const fill = DEFAULT_OVERLAY_FILL;
    let prev: ZoneOverlayData["points"][number] | null = null;
    for (const point of data.points) {
      if (prev) {
        const x0 = timeToX(range, pane.plotArea, prev.timeMs);
        const x1 = timeToX(range, pane.plotArea, point.timeMs);
        if (x0 === null || x1 === null) {
          prev = point;
          continue;
        }
        const top0 = priceToY(domain, pane.plotArea, prev.top);
        const bot0 = priceToY(domain, pane.plotArea, prev.bottom);
        const top1 = priceToY(domain, pane.plotArea, point.top);
        const bot1 = priceToY(domain, pane.plotArea, point.bottom);
        if (top0 === null || bot0 === null || top1 === null || bot1 === null) {
          prev = point;
          continue;
        }
        const [x0t, y0t] = this.toNdc(x0, top0);
        const [x0b, y0b] = this.toNdc(x0, bot0);
        const [x1t, y1t] = this.toNdc(x1, top1);
        const [x1b, y1b] = this.toNdc(x1, bot1);
        const start = this.dynamicBuffer.vertexCount;
        this.dynamicBuffer.pushVertex(x0t, y0t, fill[0], fill[1], fill[2], fill[3]);
        this.dynamicBuffer.pushVertex(x0b, y0b, fill[0], fill[1], fill[2], fill[3]);
        this.dynamicBuffer.pushVertex(x1t, y1t, fill[0], fill[1], fill[2], fill[3]);
        this.dynamicBuffer.pushVertex(x1t, y1t, fill[0], fill[1], fill[2], fill[3]);
        this.dynamicBuffer.pushVertex(x0b, y0b, fill[0], fill[1], fill[2], fill[3]);
        this.dynamicBuffer.pushVertex(x1b, y1b, fill[0], fill[1], fill[2], fill[3]);
        const count = this.dynamicBuffer.vertexCount - start;
        if (count > 0) {
          commands.push({ mode: this.glTriangles(), first: start, count });
        }
      }
      prev = point;
    }
  }

  private appendOverlayMarkers(
    pane: RenderFrame["panes"][number],
    overlay: OverlayPrimitive,
    data: MarkerOverlayData,
    commands: DrawCommand[]
  ): void {
    const range = pane.visibleRange;
    const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
    if (!domain) return;
    const color = colorFromId(overlay.id, 1);
    const start = this.dynamicBuffer.vertexCount;
    const size = 6;
    for (const point of data.points) {
      const x = timeToX(range, pane.plotArea, point.timeMs);
      const y = priceToY(domain, pane.plotArea, point.value);
      if (x === null || y === null) continue;
      const [nx0, ny0] = this.toNdc(x - size, y);
      const [nx1, ny1] = this.toNdc(x + size, y);
      const [nx2, ny2] = this.toNdc(x, y - size);
      const [nx3, ny3] = this.toNdc(x, y + size);
      this.dynamicBuffer.pushVertex(nx0, ny0, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(nx1, ny1, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(nx2, ny2, color[0], color[1], color[2], color[3]);
      this.dynamicBuffer.pushVertex(nx3, ny3, color[0], color[1], color[2], color[3]);
    }
    const count = this.dynamicBuffer.vertexCount - start;
    if (count > 0) {
      commands.push({ mode: this.glLines(), first: start, count });
    }
  }

  private appendOverlayLabels(
    pane: RenderFrame["panes"][number],
    overlay: OverlayPrimitive,
    data: LabelOverlayData,
    labels: TextLabel[]
  ): void {
    const range = pane.visibleRange;
    const domain = pane.scaleDomains[overlay.scaleId ?? "price"] ?? pane.scaleDomains.price;
    if (!domain) return;
    for (const point of data.points) {
      const x = timeToX(range, pane.plotArea, point.timeMs);
      const y = priceToY(domain, pane.plotArea, point.value);
      if (x === null || y === null) continue;
      labels.push({
        x,
        y,
        text: point.text,
        color: "#ffffff",
        align: "left",
        baseline: "middle"
      });
    }
  }

  private toNdc(x: number, y: number): [number, number] {
    const nx = (x / this.width) * 2 - 1;
    const ny = 1 - (y / this.height) * 2;
    return [nx, ny];
  }

  private computeBarWidth(pane: RenderFrame["panes"][number], count: number): number {
    const safeCount = Math.max(1, count);
    const spacing = pane.plotArea.width / safeCount;
    return Math.max(1, spacing * 0.7);
  }

  private findBottomPaneId(panes: RenderFrame["panes"]): string | null {
    if (panes.length === 0) return null;
    let bottom = panes[0];
    let maxY = bottom.plotArea.y + bottom.plotArea.height;
    for (const pane of panes) {
      const y = pane.plotArea.y + pane.plotArea.height;
      if (y > maxY) {
        maxY = y;
        bottom = pane;
      }
    }
    return bottom.paneId;
  }

  private applyScissor(gl: WebGL2RenderingContext, plotArea: RenderFrame["panes"][number]["plotArea"]): void {
    const x = Math.floor(plotArea.x * this.dpr);
    const y = Math.floor((this.height - (plotArea.y + plotArea.height)) * this.dpr);
    const w = Math.floor(plotArea.width * this.dpr);
    const h = Math.floor(plotArea.height * this.dpr);
    gl.scissor(x, y, w, h);
  }

  private glLineStrip(): number {
    return this.gl ? this.gl.LINE_STRIP : 0;
  }

  private glLines(): number {
    return this.gl ? this.gl.LINES : 0;
  }

  private glTriangles(): number {
    return this.gl ? this.gl.TRIANGLES : 0;
  }
}

function clampTime(range: Range, time: number): number {
  return Math.min(Math.max(time, range.startMs), range.endMs);
}

function formatPrice(value: number): string {
  const abs = Math.abs(value);
  let decimals = 2;
  if (abs < 1) decimals = 6;
  else if (abs < 100) decimals = 4;
  return value.toFixed(decimals);
}

function coalesceDrawCommands(commands: DrawCommand[]): DrawCommand[] {
  if (commands.length <= 1) return commands;
  const result: DrawCommand[] = [];
  let current = { ...commands[0] };
  for (let i = 1; i < commands.length; i += 1) {
    const next = commands[i];
    if (next.mode === current.mode && next.first === current.first + current.count) {
      current.count += next.count;
    } else {
      result.push(current);
      current = { ...next };
    }
  }
  result.push(current);
  return result;
}

type LineBuffer = {
  buffer: WebGLBuffer;
  uploader: GpuBuffer;
  count: number;
  stride: number;
  data: Float32Array;
};

type LineData = {
  data: Float32Array;
  count: number;
};

type BufferRebuildContext = {
  seriesId: string;
  buffer: string;
};

type InstanceBuffer = {
  buffer: WebGLBuffer;
  uploader: GpuBuffer;
  count: number;
  stride: number;
  data: Float32Array;
};

type InstanceData = {
  data: Float32Array;
  count: number;
  stride: number;
};

type CandleBuffers = {
  wickUp: LineBuffer | null;
  wickDown: LineBuffer | null;
  body: InstanceBuffer | null;
};

type SeriesGpuEntry = {
  seriesRef: RenderSeries;
  gpuBytes?: number;
  line?: LineBuffer | null;
  area?: LineBuffer | null;
  histogram?: InstanceBuffer | null;
  candles?: CandleBuffers | null;
};

type LineProgramInfo = {
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

type QuadProgramInfo = {
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
  };
};

type BarProgramInfo = {
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

type LabelMetrics = {
  width: number;
  height: number;
  ascent: number;
  descent: number;
};

function computeLabelRect(label: TextLabel, metrics: LabelMetrics, padding: number): { x: number; y: number; width: number; height: number } {
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
  const x0 = x - padding;
  const y0 = baseline - metrics.ascent - padding;
  const width = metrics.width + padding * 2;
  const height = metrics.height + padding * 2;
  return { x: x0, y: y0, width, height };
}

function splitFloat64(value: number): [number, number] {
  const high = Math.fround(value);
  const low = value - high;
  return [high, low];
}

function createLineProgramInfo(gl: WebGL2RenderingContext, program: WebGLProgram): LineProgramInfo {
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

function createQuadProgramInfo(
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

function createBarProgramInfo(
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

const VERT_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec4 a_color;
out vec4 v_color;
void main() {
  v_color = a_color;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG_SHADER_SOURCE = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;

const SERIES_LINE_VERT = `#version 300 es
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

const SERIES_LINE_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;

const SERIES_QUAD_VERT = `#version 300 es
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

const SERIES_QUAD_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;

const SERIES_BAR_VERT = `#version 300 es
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

const SERIES_BAR_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;
