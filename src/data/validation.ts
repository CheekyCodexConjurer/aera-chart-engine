import { CandleSeriesData, LineSeriesData, SeriesData } from "../api/public-types.js";
import { isFiniteNumber } from "../util/math.js";

export type ValidationIssue = {
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

function validateTimeArray(timeMs: number[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (timeMs.length === 0) {
    issues.push({ code: "time.empty", message: "time array is empty" });
    return issues;
  }
  for (let i = 0; i < timeMs.length; i += 1) {
    const value = timeMs[i];
    if (!isFiniteNumber(value)) {
      issues.push({
        code: "time.invalid",
        message: "time value is not finite",
        context: { index: i, value }
      });
      break;
    }
    if (i > 0 && value <= timeMs[i - 1]) {
      issues.push({
        code: "time.order",
        message: "time values must be strictly increasing",
        context: { index: i, value, prev: timeMs[i - 1] }
      });
      break;
    }
  }
  return issues;
}

function validateLine(data: LineSeriesData): ValidationIssue[] {
  const issues = validateTimeArray(data.timeMs);
  if (data.value.length !== data.timeMs.length) {
    issues.push({
      code: "line.length",
      message: "time and value arrays must match",
      context: { time: data.timeMs.length, value: data.value.length }
    });
  }
  for (let i = 0; i < data.value.length; i += 1) {
    const value = data.value[i];
    if (!isFiniteNumber(value)) {
      issues.push({
        code: "line.value.invalid",
        message: "line value is not finite",
        context: { index: i, value }
      });
      break;
    }
  }
  return issues;
}

function validateCandles(data: CandleSeriesData): ValidationIssue[] {
  const issues = validateTimeArray(data.timeMs);
  const length = data.timeMs.length;
  const fields = ["open", "high", "low", "close"] as const;
  for (const field of fields) {
    if (data[field].length !== length) {
      issues.push({
        code: "candle.length",
        message: "candle arrays must match time length",
        context: { field, expected: length, actual: data[field].length }
      });
    }
  }
  if (data.volume && data.volume.length !== length) {
    issues.push({
      code: "candle.volume.length",
      message: "volume length must match time length",
      context: { expected: length, actual: data.volume.length }
    });
  }
  for (let i = 0; i < length; i += 1) {
    const open = data.open[i];
    const high = data.high[i];
    const low = data.low[i];
    const close = data.close[i];
    if (![open, high, low, close].every(isFiniteNumber)) {
      issues.push({
        code: "candle.value.invalid",
        message: "candle values must be finite",
        context: { index: i, open, high, low, close }
      });
      break;
    }
    if (!(low <= open && open <= high && low <= close && close <= high)) {
      issues.push({
        code: "candle.ohlc.invalid",
        message: "candle OHLC values are inconsistent",
        context: { index: i, open, high, low, close }
      });
      break;
    }
    if (data.volume && (!isFiniteNumber(data.volume[i]) || data.volume[i] < 0)) {
      issues.push({
        code: "candle.volume.invalid",
        message: "volume must be non-negative",
        context: { index: i, value: data.volume[i] }
      });
      break;
    }
  }
  return issues;
}

export function validateSeriesData(data: SeriesData): ValidationIssue[] {
  if ("open" in data) {
    return validateCandles(data as CandleSeriesData);
  }
  return validateLine(data as LineSeriesData);
}
