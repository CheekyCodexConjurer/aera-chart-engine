export type RgbaColor = [number, number, number, number];

export const DEFAULT_CLEAR: RgbaColor = [0, 0, 0, 0];
export const DEFAULT_LINE: RgbaColor = [0.2, 0.6, 1, 1];
export const DEFAULT_UP_CANDLE: RgbaColor = [0.149, 0.651, 0.604, 1];
export const DEFAULT_DOWN_CANDLE: RgbaColor = [0.937, 0.325, 0.314, 1];
export const DEFAULT_OVERLAY: RgbaColor = [0.9, 0.9, 0.9, 1];
export const DEFAULT_OVERLAY_FILL: RgbaColor = [0.4, 0.8, 0.9, 0.2];
export const DEFAULT_GRID: RgbaColor = [0.2, 0.2, 0.2, 0.35];
export const DEFAULT_AXIS: RgbaColor = [0.5, 0.5, 0.5, 0.8];
export const DEFAULT_CROSSHAIR: RgbaColor = [0.8, 0.8, 0.8, 0.6];

export function colorFromHex(hex: string, alpha = 1): RgbaColor {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) {
    return [1, 1, 1, alpha];
  }
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return [r, g, b, alpha];
}

export function colorFromId(id: string, alpha = 1): RgbaColor {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToRgb(hue, 0.55, 0.55, alpha);
}

export function withAlpha(color: RgbaColor, alpha: number): RgbaColor {
  return [color[0], color[1], color[2], alpha];
}

function hslToRgb(h: number, s: number, l: number, alpha: number): RgbaColor {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) {
    r = c;
    g = x;
  } else if (hp >= 1 && hp < 2) {
    r = x;
    g = c;
  } else if (hp >= 2 && hp < 3) {
    g = c;
    b = x;
  } else if (hp >= 3 && hp < 4) {
    g = x;
    b = c;
  } else if (hp >= 4 && hp < 5) {
    r = x;
    b = c;
  } else if (hp >= 5 && hp < 6) {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  return [r + m, g + m, b + m, alpha];
}
