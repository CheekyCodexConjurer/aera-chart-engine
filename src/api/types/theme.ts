export type CandleThemeColors = {
  up?: string;
  down?: string;
};

export type CandleBorderTheme = CandleThemeColors & {
  enabled?: boolean;
};

export type CandleTheme = {
  body?: CandleThemeColors;
  wick?: CandleThemeColors;
  border?: CandleBorderTheme;
};

export type ChartTheme = {
  background?: string;
  grid?: string;
  axis?: string;
  axisText?: string;
  crosshair?: string;
  crosshairText?: string;
  crosshairLabelBackground?: string;
  candle?: CandleTheme;
};
