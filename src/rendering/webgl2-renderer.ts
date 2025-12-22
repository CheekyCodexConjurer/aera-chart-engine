import { RenderFrame, RenderSeries, Renderer } from "./renderer.js";
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
  withAlpha
} from "./color.js";
import { DynamicVertexBuffer, DrawCommand } from "./vertex-buffer.js";
import { timeToX, priceToY } from "../core/transform.js";
import { TextLabel, TextLayer } from "./text-layer.js";
import { formatTimestamp, generateNumericTicks, generateTimeTicks } from "./ticks.js";
import {
  AreaOverlayData,
  CrosshairEvent,
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

export type WebGL2RendererOptions = {
  onError?: (message: string) => void;
  clearColor?: RgbaColor;
  textLayer?: TextLayer;
};

export class WebGL2Renderer implements Renderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private buffer = new DynamicVertexBuffer(6, 4096);
  private gpuBuffer = new GpuBuffer();
  private width = 0;
  private height = 0;
  private dpr = 1;
  private warnedMissingTextLayer = false;

  constructor(private canvas: HTMLCanvasElement, private options: WebGL2RendererOptions = {}) {}

  initialize(): void {
    this.gl = this.canvas.getContext("webgl2");
    if (!this.gl) {
      this.options.onError?.("WebGL2 context not available");
      return;
    }
    const program = createProgram(this.gl, VERT_SHADER_SOURCE, FRAG_SHADER_SOURCE);
    if (!program) {
      this.options.onError?.("Failed to compile WebGL2 program");
      return;
    }
    this.program = program;
    this.vao = this.gl.createVertexArray();
    this.vbo = this.gl.createBuffer();
    if (!this.vao || !this.vbo) {
      this.options.onError?.("Failed to allocate WebGL buffers");
      return;
    }
    this.gl.bindVertexArray(this.vao);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    const positionLocation = this.gl.getAttribLocation(program, "a_position");
    const colorLocation = this.gl.getAttribLocation(program, "a_color");
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
  }

  render(frame: RenderFrame): void {
    if (!this.gl || !this.program || !this.vao || !this.vbo) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    const clear = this.options.clearColor ?? DEFAULT_CLEAR;
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const labels: TextLabel[] = [];
    const bottomPaneId = this.findBottomPaneId(frame.panes);
    for (const pane of frame.panes) {
      const isBottom = pane.paneId === bottomPaneId;
      const crosshair = frame.crosshair && frame.crosshair.paneId === pane.paneId ? frame.crosshair : null;
      labels.push(...this.renderPane(gl, pane, frame.overlays, isBottom, crosshair));
    }

    if (this.options.textLayer) {
      this.options.textLayer.clear();
      for (const label of labels) {
        this.options.textLayer.drawLabel(label);
      }
    } else if (labels.length > 0 && !this.warnedMissingTextLayer) {
      this.options.onError?.("Label overlays skipped: text layer not configured");
      this.warnedMissingTextLayer = true;
    }

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
  }

  private renderPane(
    gl: WebGL2RenderingContext,
    pane: RenderFrame["panes"][number],
    overlays: OverlayRenderItem[],
    isBottomPane: boolean,
    crosshair: CrosshairEvent | null
  ): TextLabel[] {
    const plotArea = pane.plotArea;
    if (plotArea.width <= 0 || plotArea.height <= 0) return [];
    this.applyScissor(gl, plotArea);

    const labels: TextLabel[] = [];
    const commands: DrawCommand[] = [];
    this.buffer.reset();

    const paneOverlays = overlays.filter(
      (item) => (item.overlay.paneId ?? "price") === pane.paneId
    );
    const below = paneOverlays.filter((item) => (item.overlay.layer ?? "above") === "below");
    const above = paneOverlays.filter((item) => (item.overlay.layer ?? "above") === "above");
    const ui = paneOverlays.filter((item) => item.overlay.layer === "ui");

    this.appendGridAndAxes(pane, commands, labels, isBottomPane);
    this.appendOverlays(pane, below, commands, labels);
    for (const series of pane.series) {
      this.appendSeries(pane, series, commands);
    }
    this.appendOverlays(pane, above, commands, labels);
    this.appendOverlays(pane, ui, commands, labels);
    if (crosshair) {
      this.appendCrosshair(pane, crosshair, commands, labels, isBottomPane);
    }

    const data = this.buffer.buffer;
    if (data.length > 0 && commands.length > 0) {
      const optimized = coalesceDrawCommands(commands);
      this.gpuBuffer.upload(gl, data, gl.DYNAMIC_DRAW);
      for (const command of optimized) {
        gl.drawArrays(command.mode, command.first, command.count);
      }
    }

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
    const start = this.buffer.vertexCount;
    for (let i = 0; i < series.timeMs.length; i += 1) {
      const x = timeToX(range, pane.plotArea, series.timeMs[i]);
      const y = priceToY(pane.scaleDomains[series.scaleId] ?? pane.scaleDomains.price, pane.plotArea, values[i]);
      if (x === null || y === null) continue;
      const [nx, ny] = this.toNdc(x, y);
      this.buffer.pushVertex(nx, ny, color[0], color[1], color[2], color[3]);
    }
    const count = this.buffer.vertexCount - start;
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
        const start = this.buffer.vertexCount;
        this.buffer.pushVertex(x0, y0, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x1b, y1b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        const count = this.buffer.vertexCount - start;
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
      const start = this.buffer.vertexCount;
      this.buffer.pushVertex(lx, ty, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.buffer.pushVertex(lx, by, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.buffer.pushVertex(rx, ty, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.buffer.pushVertex(rx, ty, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.buffer.pushVertex(lx, by, barColor[0], barColor[1], barColor[2], barColor[3]);
      this.buffer.pushVertex(rx, by, barColor[0], barColor[1], barColor[2], barColor[3]);
      const count = this.buffer.vertexCount - start;
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
    const wickStart = this.buffer.vertexCount;
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
      this.buffer.pushVertex(nx, nyHigh, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(nx2, nyLow, color[0], color[1], color[2], color[3]);
    }
    const wickCount = this.buffer.vertexCount - wickStart;
    if (wickCount > 0) {
      commands.push({ mode: this.glLines(), first: wickStart, count: wickCount });
    }

    const bodyStart = this.buffer.vertexCount;
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
      this.buffer.pushVertex(lx, ty, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(rx, by, color[0], color[1], color[2], color[3]);
    }
    const bodyCount = this.buffer.vertexCount - bodyStart;
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

  private appendGridAndAxes(
    pane: RenderFrame["panes"][number],
    commands: DrawCommand[],
    labels: TextLabel[],
    isBottomPane: boolean
  ): void {
    const plotArea = pane.plotArea;
    const domains = Object.values(pane.scaleDomains);
    const primaryDomain = pane.scaleDomains.price ?? domains[0];
    if (!primaryDomain) return;

    const yTicks = generateNumericTicks(
      primaryDomain.min,
      primaryDomain.max,
      Math.max(2, Math.floor(plotArea.height / 60))
    );
    const xTicks = generateTimeTicks(pane.visibleRange, plotArea.width);

    const gridStart = this.buffer.vertexCount;
    for (const tick of yTicks) {
      const y = priceToY(primaryDomain, plotArea, tick.value);
      if (y === null) continue;
      const [x0, y0] = this.toNdc(plotArea.x, y);
      const [x1, y1] = this.toNdc(plotArea.x + plotArea.width, y);
      this.buffer.pushVertex(x0, y0, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
      this.buffer.pushVertex(x1, y1, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
    }
    for (const tick of xTicks) {
      const x = timeToX(pane.visibleRange, plotArea, tick.value);
      if (x === null) continue;
      const [x0, y0] = this.toNdc(x, plotArea.y);
      const [x1, y1] = this.toNdc(x, plotArea.y + plotArea.height);
      this.buffer.pushVertex(x0, y0, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
      this.buffer.pushVertex(x1, y1, DEFAULT_GRID[0], DEFAULT_GRID[1], DEFAULT_GRID[2], DEFAULT_GRID[3]);
    }
    const gridCount = this.buffer.vertexCount - gridStart;
    if (gridCount > 0) {
      commands.push({ mode: this.glLines(), first: gridStart, count: gridCount });
    }

    const axisStart = this.buffer.vertexCount;
    const axisX = plotArea.x + plotArea.width;
    const [ax0, ay0] = this.toNdc(axisX, plotArea.y);
    const [ax1, ay1] = this.toNdc(axisX, plotArea.y + plotArea.height);
    this.buffer.pushVertex(ax0, ay0, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
    this.buffer.pushVertex(ax1, ay1, DEFAULT_AXIS[0], DEFAULT_AXIS[1], DEFAULT_AXIS[2], DEFAULT_AXIS[3]);
    const axisCount = this.buffer.vertexCount - axisStart;
    if (axisCount > 0) {
      commands.push({ mode: this.glLines(), first: axisStart, count: axisCount });
    }

    const labelX = plotArea.x + plotArea.width + 6;
    for (const tick of yTicks) {
      const y = priceToY(primaryDomain, plotArea, tick.value);
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
    crosshair: CrosshairEvent,
    commands: DrawCommand[],
    labels: TextLabel[],
    isBottomPane: boolean
  ): void {
    const plotArea = pane.plotArea;
    const x = crosshair.screen.x;
    const y = crosshair.screen.y;
    if (x < plotArea.x || x > plotArea.x + plotArea.width) return;
    if (y < plotArea.y || y > plotArea.y + plotArea.height) return;

    const start = this.buffer.vertexCount;
    const [vx0, vy0] = this.toNdc(x, plotArea.y);
    const [vx1, vy1] = this.toNdc(x, plotArea.y + plotArea.height);
    this.buffer.pushVertex(vx0, vy0, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
    this.buffer.pushVertex(vx1, vy1, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);

    const [hx0, hy0] = this.toNdc(plotArea.x, y);
    const [hx1, hy1] = this.toNdc(plotArea.x + plotArea.width, y);
    this.buffer.pushVertex(hx0, hy0, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);
    this.buffer.pushVertex(hx1, hy1, DEFAULT_CROSSHAIR[0], DEFAULT_CROSSHAIR[1], DEFAULT_CROSSHAIR[2], DEFAULT_CROSSHAIR[3]);

    const count = this.buffer.vertexCount - start;
    if (count > 0) {
      commands.push({ mode: this.glLines(), first: start, count });
    }

    if (crosshair.price !== null && Number.isFinite(crosshair.price)) {
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

    if (isBottomPane) {
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
    const start = this.buffer.vertexCount;
    let prevX: number | null = null;
    let prevY: number | null = null;
    for (const point of data.points) {
      const x = timeToX(range, pane.plotArea, point.timeMs);
      const y = priceToY(domain, pane.plotArea, point.value);
      if (x === null || y === null) continue;
      if (data.step && prevX !== null && prevY !== null) {
        const [sx, sy] = this.toNdc(x, prevY);
        this.buffer.pushVertex(sx, sy, color[0], color[1], color[2], color[3]);
      }
      const [nx, ny] = this.toNdc(x, y);
      this.buffer.pushVertex(nx, ny, color[0], color[1], color[2], color[3]);
      prevX = x;
      prevY = y;
    }
    const count = this.buffer.vertexCount - start;
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
        const start = this.buffer.vertexCount;
        this.buffer.pushVertex(x0, y0, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x1, y1, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x0b, y0b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        this.buffer.pushVertex(x1b, y1b, fillColor[0], fillColor[1], fillColor[2], fillColor[3]);
        const count = this.buffer.vertexCount - start;
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
      const start = this.buffer.vertexCount;
      this.buffer.pushVertex(lx, ty, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(rx, ty, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(lx, by, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(rx, by, color[0], color[1], color[2], color[3]);
      const count = this.buffer.vertexCount - start;
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
    const start = this.buffer.vertexCount;
    const [nx0, ny] = this.toNdc(x0, y);
    const [nx1, ny1] = this.toNdc(x1, y);
    this.buffer.pushVertex(nx0, ny, color[0], color[1], color[2], color[3]);
    this.buffer.pushVertex(nx1, ny1, color[0], color[1], color[2], color[3]);
    const count = this.buffer.vertexCount - start;
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
        const start = this.buffer.vertexCount;
        this.buffer.pushVertex(x0t, y0t, fill[0], fill[1], fill[2], fill[3]);
        this.buffer.pushVertex(x0b, y0b, fill[0], fill[1], fill[2], fill[3]);
        this.buffer.pushVertex(x1t, y1t, fill[0], fill[1], fill[2], fill[3]);
        this.buffer.pushVertex(x1t, y1t, fill[0], fill[1], fill[2], fill[3]);
        this.buffer.pushVertex(x0b, y0b, fill[0], fill[1], fill[2], fill[3]);
        this.buffer.pushVertex(x1b, y1b, fill[0], fill[1], fill[2], fill[3]);
        const count = this.buffer.vertexCount - start;
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
    const start = this.buffer.vertexCount;
    const size = 6;
    for (const point of data.points) {
      const x = timeToX(range, pane.plotArea, point.timeMs);
      const y = priceToY(domain, pane.plotArea, point.value);
      if (x === null || y === null) continue;
      const [nx0, ny0] = this.toNdc(x - size, y);
      const [nx1, ny1] = this.toNdc(x + size, y);
      const [nx2, ny2] = this.toNdc(x, y - size);
      const [nx3, ny3] = this.toNdc(x, y + size);
      this.buffer.pushVertex(nx0, ny0, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(nx1, ny1, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(nx2, ny2, color[0], color[1], color[2], color[3]);
      this.buffer.pushVertex(nx3, ny3, color[0], color[1], color[2], color[3]);
    }
    const count = this.buffer.vertexCount - start;
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
