/**
 * Colour maps: dust = sequential yellow-brown (ColorBrewer YlOrBr),
 * surface temperature = inferno, UTCI = assessment-scale categories, GHG = sequential purple
 * (ColorBrewer Purples).
 */
type RGB = [number, number, number];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function ramp(stops: string[]): (t: number) => RGB {
  const c = stops.map(hex);
  return (t) => {
    const x = Math.min(1, Math.max(0, t)) * (c.length - 1);
    const i = Math.min(c.length - 2, Math.floor(x));
    const f = x - i;
    const a = c[i]!;
    const b = c[i + 1]!;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
}

export const YL_OR_BR = [
  '#FFFFE5',
  '#FFF7BC',
  '#FEE391',
  '#FEC44F',
  '#FE9929',
  '#EC7014',
  '#CC4C02',
  '#8C2D04',
];
export const INFERNO = ['#000004', '#320A5E', '#781C6D', '#BC3754', '#ED6925', '#FBB61A', '#FCFFA4'];
export const PURPLES = [
  '#FCFBFD',
  '#EFEDF5',
  '#DADAEB',
  '#BCBDDC',
  '#9E9AC8',
  '#807DBA',
  '#6A51A3',
  '#4A1486',
];

/** UTCI assessment scale colours (heat side), as used in UTCI publications. */
export const UTCI_CLASSES: { min: number; label: string; colour: string }[] = [
  { min: 46, label: 'Extreme heat stress (> 46)', colour: '#8B0000' },
  { min: 38, label: 'Very strong heat stress (38–46)', colour: '#E31A1C' },
  { min: 32, label: 'Strong heat stress (32–38)', colour: '#FD8D3C' },
  { min: 26, label: 'Moderate heat stress (26–32)', colour: '#FECC5C' },
  { min: 9, label: 'No thermal stress (9–26)', colour: '#41AB5D' },
  { min: -999, label: 'Cold stress (< 9)', colour: '#4292C6' },
];

export interface ColourScale {
  title: string;
  unit: string;
  min: number;
  max: number;
  stops?: string[];
  classes?: typeof UTCI_CLASSES;
  /** RGBA for a value; alpha 0 = transparent. */
  rgba: (v: number) => [number, number, number, number];
}

/** Dust increment: log-ish scale from 1 to `max` µg/m³; < 1 µg/m³ is transparent. */
export function dustScale(max: number): ColourScale {
  const f = ramp(YL_OR_BR);
  const top = Math.max(10, max);
  return {
    title: 'PM10 site increment',
    unit: 'µg/m³',
    min: 1,
    max: top,
    stops: YL_OR_BR,
    rgba: (v) => {
      if (!(v >= 1)) return [0, 0, 0, 0];
      const t = Math.log(v) / Math.log(top);
      const [r, g, b] = f(t);
      return [r, g, b, 140 + 115 * Math.min(1, t)];
    },
  };
}

export function surfaceTempScale(min: number, max: number): ColourScale {
  const f = ramp(INFERNO);
  return {
    title: 'Surface temperature',
    unit: '°C',
    min,
    max,
    stops: INFERNO,
    rgba: (v) => {
      if (!Number.isFinite(v)) return [0, 0, 0, 0];
      const [r, g, b] = f((v - min) / (max - min || 1));
      return [r, g, b, 235];
    },
  };
}

/** Continuous ramp through the UTCI category colours, so grades within a category stay visible. */
const UTCI_STOPS: [number, string][] = [
  [9, '#41AB5D'],
  [26, '#FECC5C'],
  [32, '#FD8D3C'],
  [38, '#E31A1C'],
  [46, '#8B0000'],
  [50, '#4D0000'],
];

function utciRgb(v: number): RGB {
  if (v <= UTCI_STOPS[0]![0]) return hex(UTCI_STOPS[0]![1]);
  for (let k = 1; k < UTCI_STOPS.length; k++) {
    const [v1, c1] = UTCI_STOPS[k]!;
    if (v <= v1) {
      const [v0, c0] = UTCI_STOPS[k - 1]!;
      const t = (v - v0) / (v1 - v0);
      const a = hex(c0);
      const b = hex(c1);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return hex(UTCI_STOPS[UTCI_STOPS.length - 1]![1]);
}

export function utciScale(): ColourScale {
  return {
    title: 'Worker heat stress (UTCI)',
    unit: '°C',
    min: 9,
    max: 46,
    classes: UTCI_CLASSES,
    rgba: (v) => {
      if (!Number.isFinite(v)) return [0, 0, 0, 0];
      const [r, g, b] = utciRgb(v);
      return [r, g, b, 230];
    },
  };
}

export function ghgScale(min: number, max: number): ColourScale & { css: (v: number) => string } {
  const f = ramp(PURPLES.slice(2));
  const rgba = (v: number): [number, number, number, number] => {
    const [r, g, b] = f((v - min) / (max - min || 1));
    return [r, g, b, 255];
  };
  return {
    title: 'Embodied carbon on envelope',
    unit: 'kgCO2e/m²',
    min,
    max,
    stops: PURPLES.slice(2),
    rgba,
    css: (v) => {
      const [r, g, b] = rgba(v);
      return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    },
  };
}

/** Paints a grid field (row 0 = south) into a canvas (row 0 = north) for draping. */
export function fieldToCanvas(
  field: ArrayLike<number>,
  n: number,
  scale: ColourScale,
  crop?: { i0: number; j0: number; i1: number; j1: number },
  /** Radial alpha fade around the grid centre, in cells: opaque inside `inner`, clear beyond `outer`. */
  fade?: { inner: number; outer: number },
): HTMLCanvasElement {
  const c = crop ?? { i0: 0, j0: 0, i1: n - 1, j1: n - 1 };
  const w = c.i1 - c.i0 + 1;
  const h = c.j1 - c.j0 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let j = c.j0; j <= c.j1; j++)
    for (let i = c.i0; i <= c.i1; i++) {
      const [r, g, b, a0] = scale.rgba(field[j * n + i]!);
      let a = a0;
      if (fade) {
        const d = Math.hypot(i + 0.5 - n / 2, j + 0.5 - n / 2);
        a *= Math.min(1, Math.max(0, (fade.outer - d) / (fade.outer - fade.inner)));
      }
      const row = c.j1 - j;
      const o = (row * w + (i - c.i0)) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = a;
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
