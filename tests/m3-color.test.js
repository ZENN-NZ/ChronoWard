import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb,
  rgbToHex,
  hexToRgba,
  hexToHct,
  hctToHex,
  relativeLuminance,
  contrastRatio,
  generateM3TonalPalette,
  generateM3Scheme,
  M3_THEMES,
  getThemeScheme,
  applyM3ThemeToDocument,
  TONE_STEPS,
} from '../src/m3-color.js';

test('hexToHct and hctToHex round-trip and tone boundaries', () => {
  // Boundary tests
  assert.equal(hctToHex(180, 50, 0), '#000000', 'Tone 0 must be pure black');
  assert.equal(hctToHex(0, 0, 0), '#000000', 'Tone 0 with chroma 0 must be pure black');
  assert.equal(hctToHex(240, 60, 100), '#ffffff', 'Tone 100 must be pure white');
  assert.equal(hctToHex(0, 0, 100), '#ffffff', 'Tone 100 with chroma 0 must be pure white');

  const blackHct = hexToHct('#000000');
  assert.equal(blackHct.t, 0);

  const whiteHct = hexToHct('#ffffff');
  assert.equal(Math.round(whiteHct.t), 100);

  // Round-trip tests for standard colors
  const testHexes = ['#7c6df8', '#5b6af0', '#ff6630', '#44d980', '#e066cc', '#8899cc'];
  for (const hex of testHexes) {
    const hct = hexToHct(hex);
    assert.ok(hct.h >= 0 && hct.h < 360, `Hue ${hct.h} should be in [0, 360)`);
    assert.ok(hct.c >= 0, `Chroma ${hct.c} should be non-negative`);
    assert.ok(hct.t >= 0 && hct.t <= 100, `Tone ${hct.t} should be in [0, 100]`);

    const reconstructed = hctToHex(hct.h, hct.c, hct.t);
    // Allow slight perceptual rounding of +/- 1 RGB step per channel
    const [r1, g1, b1] = hexToRgb(hex);
    const [r2, g2, b2] = hexToRgb(reconstructed);
    assert.ok(
      Math.abs(r1 - r2) <= 1 && Math.abs(g1 - g2) <= 1 && Math.abs(b1 - b2) <= 1,
      `Round-trip mismatch for ${hex}: got ${reconstructed}`
    );
  }
});

test('generateM3TonalPalette produces all 6 palettes with tertiary hue shifted +60 deg', () => {
  const seedHex = '#7c6df8';
  const seedHct = hexToHct(seedHex);
  const palettes = generateM3TonalPalette(seedHex);

  const expectedPalettes = ['primary', 'secondary', 'tertiary', 'neutral', 'neutralVariant', 'error'];
  for (const name of expectedPalettes) {
    assert.ok(palettes[name], `Palette ${name} must exist`);
    assert.equal(typeof palettes[name], 'object');

    // Check tone steps
    for (const step of TONE_STEPS) {
      assert.ok(palettes[name][step], `Palette ${name} must have step ${step}`);
      assert.match(palettes[name][step], /^#[0-9a-f]{6}$/i, `Step ${step} in ${name} must be valid hex`);
    }

    // Step 0 and 100 boundaries
    assert.equal(palettes[name][0], '#000000', `Palette ${name}[0] must be black`);
    assert.equal(palettes[name][100], '#ffffff', `Palette ${name}[100] must be white`);
  }

  // Check tertiary hue shift: (H + 60) mod 360
  // Verify using mid-tone (Tone 50) LCH
  const tertTone50 = palettes.tertiary[50];
  const tertHct = hexToHct(tertTone50);
  const expectedTertHue = (seedHct.h + 60) % 360;
  const hueDiff = Math.abs(tertHct.h - expectedTertHue);
  const wrappedDiff = Math.min(hueDiff, 360 - hueDiff);
  assert.ok(wrappedDiff < 2.5, `Tertiary hue ${tertHct.h} should be close to ${expectedTertHue} (diff: ${wrappedDiff})`);
});

test('generateM3Scheme produces all 29+ --md-sys-color-* tokens and legacy aliases', () => {
  const darkScheme = generateM3Scheme('#7c6df8', true);
  const lightScheme = generateM3Scheme('#7c6df8', false);

  const requiredTokens = [
    '--md-sys-color-primary',
    '--md-sys-color-on-primary',
    '--md-sys-color-primary-container',
    '--md-sys-color-on-primary-container',
    '--md-sys-color-secondary',
    '--md-sys-color-on-secondary',
    '--md-sys-color-secondary-container',
    '--md-sys-color-on-secondary-container',
    '--md-sys-color-tertiary',
    '--md-sys-color-on-tertiary',
    '--md-sys-color-tertiary-container',
    '--md-sys-color-on-tertiary-container',
    '--md-sys-color-error',
    '--md-sys-color-on-error',
    '--md-sys-color-error-container',
    '--md-sys-color-on-error-container',
    '--md-sys-color-surface-dim',
    '--md-sys-color-surface',
    '--md-sys-color-surface-bright',
    '--md-sys-color-surface-container-lowest',
    '--md-sys-color-surface-container-low',
    '--md-sys-color-surface-container',
    '--md-sys-color-surface-container-high',
    '--md-sys-color-surface-container-highest',
    '--md-sys-color-on-surface',
    '--md-sys-color-on-surface-variant',
    '--md-sys-color-outline',
    '--md-sys-color-outline-variant',
    '--md-sys-color-inverse-surface',
    '--md-sys-color-inverse-on-surface',
    '--md-sys-color-inverse-primary',
    '--md-sys-color-surface-tint',
    '--md-sys-color-scrim',
    '--md-sys-color-shadow',
  ];

  const requiredLegacyAliases = [
    '--bg',
    '--bg-1',
    '--bg-2',
    '--bg-3',
    '--border',
    '--text',
    '--text-2',
    '--text-3',
    '--accent',
    '--accent-2',
    '--accent-glow',
    '--ot',
    '--ot-bg',
    '--success',
    '--warning',
    '--danger',
  ];

  for (const token of requiredTokens) {
    assert.ok(darkScheme[token], `Dark scheme must include ${token}`);
    assert.ok(lightScheme[token], `Light scheme must include ${token}`);
  }

  for (const alias of requiredLegacyAliases) {
    assert.ok(darkScheme[alias], `Dark scheme must include legacy alias ${alias}`);
    assert.ok(lightScheme[alias], `Light scheme must include legacy alias ${alias}`);
  }

  // Check OLED mode
  const oledScheme = generateM3Scheme('#7c6df8', true, { isOled: true });
  assert.equal(oledScheme['--md-sys-color-surface'], '#000000', 'OLED surface must be #000000');
  assert.equal(oledScheme['--md-sys-color-surface-container-lowest'], '#000000', 'OLED lowest container must be #000000');
});

test('M3_THEMES has exact 10 themes with required structure', () => {
  assert.equal(M3_THEMES.length, 10, 'Must have exactly 10 themes');

  const expectedIds = [
    'midnight', 'obsidian', 'aurora', 'ember', 'forest', 'rose', 'steel', 'void', 'neon', 'light'
  ];

  for (let i = 0; i < expectedIds.length; i++) {
    const theme = M3_THEMES[i];
    assert.equal(theme.id, expectedIds[i], `Theme index ${i} should be ${expectedIds[i]}`);
    assert.ok(theme.name, `Theme ${theme.id} must have a name`);
    assert.match(theme.seed, /^#[0-9a-f]{6}$/i, `Theme ${theme.id} seed must be valid hex`);
    assert.equal(typeof theme.isDark, 'boolean');
    assert.equal(typeof theme.isOled, 'boolean');
    assert.ok(Array.isArray(theme.colors), `Theme ${theme.id} colors must be an array`);
    assert.equal(theme.colors.length, 3, `Theme ${theme.id} colors must have 3 items`);
    for (const c of theme.colors) {
      assert.match(c, /^#[0-9a-f]{6}$/i, `Theme color ${c} must be valid hex`);
    }
  }

  // Void must have isOled: true
  const voidTheme = M3_THEMES.find(t => t.id === 'void');
  assert.ok(voidTheme.isOled, 'Void theme must have isOled=true');

  // Light must have isDark: false
  const lightTheme = M3_THEMES.find(t => t.id === 'light');
  assert.equal(lightTheme.isDark, false, 'Light theme must have isDark=false');
});

test('WCAG AA contrast check (>= 4.5) across all 10 M3_THEMES', () => {
  for (const theme of M3_THEMES) {
    const scheme = getThemeScheme(theme.id);

    const primary = scheme['--md-sys-color-primary'];
    const onPrimary = scheme['--md-sys-color-on-primary'];
    const crPrimary = contrastRatio(primary, onPrimary);
    assert.ok(
      crPrimary >= 4.5,
      `Theme ${theme.id} Primary/On-Primary contrast ratio ${crPrimary.toFixed(2)} must be >= 4.5`
    );

    const surface = scheme['--md-sys-color-surface'];
    const onSurface = scheme['--md-sys-color-on-surface'];
    const crSurface = contrastRatio(surface, onSurface);
    assert.ok(
      crSurface >= 4.5,
      `Theme ${theme.id} Surface/On-Surface contrast ratio ${crSurface.toFixed(2)} must be >= 4.5`
    );
  }
});

test('applyM3ThemeToDocument sets custom properties on documentElement and updates body class', () => {
  const styles = new Map();
  const attributes = new Map();
  const mockDoc = {
    documentElement: {
      style: {
        setProperty(k, v) {
          styles.set(k, v);
        },
        getPropertyValue(k) {
          return styles.get(k);
        }
      },
      setAttribute(k, v) {
        attributes.set(k, v);
      }
    },
    body: {
      className: ''
    }
  };

  const scheme = applyM3ThemeToDocument('ember', {}, mockDoc);
  assert.equal(mockDoc.body.className, 'theme-ember');
  assert.equal(styles.get('--md-sys-color-primary'), scheme['--md-sys-color-primary']);
  assert.equal(styles.get('--bg'), scheme['--bg']);
  assert.equal(attributes.get('data-theme-mode'), 'dark');
  assert.ok(styles.size >= 40, `Expected at least 40 tokens set, got ${styles.size}`);
});

test('getThemeScheme supports options.customSeed, options.schemeMode, and fallback options', () => {
  // 1. options.customSeed override
  const defaultMidnight = getThemeScheme('midnight');
  const customMidnight = getThemeScheme('midnight', { customSeed: '#ff0000' });
  assert.notEqual(
    customMidnight['--md-sys-color-primary'],
    defaultMidnight['--md-sys-color-primary'],
    'Custom seed must change primary color'
  );

  // Fallback when customSeed is null or empty string
  const nullSeedScheme = getThemeScheme('midnight', { customSeed: null });
  assert.equal(nullSeedScheme['--md-sys-color-primary'], defaultMidnight['--md-sys-color-primary']);
  const emptySeedScheme = getThemeScheme('midnight', { customSeed: '   ' });
  assert.equal(emptySeedScheme['--md-sys-color-primary'], defaultMidnight['--md-sys-color-primary']);

  // 2. options.schemeMode ('light', 'dark', 'auto')
  const lightMidnight = getThemeScheme('midnight', { schemeMode: 'light' });
  assert.notEqual(lightMidnight['--md-sys-color-surface'], defaultMidnight['--md-sys-color-surface']);
  // Light scheme surface should have high luminance (tone 98)
  assert.ok(relativeLuminance(lightMidnight['--md-sys-color-surface']) > 0.8);

  const defaultLight = getThemeScheme('light');
  assert.ok(relativeLuminance(defaultLight['--md-sys-color-surface']) > 0.8);

  const darkLight = getThemeScheme('light', { schemeMode: 'dark' });
  assert.ok(relativeLuminance(darkLight['--md-sys-color-surface']) < 0.1);

  const autoMidnight = getThemeScheme('midnight', { schemeMode: 'auto' });
  assert.equal(autoMidnight['--md-sys-color-surface'], defaultMidnight['--md-sys-color-surface']);

  // 3. Explicit isDark overrides schemeMode
  const overrideScheme = getThemeScheme('midnight', { schemeMode: 'light', isDark: true });
  assert.equal(overrideScheme['--md-sys-color-surface'], defaultMidnight['--md-sys-color-surface']);
});

test('hexToRgb handles edge cases, 3-digit hex, and invalid hex inputs', () => {
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('000'), [0, 0, 0]);
  assert.deepEqual(hexToRgb('#ff00aa'), [255, 0, 170]);
  assert.deepEqual(hexToRgb('  #123456  '), [18, 52, 86]);

  // Invalid inputs should return [0, 0, 0]
  assert.deepEqual(hexToRgb('invalid'), [0, 0, 0]);
  assert.deepEqual(hexToRgb('#12345z'), [0, 0, 0]);
  assert.deepEqual(hexToRgb('#1234'), [0, 0, 0]);
  assert.deepEqual(hexToRgb(null), [0, 0, 0]);
  assert.deepEqual(hexToRgb(undefined), [0, 0, 0]);
  assert.deepEqual(hexToRgb(123456), [0, 0, 0]);
});

test('achromatic seed (e.g. void #a0a0a0) produces pure monochrome OLED scheme without color cast', () => {
  const voidScheme = getThemeScheme('void');
  assert.equal(voidScheme['--md-sys-color-surface'], '#000000');
  const [r, g, b] = hexToRgb(voidScheme['--md-sys-color-primary']);
  assert.equal(r, g, 'Void primary R and G channels must be equal');
  assert.equal(g, b, 'Void primary G and B channels must be equal');
});

test('Midnight and Obsidian themes have distinct materials, surfaces, primaries, and tertiaries', () => {
  const midnightTheme = M3_THEMES.find(t => t.id === 'midnight');
  const obsidianTheme = M3_THEMES.find(t => t.id === 'obsidian');
  assert.notEqual(midnightTheme.material, obsidianTheme.material, 'Midnight and Obsidian must have distinct material profiles');
  assert.notEqual(midnightTheme.seed, obsidianTheme.seed, 'Midnight and Obsidian must have distinct seed colors');

  const midnight = getThemeScheme('midnight');
  const obsidian = getThemeScheme('obsidian');

  // Surface hierarchy must be completely distinct (Midnight navy-indigo vs Obsidian volcanic dark glass)
  assert.notEqual(midnight['--md-sys-color-surface'], obsidian['--md-sys-color-surface']);
  assert.notEqual(midnight['--md-sys-color-surface-container-lowest'], obsidian['--md-sys-color-surface-container-lowest']);
  assert.notEqual(midnight['--md-sys-color-surface-container-low'], obsidian['--md-sys-color-surface-container-low']);
  assert.notEqual(midnight['--md-sys-color-surface-container'], obsidian['--md-sys-color-surface-container']);
  assert.notEqual(midnight['--md-sys-color-surface-container-high'], obsidian['--md-sys-color-surface-container-high']);
  assert.notEqual(midnight['--md-sys-color-surface-container-highest'], obsidian['--md-sys-color-surface-container-highest']);

  // Obsidian volcanic glass must have deeper (lower luminance) base surface than Midnight velvet
  assert.ok(
    relativeLuminance(obsidian['--md-sys-color-surface']) < relativeLuminance(midnight['--md-sys-color-surface']),
    'Obsidian surface must be darker than Midnight surface'
  );

  // Primary and Tertiary accents must be distinct
  assert.notEqual(midnight['--md-sys-color-primary'], obsidian['--md-sys-color-primary']);
  assert.notEqual(midnight['--md-sys-color-primary-container'], obsidian['--md-sys-color-primary-container']);
  assert.notEqual(midnight['--md-sys-color-tertiary'], obsidian['--md-sys-color-tertiary']);
});

