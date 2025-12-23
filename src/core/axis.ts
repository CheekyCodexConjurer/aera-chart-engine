import { Range, TimeMs } from "../api/public-types.js";

export type AxisTick = {
  value: number;
  label: string;
};

export type NumericTickFormatter = (value: number) => string;
export type TimeTickFormatter = (timeMs: TimeMs, stepMs: number) => string;

const TIME_STEPS_MS = [
  1000,
  2000,
  5000,
  10000,
  15000,
  30000,
  60000,
  120000,
  300000,
  600000,
  900000,
  1800000,
  3600000,
  7200000,
  14400000,
  21600000,
  43200000,
  86400000,
  172800000,
  604800000,
  2592000000,
  7776000000,
  15552000000,
  31536000000
];

const MS_IN_MINUTE = 60000;
const MS_IN_DAY = 86400000;
const MS_IN_MONTH = 2592000000;
const MS_IN_YEAR = 31536000000;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function generateNumericTicks(
  min: number,
  max: number,
  targetCount: number,
  formatter?: NumericTickFormatter
): AxisTick[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) return [];
  const count = Math.max(2, Math.min(12, Math.floor(targetCount)));
  const span = max - min;
  const roughStep = span / count;
  const step = niceStep(roughStep);
  if (step <= 0) return [];
  const start = Math.ceil(min / step) * step;
  const ticks: AxisTick[] = [];
  const precision = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const decimals = Math.min(6, precision);
  for (let value = start; value <= max + step * 0.5; value += step) {
    const label = formatter ? formatter(value) : value.toFixed(decimals);
    ticks.push({ value, label });
  }
  return ticks;
}

export function generateTimeTicks(
  range: Range,
  pixelWidth: number,
  formatter?: TimeTickFormatter
): AxisTick[] {
  if (range.endMs <= range.startMs) return [];
  const span = range.endMs - range.startMs;
  const targetCount = Math.max(2, Math.floor(pixelWidth / 90));
  let step = TIME_STEPS_MS[TIME_STEPS_MS.length - 1];
  for (const candidate of TIME_STEPS_MS) {
    if (span / candidate <= targetCount) {
      step = candidate;
      break;
    }
  }
  const start = Math.ceil(range.startMs / step) * step;
  const ticks: AxisTick[] = [];
  for (let value = start; value <= range.endMs + step * 0.5; value += step) {
    const label = formatter ? formatter(value, step) : formatTimeLabel(value, step);
    ticks.push({ value, label });
  }
  return ticks;
}

export function formatTimestamp(timeMs: number): string {
  const date = new Date(timeMs);
  const year = date.getUTCFullYear();
  const monthName = MONTHS_SHORT[date.getUTCMonth()];
  const day = pad2(date.getUTCDate());
  const hour = pad2(date.getUTCHours());
  const minute = pad2(date.getUTCMinutes());
  return `${day} ${monthName} ${year} ${hour}:${minute}`;
}

function niceStep(roughStep: number): number {
  const exponent = Math.floor(Math.log10(roughStep));
  const magnitude = Math.pow(10, exponent);
  const fraction = roughStep / magnitude;
  let niceFraction = 1;
  if (fraction <= 1.5) niceFraction = 1;
  else if (fraction <= 3) niceFraction = 2;
  else if (fraction <= 7) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * magnitude;
}

function formatTimeLabel(timeMs: number, stepMs: number): string {
  const date = new Date(timeMs);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const day = pad2(date.getUTCDate());
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  const isMidnight = hour === 0 && minute === 0 && second === 0;
  if (stepMs >= MS_IN_YEAR) {
    return `${year}`;
  }
  if (stepMs >= MS_IN_MONTH) {
    return `${MONTHS_SHORT[monthIndex]} ${year}`;
  }
  if (stepMs >= MS_IN_DAY || isMidnight) {
    return `${day} ${MONTHS_SHORT[monthIndex]}`;
  }
  if (stepMs >= MS_IN_MINUTE) {
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  return `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}
