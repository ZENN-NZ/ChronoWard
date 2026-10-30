# Material Design 3 (M3 / Material You), HCT Color System & Pomodoro UX Specification

## Status: Implemented & Verified (`UI/Dev` Branch — 2026-10-31)

---

## 1. Perceptual HCT Color Engine (`src/m3-color.js`)

ChronoWard implements Google Material Design 3's perceptual color architecture in pure zero-dependency ES6 JavaScript (`src/m3-color.js`), enabling deterministic dynamic color generation offline under `connect-src 'none'`.

### 1.1 Color Space Pipeline
- **Forward Transform (`hexToHct`):** Hex $\rightarrow$ linearized sRGB $\rightarrow$ CIE XYZ (D65 illuminant) $\rightarrow$ CIE $L^*a^*b^*$ $\rightarrow$ cylindrical $L^*C^*h^\circ$ (`Hue` $0\text{–}360^\circ$, `Chroma` $0\text{–}120$, `Tone` $0\text{–}100$).
- **Inverse Transform (`hctToHex`):** Target `(H, C, T)` $\rightarrow$ binary-searched maximum in-gamut chroma $C' \le C$ at constant Hue $H$ and perceptual lightness $T$ $\rightarrow$ sRGB Hex, guaranteeing zero hue shift when clamping high-chroma tones.
- **Achromatic Seed Guard:** When seed Chroma $C < 5$ (e.g., `void` `#a0a0a0`), `primary`, `secondary`, `tertiary`, `neutral`, and `neutralVariant` palettes preserve `Chroma = 0` for pure monochrome rendering without floating-point color cast.

### 1.2 Six Key Tonal Palettes (`generateM3TonalPalette`)
From any seed color `(H, C, T)` and optional material overrides (`neutralChroma`, `neutralVariantChroma`, `secondaryChroma`, `tertiaryChroma`, `tertiaryHueShift`, `surfaceTones`), 6 tonal palettes are generated across 24 tone steps (`0, 4, 6, 10, 12, 17, 20, 22, 24, 25, 30, 35, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100`):
1. **Primary (`a1`):** Hue $H$, Chroma $\max(48, C)$ (or $0$ if achromatic)
2. **Secondary (`a2`):** Hue $H$, Chroma $16$ (or custom `secondaryChroma`)
3. **Tertiary (`a3`):** Hue $(H + \Delta H_{\text{tert}}) \bmod 360^\circ$, Chroma $24$ (or custom `tertiaryChroma`)
4. **Neutral (`n1`):** Hue $H$, Chroma $4$ (or custom `neutralChroma` for deep-tinted velvet surfaces)
5. **Neutral Variant (`n2`):** Hue $H$, Chroma $8$ (or custom `neutralVariantChroma`)
6. **Error:** Hue $25^\circ$, Chroma $84$ (semantic destructive/alert state)

### 1.3 Semantic Color Roles (`generateM3Scheme`)
Generates **34 `--md-sys-color-*` tokens** + **16 legacy aliases** (`--bg`, `--bg-1`, `--bg-2`, `--bg-3`, `--border`, `--text`, `--text-2`, `--text-3`, `--accent`, `--accent-2`, `--accent-glow`, `--ot`, `--ot-bg`, `--success`, `--warning`, `--danger`).

---

## 2. Ten Weekly Seed Palettes & Material Profiles

| Theme ID | Name | Seed Hex | Material Profile (`data-theme-material`) | Special Properties |
| :--- | :--- | :---: | :---: | :--- |
| `midnight` | Midnight | `#3b7cf5` | `midnight-velvet` | Deep navy-indigo velvet surfaces (`neutralChroma: 14`, `tertiaryHueShift: 110`) |
| `obsidian` | Obsidian | `#9d5cff` | `volcanic-glass` | Ultra-deep volcanic glass (`surface: Tone 3`, `lowest: Tone 1`, amethyst primary) |
| `aurora` | Aurora | `#00d4ff` | `standard` | Bioluminescent cyan-teal seed |
| `ember` | Ember | `#ff6630` | `standard` | Warm terracotta-amber seed |
| `forest` | Forest | `#44d980` | `standard` | Botanical emerald-sage seed |
| `rose` | Rose | `#e066cc` | `standard` | Vibrant magenta-rose seed |
| `steel` | Steel | `#8899cc` | `standard` | Industrial slate-blue seed |
| `void` | Void | `#a0a0a0` | `oled-void` | True `#000000` OLED surface + monochrome `Chroma = 0` |
| `neon` | Neon | `#00ffcc` | `standard` | High-chroma cyber-mint seed |
| `light` | Light | `#5b6af0` | `daylight-paper` | High-luminance (`Tone 98`) daylight paper scheme |

---

## 3. M3 Pomodoro Focus Timer State Machine & UI (`src/timers.js`, `src/app.js`, `src/index.html`)

- **Pure State Machine (`src/timers.js`):**
  - Phases: `work` (`🍅 Focus`, default `25m`), `shortBreak` (`☕ Short Break`, default `5m`), `longBreak` (`🌿 Long Break`, default `15m` after `4` sessions).
  - Built-in Presets (`POMODORO_PRESETS`): `Classic (25/5/15)`, `Deep Work (50/10/25)`, and `ADHD Sprint (15/3/10)`.
  - Drift-free timestamp countdown (`getPomodoroRemainingSecs`) using `Date.now() - startedAt`.
- **Interactive M3 Focus Card (`#pomoCard` in `src/index.html` & `src/app.js`):**
  - M3 Segmented Phase Switcher (`#pomoPhaseWorkBtn`, `#pomoPhaseShortBreakBtn`, `#pomoPhaseLongBreakBtn`).
  - Collapsible `⚙ Setup` configuration panel (`#pomoConfigPanel`) with preset filter chips, duration inputs, and automation toggles (`Auto-start Breaks`, `Auto-start Focus`, `Auto-log to Sheet`, `🔔 Sound Chime` via Web Audio API synthesizer `playPomodoroChime`).
  - Expressive SVG circular progress ring (`calculatePomodoroRingOffset`), visual cycle dots (`#pomoSessionDots`), and full transport controls (`↺ Reset`, `▶ Start Focus`, `⏭ Skip`, `✓ Log to Sheet`).
- **Persisted Settings (`src-tauri/src/state.rs` & `.icm/_config/data_schema.json`):**
  - `pomoWorkMinutes`, `pomoShortBreakMinutes`, `pomoLongBreakMinutes`, `pomoSessionsBeforeLongBreak`, `pomoAutoStartBreaks`, `pomoAutoStartWork`, `pomoAutoLogWork`, `pomoSoundEnabled`.
