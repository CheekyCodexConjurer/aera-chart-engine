import { DEFAULT_DOWN_CANDLE, DEFAULT_UP_CANDLE, colorFromId } from "../color.js";
import type { RenderSeries } from "../renderer.js";
import { splitFloat64 } from "./shaders.js";
import type { InstanceData, LineData } from "./state.js";

export function buildLineData(
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

export function buildAreaData(timeMs: Float64Array, values: Float64Array | undefined): LineData | null {
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

export function buildBarData(
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

export function buildCandleBodyData(series: RenderSeries): InstanceData | null {
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

export function buildCandleWickData(series: RenderSeries): { up: LineData | null; down: LineData | null } | null {
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
