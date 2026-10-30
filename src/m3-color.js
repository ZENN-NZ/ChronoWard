/**
 * ChronoWard 2.0 — Material Design 3 (M3 / Material You) Color Theory Engine
 * 
 * Zero-dependency implementation of:
 * - Perceptual sRGB <-> XYZ <-> CIE L*a*b* <-> LCH <-> HCT Color Conversion
 * - Gamut clipping with binary search to guarantee exact tone preservation
 * - WCAG 2.1 Relative Luminance and Contrast Ratio calculation
 * - 6 Key M3 Tonal Palettes (Primary, Secondary, Tertiary, Neutral, Neutral Variant, Error)
 * - 29+ Semantic M3 Color Tokens + Backward-Compatible Legacy Aliases
 * - 10 Presets (Midnight, Obsidian, Aurora, Ember, Forest, Rose, Steel, Void, Neon, Light)
 */

// CIE Standard Illuminant D65 White Point
const XN = 0.95047;
const YN = 1.00000;
const ZN = 1.08883;

// M3 Standard Tone Steps (including ultra-deep volcanic obsidian tones 1, 2, 3, 8, 16)
export const TONE_STEPS = [
  0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100
];

/**
 * Parses any 3 or 6 digit hex string into [r, g, b] in [0, 255]
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return [0, 0, 0];
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [0, 0, 0];
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [0, 0, 0];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Formats [r, g, b] in [0, 255] to #rrggbb
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  const clamp = v => Math.min(255, Math.max(0, Math.round(v)));
  const toHex = v => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Formats hex color to rgba(r, g, b, alpha)
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
export function hexToRgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * sRGB channel [0..255] to linear channel [0..1]
 */
function srgbToLinear(v) {
  const val = v / 255;
  return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
}

/**
 * Linear channel [0..1] to sRGB channel [0..255]
 */
function linearToSrgb(v) {
  const val = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, val * 255));
}

/**
 * Linear RGB [0..1] to CIE XYZ (D65)
 */
function linearRgbToXyz(r, g, b) {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    0.0193339 * r + 0.1191920 * g + 0.9503041 * b
  ];
}

/**
 * CIE XYZ (D65) to linear RGB [0..1]
 */
function xyzToLinearRgb(x, y, z) {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
   -0.9692660 * x + 1.8760108 * y + 0.0415560 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  ];
}

/**
 * CIE Lab transfer function
 */
function fLab(t) {
  return t > 0.008856451679035631 // (6/29)^3
    ? Math.cbrt(t)
    : (7.787037037037037 * t) + (16 / 116);
}

/**
 * Inverse CIE Lab transfer function
 */
function fLabInv(t) {
  return t > 0.20689655172413793 // 6/29
    ? t * t * t
    : (t - 16 / 116) / 7.787037037037037;
}

/**
 * XYZ to CIE L*a*b*
 */
function xyzToLab(x, y, z) {
  const fx = fLab(x / XN);
  const fy = fLab(y / YN);
  const fz = fLab(z / ZN);

  const L = Math.max(0, 116 * fy - 16);
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [L, a, b];
}

/**
 * CIE L*a*b* to LCH (Hue [0, 360), Chroma >= 0, Tone = L* [0, 100])
 */
function labToLch(L, a, b) {
  const T = Math.max(0, Math.min(100, L));
  const C = Math.hypot(a, b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [H, C, T];
}

/**
 * LCH (H, C, T) to Linear RGB
 */
function lchToLinearRgb(H, C, T) {
  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);

  const fy = (T + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const x = XN * fLabInv(fx);
  const y = YN * fLabInv(fy);
  const z = ZN * fLabInv(fz);
  return xyzToLinearRgb(x, y, z);
}

/**
 * Tests whether linear RGB is within [0, 1] sRGB gamut
 */
function inGamut(r, g, b, eps = 0.0008) {
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}

/**
 * Converts a hex string into perceptual HCT values
 * @param {string} hex
 * @returns {{ h: number, c: number, t: number }}
 */
export function hexToHct(hex) {
  const [r255, g255, b255] = hexToRgb(hex);
  const rLin = srgbToLinear(r255);
  const gLin = srgbToLinear(g255);
  const bLin = srgbToLinear(b255);
  const [x, y, z] = linearRgbToXyz(rLin, gLin, bLin);
  const [L, a, b] = xyzToLab(x, y, z);
  const [H, C, T] = labToLch(L, a, b);
  return {
    h: Math.round(H * 100) / 100,
    c: Math.round(C * 100) / 100,
    t: Math.round(T * 100) / 100
  };
}

/**
 * Converts perceptual HCT values into a valid sRGB #rrggbb hex color
 * Uses binary search gamut clipping to preserve exact tone (T)
 * @param {number} h Hue in degrees [0, 360)
 * @param {number} c Chroma >= 0
 * @param {number} t Tone (CIE L*) in [0, 100]
 * @returns {string} #rrggbb hex
 */
export function hctToHex(h, c, t) {
  const tone = Math.min(100, Math.max(0, t));
  if (tone <= 0.0001) return '#000000';
  if (tone >= 99.9999) return '#ffffff';

  let hue = h % 360;
  if (hue < 0) hue += 360;

  const chroma = Math.max(0, c);
  if (chroma < 0.001) {
    const [rLin, gLin, bLin] = lchToLinearRgb(hue, 0, tone);
    return rgbToHex(linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin));
  }

  // Quick check if target (h, c, t) is in gamut
  const [rLin0, gLin0, bLin0] = lchToLinearRgb(hue, chroma, tone);
  if (inGamut(rLin0, gLin0, bLin0)) {
    return rgbToHex(linearToSrgb(rLin0), linearToSrgb(gLin0), linearToSrgb(bLin0));
  }

  // Binary search for highest in-gamut chroma
  let low = 0;
  let high = chroma;
  let bestHex = null;

  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    const [rLin, gLin, bLin] = lchToLinearRgb(hue, mid, tone);
    if (inGamut(rLin, gLin, bLin)) {
      bestHex = rgbToHex(linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin));
      low = mid;
    } else {
      high = mid;
    }
  }

  if (!bestHex) {
    const [rLin, gLin, bLin] = lchToLinearRgb(hue, 0, tone);
    bestHex = rgbToHex(linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin));
  }

  return bestHex;
}

/**
 * Calculates WCAG 2.1 relative luminance for a given hex color
 * @param {string} hex
 * @returns {number} Relative luminance in [0, 1]
 */
export function relativeLuminance(hex) {
  const [r255, g255, b255] = hexToRgb(hex);
  const rLin = srgbToLinear(r255);
  const gLin = srgbToLinear(g255);
  const bLin = srgbToLinear(b255);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculates WCAG 2.1 relative luminance contrast ratio between two hex colors
 * @param {string} hex1
 * @param {string} hex2
 * @returns {number} Contrast ratio in [1, 21]
 */
export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Generates the 6 Material Design 3 key tonal palettes from a seed color
 * @param {string} seedHex
 * @param {{
 *   neutralChroma?: number,
 *   neutralVariantChroma?: number,
 *   secondaryChroma?: number,
 *   tertiaryChroma?: number,
 *   tertiaryHueShift?: number,
 *   primaryMinChroma?: number
 * }} [options={}]
 * @returns {{
 *   primary: Record<number, string>,
 *   secondary: Record<number, string>,
 *   tertiary: Record<number, string>,
 *   neutral: Record<number, string>,
 *   neutralVariant: Record<number, string>,
 *   error: Record<number, string>
 * }}
 */
export function generateM3TonalPalette(seedHex, options = {}) {
  const seed = hexToHct(seedHex);
  const H = seed.h;
  const C = seed.c;
  const isAchromatic = C < 5;

  const primaryMinC = options.primaryMinChroma ?? 48;
  const secondaryC = options.secondaryChroma ?? 16;
  const tertiaryC = options.tertiaryChroma ?? 24;
  const tertiaryShift = options.tertiaryHueShift ?? 60;
  const neutralC = options.neutralChroma ?? 4;
  const neutralVariantC = options.neutralVariantChroma ?? 8;

  const keySpecs = {
    primary: { h: H, c: isAchromatic ? 0 : Math.max(primaryMinC, C) },
    secondary: { h: H, c: isAchromatic ? 0 : secondaryC },
    tertiary: { h: (H + tertiaryShift) % 360, c: isAchromatic ? 0 : tertiaryC },
    neutral: { h: H, c: isAchromatic ? 0 : neutralC },
    neutralVariant: { h: H, c: isAchromatic ? 0 : neutralVariantC },
    error: { h: 25, c: 84 },
  };

  const palettes = {};
  for (const [key, spec] of Object.entries(keySpecs)) {
    palettes[key] = {};
    for (const tone of TONE_STEPS) {
      palettes[key][tone] = hctToHex(spec.h, spec.c, tone);
    }
  }

  return palettes;
}

/**
 * Generates all 29+ Material Design 3 semantic color tokens plus legacy aliases
 * @param {string} seedHex
 * @param {boolean} [isDark=true]
 * @param {{
 *   isOled?: boolean,
 *   neutralChroma?: number,
 *   neutralVariantChroma?: number,
 *   secondaryChroma?: number,
 *   tertiaryChroma?: number,
 *   tertiaryHueShift?: number,
 *   surfaceTones?: {
 *     dim?: number,
 *     surface?: number,
 *     bright?: number,
 *     lowest?: number,
 *     low?: number,
 *     container?: number,
 *     high?: number,
 *     highest?: number
 *   }
 * }} [options={}]
 * @returns {Record<string, string>}
 */
export function generateM3Scheme(seedHex, isDark = true, options = {}) {
  const isOled = !!options.isOled;
  const p = generateM3TonalPalette(seedHex, options);
  const scheme = {};

  if (isDark) {
    const st = options.surfaceTones || {};
    const tDim = st.dim ?? 6;
    const tSurf = st.surface ?? 6;
    const tBright = st.bright ?? 24;
    const tLowest = st.lowest ?? 4;
    const tLow = st.low ?? 10;
    const tContainer = st.container ?? 12;
    const tHigh = st.high ?? 17;
    const tHighest = st.highest ?? 22;

    // Dark scheme tokens
    scheme['--md-sys-color-primary'] = p.primary[80];
    scheme['--md-sys-color-on-primary'] = p.primary[20];
    scheme['--md-sys-color-primary-container'] = p.primary[30];
    scheme['--md-sys-color-on-primary-container'] = p.primary[90];

    scheme['--md-sys-color-secondary'] = p.secondary[80];
    scheme['--md-sys-color-on-secondary'] = p.secondary[20];
    scheme['--md-sys-color-secondary-container'] = p.secondary[30];
    scheme['--md-sys-color-on-secondary-container'] = p.secondary[90];

    scheme['--md-sys-color-tertiary'] = p.tertiary[80];
    scheme['--md-sys-color-on-tertiary'] = p.tertiary[20];
    scheme['--md-sys-color-tertiary-container'] = p.tertiary[30];
    scheme['--md-sys-color-on-tertiary-container'] = p.tertiary[90];

    scheme['--md-sys-color-error'] = p.error[80];
    scheme['--md-sys-color-on-error'] = p.error[20];
    scheme['--md-sys-color-error-container'] = p.error[30];
    scheme['--md-sys-color-on-error-container'] = p.error[90];

    scheme['--md-sys-color-surface-dim'] = p.neutral[tDim] || p.neutral[6];
    scheme['--md-sys-color-surface'] = isOled ? p.neutral[0] : (p.neutral[tSurf] || p.neutral[6]);
    scheme['--md-sys-color-surface-bright'] = p.neutral[tBright] || p.neutral[24];
    scheme['--md-sys-color-surface-container-lowest'] = isOled ? p.neutral[0] : (p.neutral[tLowest] || p.neutral[4]);
    scheme['--md-sys-color-surface-container-low'] = p.neutral[tLow] || p.neutral[10];
    scheme['--md-sys-color-surface-container'] = p.neutral[tContainer] || p.neutral[12];
    scheme['--md-sys-color-surface-container-high'] = p.neutral[tHigh] || p.neutral[17];
    scheme['--md-sys-color-surface-container-highest'] = p.neutral[tHighest] || p.neutral[22];

    scheme['--md-sys-color-on-surface'] = p.neutral[90];
    scheme['--md-sys-color-on-surface-variant'] = p.neutralVariant[80];
    scheme['--md-sys-color-outline'] = p.neutralVariant[60];
    scheme['--md-sys-color-outline-variant'] = p.neutralVariant[30];

    scheme['--md-sys-color-inverse-surface'] = p.neutral[90];
    scheme['--md-sys-color-inverse-on-surface'] = p.neutral[20];
    scheme['--md-sys-color-inverse-primary'] = p.primary[40];
  } else {
    // Light scheme tokens
    scheme['--md-sys-color-primary'] = p.primary[40];
    scheme['--md-sys-color-on-primary'] = p.primary[100];
    scheme['--md-sys-color-primary-container'] = p.primary[90];
    scheme['--md-sys-color-on-primary-container'] = p.primary[10];

    scheme['--md-sys-color-secondary'] = p.secondary[40];
    scheme['--md-sys-color-on-secondary'] = p.secondary[100];
    scheme['--md-sys-color-secondary-container'] = p.secondary[90];
    scheme['--md-sys-color-on-secondary-container'] = p.secondary[10];

    scheme['--md-sys-color-tertiary'] = p.tertiary[40];
    scheme['--md-sys-color-on-tertiary'] = p.tertiary[100];
    scheme['--md-sys-color-tertiary-container'] = p.tertiary[90];
    scheme['--md-sys-color-on-tertiary-container'] = p.tertiary[10];

    scheme['--md-sys-color-error'] = p.error[40];
    scheme['--md-sys-color-on-error'] = p.error[100];
    scheme['--md-sys-color-error-container'] = p.error[90];
    scheme['--md-sys-color-on-error-container'] = p.error[10];

    scheme['--md-sys-color-surface-dim'] = p.neutral[87];
    scheme['--md-sys-color-surface'] = p.neutral[98];
    scheme['--md-sys-color-surface-bright'] = p.neutral[98];
    scheme['--md-sys-color-surface-container-lowest'] = p.neutral[100];
    scheme['--md-sys-color-surface-container-low'] = p.neutral[96];
    scheme['--md-sys-color-surface-container'] = p.neutral[94];
    scheme['--md-sys-color-surface-container-high'] = p.neutral[92];
    scheme['--md-sys-color-surface-container-highest'] = p.neutral[90];

    scheme['--md-sys-color-on-surface'] = p.neutral[10];
    scheme['--md-sys-color-on-surface-variant'] = p.neutralVariant[30];
    scheme['--md-sys-color-outline'] = p.neutralVariant[50];
    scheme['--md-sys-color-outline-variant'] = p.neutralVariant[80];

    scheme['--md-sys-color-inverse-surface'] = p.neutral[20];
    scheme['--md-sys-color-inverse-on-surface'] = p.neutral[95];
    scheme['--md-sys-color-inverse-primary'] = p.primary[80];
  }

  // Common M3 roles
  scheme['--md-sys-color-surface-tint'] = scheme['--md-sys-color-primary'];
  scheme['--md-sys-color-scrim'] = '#000000';
  scheme['--md-sys-color-shadow'] = '#000000';

  // Backward-compatible legacy aliases
  scheme['--bg'] = scheme['--md-sys-color-surface'];
  scheme['--bg-1'] = scheme['--md-sys-color-surface-container-lowest'];
  scheme['--bg-2'] = scheme['--md-sys-color-surface-container-low'];
  scheme['--bg-3'] = scheme['--md-sys-color-surface-container-high'];
  scheme['--border'] = scheme['--md-sys-color-outline-variant'];
  scheme['--text'] = scheme['--md-sys-color-on-surface'];
  scheme['--text-2'] = scheme['--md-sys-color-on-surface-variant'];
  scheme['--text-3'] = scheme['--md-sys-color-outline'];
  scheme['--accent'] = scheme['--md-sys-color-primary'];
  scheme['--accent-2'] = scheme['--md-sys-color-primary-container'];
  scheme['--accent-glow'] = hexToRgba(scheme['--md-sys-color-primary'], 0.18);
  scheme['--ot'] = scheme['--md-sys-color-tertiary'];
  scheme['--ot-bg'] = hexToRgba(scheme['--md-sys-color-tertiary'], 0.12);
  scheme['--success'] = isDark ? '#4ade80' : '#16a34a';
  scheme['--warning'] = isDark ? '#facc15' : '#ca8a04';
  scheme['--danger'] = scheme['--md-sys-color-error'];

  return scheme;
}

/**
 * 10 Presets defined by ChronoWard M3 design specification
 * - Midnight: Deep Midnight Navy-Indigo Velvet (high-chroma navy surfaces + sapphire-periwinkle primary + starlight coral tertiary)
 * - Obsidian: Volcanic Obsidian Glass (ultra-low-luminance volcanic dark glass surfaces + crystalline amethyst primary + molten amber tertiary)
 */
export const M3_THEMES = [
  {
    id: 'midnight',
    name: 'Midnight',
    seed: '#3b7cf5',
    isDark: true,
    isOled: false,
    material: 'midnight-velvet',
    neutralChroma: 14,
    neutralVariantChroma: 20,
    secondaryChroma: 20,
    tertiaryHueShift: 110,
    tertiaryChroma: 42,
    colors: []
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    seed: '#9d5cff',
    isDark: true,
    isOled: false,
    material: 'volcanic-glass',
    neutralChroma: 6,
    neutralVariantChroma: 14,
    secondaryChroma: 18,
    tertiaryHueShift: 105,
    tertiaryChroma: 40,
    surfaceTones: { dim: 2, surface: 3, bright: 20, lowest: 1, low: 6, container: 8, high: 12, highest: 16 },
    colors: []
  },
  { id: 'aurora',   name: 'Aurora',   seed: '#00d4ff', isDark: true,  isOled: false, material: 'standard', colors: [] },
  { id: 'ember',    name: 'Ember',    seed: '#ff6630', isDark: true,  isOled: false, material: 'standard', colors: [] },
  { id: 'forest',   name: 'Forest',   seed: '#44d980', isDark: true,  isOled: false, material: 'standard', colors: [] },
  { id: 'rose',     name: 'Rose',     seed: '#e066cc', isDark: true,  isOled: false, material: 'standard', colors: [] },
  { id: 'steel',    name: 'Steel',    seed: '#8899cc', isDark: true,  isOled: false, material: 'standard', colors: [] },
  { id: 'void',     name: 'Void',     seed: '#a0a0a0', isDark: true,  isOled: true,  material: 'oled-void', colors: [] },
  { id: 'neon',     name: 'Neon',     seed: '#00ffcc', isDark: true,  isOled: false, material: 'standard', colors: [] },
  { id: 'light',    name: 'Light',    seed: '#5b6af0', isDark: false, isOled: false, material: 'daylight-paper', colors: [] },
];

// Initialize theme colors: [surfaceHex, primaryHex, tertiaryHex]
for (const theme of M3_THEMES) {
  const scheme = generateM3Scheme(theme.seed, theme.isDark, {
    isOled: theme.isOled,
    neutralChroma: theme.neutralChroma,
    neutralVariantChroma: theme.neutralVariantChroma,
    secondaryChroma: theme.secondaryChroma,
    tertiaryHueShift: theme.tertiaryHueShift,
    tertiaryChroma: theme.tertiaryChroma,
    surfaceTones: theme.surfaceTones,
  });
  theme.colors = [
    scheme['--md-sys-color-surface'],
    scheme['--md-sys-color-primary'],
    scheme['--md-sys-color-tertiary'],
  ];
}

/**
 * Retrieves the complete CSS token scheme for a given theme ID
 * @param {string} themeId
 * @param {{ isDark?: boolean, isOled?: boolean, seed?: string, customSeed?: string, schemeMode?: string }} [options={}]
 * @returns {Record<string, string>}
 */
export function getThemeScheme(themeId, options = {}) {
  const theme = M3_THEMES.find(t => t.id === themeId) || M3_THEMES[0];
  let isDark = theme.isDark;
  if (options.isDark !== undefined) {
    isDark = Boolean(options.isDark);
  } else if (options.schemeMode === 'light') {
    isDark = false;
  } else if (options.schemeMode === 'dark') {
    isDark = true;
  }
  const isOled = options.isOled !== undefined ? Boolean(options.isOled) : theme.isOled;
  const hasCustomSeed = Boolean(typeof options.customSeed === 'string' && options.customSeed.trim());
  const seed = hasCustomSeed
    ? options.customSeed.trim()
    : (options.seed || theme.seed);
  return generateM3Scheme(seed, isDark, {
    isOled,
    neutralChroma: hasCustomSeed ? undefined : theme.neutralChroma,
    neutralVariantChroma: hasCustomSeed ? undefined : theme.neutralVariantChroma,
    secondaryChroma: hasCustomSeed ? undefined : theme.secondaryChroma,
    tertiaryHueShift: hasCustomSeed ? undefined : theme.tertiaryHueShift,
    tertiaryChroma: hasCustomSeed ? undefined : theme.tertiaryChroma,
    surfaceTones: theme.surfaceTones,
    ...options
  });
}

/**
 * Applies an M3 theme directly to a DOM Document (setting custom properties and body class)
 * @param {string} themeId
 * @param {object} [options={}]
 * @param {Document} [doc=globalThis.document]
 * @returns {Record<string, string>}
 */
export function applyM3ThemeToDocument(themeId, options = {}, doc = globalThis.document) {
  if (!doc) return {};
  const scheme = getThemeScheme(themeId, options);
  if (doc.documentElement?.style) {
    for (const [prop, val] of Object.entries(scheme)) {
      doc.documentElement.style.setProperty(prop, val);
    }
  }
  if (doc.body) {
    doc.body.className = `theme-${themeId}`;
  }
  const theme = M3_THEMES.find(t => t.id === themeId) || M3_THEMES[0];
  let isDark = theme.isDark;
  if (options.isDark !== undefined) {
    isDark = Boolean(options.isDark);
  } else if (options.schemeMode === 'light') {
    isDark = false;
  } else if (options.schemeMode === 'dark') {
    isDark = true;
  }
  if (doc.documentElement?.setAttribute) {
    doc.documentElement.setAttribute('data-theme-mode', isDark ? 'dark' : 'light');
    doc.documentElement.setAttribute('data-theme-material', theme.material || 'standard');
  }
  return scheme;
}
