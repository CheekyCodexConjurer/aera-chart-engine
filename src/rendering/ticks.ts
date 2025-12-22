import { Range } from "../api/public-types.js";

export type Tick = {
  value: number;
  label: string;
};

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

export function generateNumericTicks(min: number, max: number, targetCount: number): Tick[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) return [];
  const count = Math.max(2, Math.min(12, Math.floor(targetCount)));
  const span = max - min;
  const roughStep = span / count;
  const step = niceStep(roughStep);
  if (step <= 0) return [];
  const start = Math.ceil(min / step) * step;
  const ticks: Tick[] = [];
  const precision = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const decimals = Math.min(6, precision);
  for (let value = start; value <= max + step * 0.5; value += step) {
    ticks.push({ value, label: value.toFixed(decimals) });
  }
  return ticks;
}

export function generateTimeTicks(range: Range, pixelWidth: number): Tick[] {
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
  const ticks: Tick[] = [];
  for (let value = start; value <= range.endMs + step * 0.5; value += step) {
    ticks.push({ value, label: formatTimeLabel(value, step) });
  }
  return ticks;
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
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hour = pad2(date.getUTCHours());
  const minute = pad2(date.getUTCMinutes());
  const second = pad2(date.getUTCSeconds());
  if (stepMs >= 86400000) {
      return `${year}-${month}-${day}`;
  }
  if (stepMs >= 60000) {
    return `${hour}:${minute}`;
  }
  return `${minute}:${second}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function formatTimestamp(timeMs: number): string {
  const date = new Date(timeMs);
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hour = pad2(date.getUTCHours());
  const minute = pad2(date.getUTCMinutes());
  const second = pad2(date.getUTCSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
