import type { RenderSeries } from "../renderer.js";
import type { WebGL2RendererContext } from "./context.js";
import { emitDiagnostic } from "./metrics.js";
import {
  createAreaBuffer,
  createBarBuffer,
  createCandleBodyBuffer,
  createCandleWickBuffers,
  createLineBuffer,
  releaseInstanceBuffer,
  releaseLineBuffer,
  upsertInstanceBuffer,
  upsertLineBuffer
} from "./buffers.js";
import {
  buildAreaData,
  buildBarData,
  buildCandleBodyData,
  buildCandleWickData,
  buildLineData
} from "./series-data.js";
import type { InstanceBuffer, LineBuffer, SeriesGpuEntry } from "./state.js";

export function getSeriesEntry(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  series: RenderSeries
): SeriesGpuEntry | null {
  const cached = ctx.seriesCache.get(series.id);
  if (cached) {
    if (cached.seriesRef === series) {
      touchSeries(ctx, series.id);
      return cached;
    }
    const typeChanged = cached.seriesRef.type !== series.type;
    const previousBytes = cached.gpuBytes ?? 0;
    const updated = updateSeriesEntry(ctx, gl, cached, series);
    if (updated) {
      updateSeriesBytes(ctx, updated, previousBytes);
      touchSeries(ctx, series.id);
      enforceSeriesBudget(ctx);
      return updated;
    }
    dropSeriesEntry(ctx, series.id);
    if (typeChanged) {
      emitDiagnostic(ctx, {
        code: "render/buffer-rebuild",
        message: "series type changed; rebuilding GPU buffers",
        severity: "info",
        recoverable: true,
        context: { seriesId: series.id }
      });
    }
  }
  const entry = buildSeriesEntry(ctx, gl, series);
  if (!entry) return null;
  entry.gpuBytes = computeEntryBytes(entry);
  ctx.seriesGpuBytes += entry.gpuBytes;
  ctx.seriesCache.set(series.id, entry);
  touchSeries(ctx, series.id);
  enforceSeriesBudget(ctx);
  return entry;
}

export function releaseSeriesEntry(ctx: WebGL2RendererContext, entry: SeriesGpuEntry): void {
  if (!ctx.gl) return;
  const gl = ctx.gl;
  releaseLineBuffer(gl, entry.line ?? null);
  releaseLineBuffer(gl, entry.area ?? null);
  releaseInstanceBuffer(gl, entry.histogram ?? null);
  if (entry.candles) {
    releaseLineBuffer(gl, entry.candles.wickUp ?? null);
    releaseLineBuffer(gl, entry.candles.wickDown ?? null);
    releaseInstanceBuffer(gl, entry.candles.body ?? null);
  }
}

export function dropSeriesEntry(ctx: WebGL2RendererContext, seriesId: string): void {
  const entry = ctx.seriesCache.get(seriesId);
  if (!entry) return;
  ctx.seriesCache.delete(seriesId);
  ctx.seriesGpuBytes -= entry.gpuBytes ?? 0;
  releaseSeriesEntry(ctx, entry);
}

function updateSeriesEntry(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  entry: SeriesGpuEntry,
  series: RenderSeries
): SeriesGpuEntry | null {
  if (entry.seriesRef.type !== series.type) {
    return null;
  }
  entry.seriesRef = series;
  if (series.type === "line") {
    entry.line = upsertLineBuffer(
      ctx,
      gl,
      entry.line ?? null,
      buildLineData(series.timeMs, series.fields.value, 0),
      { seriesId: series.id, buffer: "line" }
    );
    return entry.line ? entry : null;
  }
  if (series.type === "area") {
    entry.line = upsertLineBuffer(
      ctx,
      gl,
      entry.line ?? null,
      buildLineData(series.timeMs, series.fields.value, 0),
      { seriesId: series.id, buffer: "line" }
    );
    entry.area = upsertLineBuffer(
      ctx,
      gl,
      entry.area ?? null,
      buildAreaData(series.timeMs, series.fields.value),
      { seriesId: series.id, buffer: "area" }
    );
    return entry.line && entry.area ? entry : null;
  }
  if (series.type === "histogram") {
    entry.histogram = upsertInstanceBuffer(
      ctx,
      gl,
      entry.histogram ?? null,
      buildBarData(series.timeMs, series.fields.value, series.id),
      { seriesId: series.id, buffer: "histogram" }
    );
    return entry.histogram ? entry : null;
  }
  if (series.type === "candles") {
    const wickData = buildCandleWickData(series);
    if (!wickData) return null;
    const body = upsertInstanceBuffer(
      ctx,
      gl,
      entry.candles?.body ?? null,
      buildCandleBodyData(series),
      { seriesId: series.id, buffer: "candle-body" }
    );
    const wickUp = upsertLineBuffer(
      ctx,
      gl,
      entry.candles?.wickUp ?? null,
      wickData.up,
      { seriesId: series.id, buffer: "candle-wick-up" }
    );
    const wickDown = upsertLineBuffer(
      ctx,
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

function touchSeries(ctx: WebGL2RendererContext, seriesId: string): void {
  const entry = ctx.seriesCache.get(seriesId);
  if (!entry) return;
  ctx.seriesCache.delete(seriesId);
  ctx.seriesCache.set(seriesId, entry);
}

function updateSeriesBytes(ctx: WebGL2RendererContext, entry: SeriesGpuEntry, previousBytes: number): void {
  const nextBytes = computeEntryBytes(entry);
  entry.gpuBytes = nextBytes;
  ctx.seriesGpuBytes += nextBytes - previousBytes;
}

function computeEntryBytes(entry: SeriesGpuEntry): number {
  let bytes = 0;
  bytes += getBufferBytes(entry.line ?? null);
  bytes += getBufferBytes(entry.area ?? null);
  bytes += getBufferBytes(entry.histogram ?? null);
  if (entry.candles) {
    bytes += getBufferBytes(entry.candles.wickUp ?? null);
    bytes += getBufferBytes(entry.candles.wickDown ?? null);
    bytes += getBufferBytes(entry.candles.body ?? null);
  }
  return bytes;
}

function getBufferBytes(buffer: LineBuffer | InstanceBuffer | null): number {
  if (!buffer) return 0;
  return buffer.uploader.getCapacityBytes();
}

function enforceSeriesBudget(ctx: WebGL2RendererContext): void {
  if (ctx.maxSeriesGpuBytes <= 0) return;
  while (ctx.seriesGpuBytes > ctx.maxSeriesGpuBytes && ctx.seriesCache.size > 1) {
    const oldest = ctx.seriesCache.keys().next().value as string | undefined;
    if (!oldest) break;
    const entry = ctx.seriesCache.get(oldest);
    if (!entry) break;
    ctx.seriesCache.delete(oldest);
    ctx.seriesGpuBytes -= entry.gpuBytes ?? 0;
    releaseSeriesEntry(ctx, entry);
    emitDiagnostic(ctx, {
      code: "render/series-cache-evicted",
      message: "series GPU cache evicted to honor budget",
      severity: "warn",
      recoverable: true,
      context: { seriesId: oldest, totalBytes: ctx.seriesGpuBytes, maxBytes: ctx.maxSeriesGpuBytes }
    });
  }
}

function buildSeriesEntry(
  ctx: WebGL2RendererContext,
  gl: WebGL2RenderingContext,
  series: RenderSeries
): SeriesGpuEntry | null {
  const entry: SeriesGpuEntry = { seriesRef: series };
  if (series.type === "line") {
    entry.line = createLineBuffer(ctx, gl, series.timeMs, series.fields.value, 0);
  } else if (series.type === "area") {
    entry.line = createLineBuffer(ctx, gl, series.timeMs, series.fields.value, 0);
    entry.area = createAreaBuffer(ctx, gl, series.timeMs, series.fields.value);
  } else if (series.type === "histogram") {
    entry.histogram = createBarBuffer(ctx, gl, series.timeMs, series.fields.value, series.id);
  } else if (series.type === "candles") {
    const wick = createCandleWickBuffers(ctx, gl, series);
    entry.candles = {
      wickUp: wick?.up ?? null,
      wickDown: wick?.down ?? null,
      body: createCandleBodyBuffer(ctx, gl, series)
    };
  }
  return entry;
}
