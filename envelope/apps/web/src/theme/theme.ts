import type { BrandVariants, Theme } from '@fluentui/react-components';
import { createDarkTheme, createLightTheme } from '@fluentui/react-components';

/**
 * Envelope theme (docs/DECISIONS.md D-010, D-024). Colours live as CSS custom properties in tokens.css,
 * switched by <html data-theme>. Fluent components (dialogs, tooltips, sliders, inputs) are pointed at
 * those properties, so one Fluent theme follows both light and dark.
 */
export type ThemeMode = 'light' | 'dark';

/** CSS custom property reference, e.g. v('primary') → 'var(--primary)'. */
export const v = (name: string) => `var(--${name})`;

// 16-step brand ramp around #237A45; only used for Fluent tokens not mapped below.
const brand: BrandVariants = {
  10: '#020905',
  20: '#0B1F13',
  30: '#0F331D',
  40: '#124126',
  50: '#15502F',
  60: '#185F38',
  70: '#1C6F41',
  80: '#237A45',
  90: '#3A8A57',
  100: '#509A69',
  110: '#66AA7C',
  120: '#7CBA8F',
  130: '#93C9A3',
  140: '#AAD8B7',
  150: '#C2E7CB',
  160: '#DAF5E0',
};

const mix = (token: string, pct: number, base = 'on-surface') =>
  `color-mix(in srgb, ${v(base)} ${pct}%, ${v(token)})`;

const mapped: Partial<Theme> = {
  fontFamilyBase: v('font-plain'),
  fontFamilyNumeric: v('font-plain'),
  fontFamilyMonospace: v('font-mono'),
  fontSizeBase100: '11px',
  fontSizeBase200: '12px',
  fontSizeBase300: '14px',
  fontSizeBase400: '16px',
  fontSizeBase500: '20px',
  fontSizeBase600: '24px',
  lineHeightBase200: '16px',
  lineHeightBase300: '20px',
  lineHeightBase400: '24px',
  lineHeightBase500: '28px',
  lineHeightBase600: '32px',
  fontWeightSemibold: 500,
  borderRadiusSmall: '4px',
  borderRadiusMedium: '8px',
  borderRadiusLarge: '12px',
  borderRadiusXLarge: '28px',

  colorNeutralForeground1: v('on-surface'),
  colorNeutralForeground1Hover: v('on-surface'),
  colorNeutralForeground1Pressed: v('on-surface'),
  colorNeutralForeground2: v('on-surface-variant'),
  colorNeutralForeground2Hover: v('on-surface'),
  colorNeutralForeground2Pressed: v('on-surface'),
  colorNeutralForeground3: v('on-surface-variant'),
  colorNeutralForeground4: v('on-surface-variant'),
  colorNeutralForegroundDisabled: mix('surface', 38),
  colorNeutralForegroundOnBrand: v('on-primary'),
  colorNeutralForegroundInverted: v('inverse-on-surface'),
  colorNeutralBackground1: v('surface-container-high'),
  colorNeutralBackground1Hover: mix('surface-container-high', 8),
  colorNeutralBackground1Pressed: mix('surface-container-high', 10),
  colorNeutralBackground1Selected: v('secondary-container'),
  colorNeutralBackground2: v('surface-container'),
  colorNeutralBackground3: v('surface-container-low'),
  colorNeutralBackground4: v('surface-container-lowest'),
  colorNeutralBackground5: v('surface-container-highest'),
  colorNeutralBackground6: v('surface-container-highest'),
  colorNeutralBackgroundInverted: v('inverse-surface'),
  colorNeutralBackgroundDisabled: mix('surface', 12),
  colorNeutralStencil1: v('surface-container-highest'),
  colorNeutralStencil2: v('surface-container-high'),
  colorNeutralStroke1: v('outline'),
  colorNeutralStroke1Hover: v('on-surface'),
  colorNeutralStroke1Pressed: v('on-surface'),
  colorNeutralStroke2: v('outline-variant'),
  colorNeutralStroke3: v('outline-variant'),
  colorNeutralStrokeAccessible: v('outline'),
  colorNeutralStrokeAccessibleHover: v('on-surface'),
  colorNeutralStrokeDisabled: mix('surface', 12),
  colorBrandBackground: v('primary'),
  colorBrandBackgroundHover: `color-mix(in srgb, ${v('on-primary')} 8%, ${v('primary')})`,
  colorBrandBackgroundPressed: `color-mix(in srgb, ${v('on-primary')} 12%, ${v('primary')})`,
  colorBrandBackground2: v('primary-container'),
  colorBrandForeground1: v('primary'),
  colorBrandForeground2: v('on-primary-container'),
  colorBrandForegroundLink: v('tertiary'),
  colorBrandForegroundLinkHover: v('tertiary'),
  colorBrandStroke1: v('primary'),
  colorBrandStroke2: v('primary-container'),
  colorCompoundBrandBackground: v('primary'),
  colorCompoundBrandBackgroundHover: v('primary'),
  colorCompoundBrandBackgroundPressed: v('primary'),
  colorCompoundBrandForeground1: v('primary'),
  colorCompoundBrandStroke: v('primary'),
  colorCompoundBrandStrokeHover: v('primary'),
  colorCompoundBrandStrokePressed: v('primary'),
  colorStrokeFocus2: v('tertiary'),
  colorBackgroundOverlay: v('scrim'),
  colorPaletteRedForeground1: v('error'),
  colorPaletteRedBorder2: v('error'),
  shadow4: v('elevation-1'),
  shadow8: v('elevation-2'),
  shadow16: v('elevation-2'),
  shadow28: v('elevation-3'),
  shadow64: v('elevation-3'),
};

export const fluentThemes: Record<ThemeMode, Theme> = {
  light: { ...createLightTheme(brand), ...mapped },
  dark: { ...createDarkTheme(brand), ...mapped },
};

const THEME_KEY = 'envelope.theme';

export function loadThemeMode(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage unavailable: fall through to the system preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Storage unavailable (private mode): the choice still applies for this session.
  }
}

/** Reads a token's current computed value, for canvas-based renderers (ECharts) that cannot take var(). */
export function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}
