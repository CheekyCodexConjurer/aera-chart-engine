import type { CandleTheme, ChartTheme } from "../api/public-types.js";
import {
  DEFAULT_AXIS,
  DEFAULT_CLEAR,
  DEFAULT_CROSSHAIR,
  DEFAULT_DOWN_CANDLE,
  DEFAULT_GRID,
  DEFAULT_UP_CANDLE,
  parseColor,
  type RgbaColor
} from "./color.js";

export type ResolvedCandleTheme = {
  bodyUp: RgbaColor;
  bodyDown: RgbaColor;
  wickUp: RgbaColor;
  wickDown: RgbaColor;
  borderUp: RgbaColor;
  borderDown: RgbaColor;
  borderEnabled: boolean;
};

export type ResolvedTheme = {
  background: RgbaColor;
  grid: RgbaColor;
  axis: RgbaColor;
  axisText: string;
  crosshair: RgbaColor;
  crosshairText: string;
  crosshairLabelBackground: string;
  candle: ResolvedCandleTheme;
};

const DEFAULT_AXIS_TEXT = "#cfd3da";
const DEFAULT_CROSSHAIR_TEXT = "#ffffff";
const DEFAULT_CROSSHAIR_LABEL_BACKGROUND = "rgba(0,0,0,0.6)";

const DEFAULT_RESOLVED_THEME: ResolvedTheme = {
  background: DEFAULT_CLEAR,
  grid: DEFAULT_GRID,
  axis: DEFAULT_AXIS,
  axisText: DEFAULT_AXIS_TEXT,
  crosshair: DEFAULT_CROSSHAIR,
  crosshairText: DEFAULT_CROSSHAIR_TEXT,
  crosshairLabelBackground: DEFAULT_CROSSHAIR_LABEL_BACKGROUND,
  candle: {
    bodyUp: DEFAULT_UP_CANDLE,
    bodyDown: DEFAULT_DOWN_CANDLE,
    wickUp: DEFAULT_UP_CANDLE,
    wickDown: DEFAULT_DOWN_CANDLE,
    borderUp: DEFAULT_UP_CANDLE,
    borderDown: DEFAULT_DOWN_CANDLE,
    borderEnabled: false
  }
};

export function resolveTheme(theme: ChartTheme | undefined, fallbackClear?: RgbaColor): ResolvedTheme {
  const base = DEFAULT_RESOLVED_THEME;
  const candle = theme?.candle;
  const body = candle?.body;
  const wick = candle?.wick;
  const border = candle?.border;
  const clear = fallbackClear ?? base.background;
  return {
    background: parseColor(theme?.background, clear),
    grid: parseColor(theme?.grid, base.grid),
    axis: parseColor(theme?.axis, base.axis),
    axisText: theme?.axisText ?? base.axisText,
    crosshair: parseColor(theme?.crosshair, base.crosshair),
    crosshairText: theme?.crosshairText ?? base.crosshairText,
    crosshairLabelBackground: theme?.crosshairLabelBackground ?? base.crosshairLabelBackground,
    candle: {
      bodyUp: parseColor(body?.up, base.candle.bodyUp),
      bodyDown: parseColor(body?.down, base.candle.bodyDown),
      wickUp: parseColor(wick?.up, base.candle.wickUp),
      wickDown: parseColor(wick?.down, base.candle.wickDown),
      borderUp: parseColor(border?.up, base.candle.borderUp),
      borderDown: parseColor(border?.down, base.candle.borderDown),
      borderEnabled: border?.enabled ?? base.candle.borderEnabled
    }
  };
}

export function mergeTheme(base: ChartTheme | undefined, update?: ChartTheme): ChartTheme {
  const baseTheme = base ?? {};
  if (!update) return baseTheme;
  return {
    ...baseTheme,
    ...update,
    candle: mergeCandleTheme(baseTheme.candle, update.candle)
  };
}

function mergeCandleTheme(base?: CandleTheme, update?: CandleTheme): CandleTheme | undefined {
  if (!base) return update;
  if (!update) return base;
  return {
    ...base,
    ...update,
    body: { ...base.body, ...update.body },
    wick: { ...base.wick, ...update.wick },
    border: { ...base.border, ...update.border }
  };
}
