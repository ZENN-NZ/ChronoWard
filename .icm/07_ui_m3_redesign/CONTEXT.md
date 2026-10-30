# Stage 07: Material Design 3 (M3) UI & HCT Color System Redesign

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 0 (Identity)  | `../WORKSPACE.md` | Neurodivergent UX invariants & Habituation Defense |
| Layer 3 (Reference) | `../_config/architecture_spec.md` | Multi-window topology (`index.html`, `hud.html`, `overlay.html`) |
| Layer 3 (Reference) | `../_config/data_schema.json` | `Settings` schema (`theme`, `schemeMode`, `customSeedEnabled`, `customSeedColor`) |
| Layer 4 (Working)   | `../06_code_review/output/code_review_report.md` | Post-Pass-2 verified codebase baseline (`dev` merged into `UI/Dev`) |

## Process
1. Implement the Material Design 3 perceptual **HCT (`Hue, Chroma, Tone`)** color space engine in `src/m3-color.js`:
   - Convert Hex $\leftrightarrow$ sRGB $\leftrightarrow$ CIE XYZ (D65) $\leftrightarrow$ CIE $L^*a^*b^*$ / $L^*C^*h^\circ$ with binary-searched chroma gamut clipping.
   - Generate 6 tonal palettes (`primary`, `secondary`, `tertiary` rotated $+60^\circ$, `neutral`, `neutralVariant`, `error`) across 24 tone steps (`0`–`100`), keeping achromatic seeds (`C < 5`, e.g., `void`) strictly monochrome (`Chroma = 0`).
   - Map tonal palettes to 34 `--md-sys-color-*` semantic roles + 16 legacy CSS aliases (`--bg`, `--accent`, etc.) for both Dark (`Tone 6` surface) and Light (`Tone 98` surface) schemes, plus true `#000000` OLED surface override for `void`.
   - Enforce automatic WCAG AA contrast verification ($\ge 4.5:1$) between paired `X` and `on-X` roles.
2. Refactor `src/styles.css` to a full Material Design 3 token and component architecture (Navigation Drawer with `56px` pill indicators, `52×32px` M3 Switch with `✓` thumb icon, Extended FAB, Tonal Surface Table, `FilledTonalIconButton` steppers, `FilterChip` OT/weekly chips, Expressive Circular Progress ring, `28px` M3 Dialogs, and M3 Snackbar).
3. Upgrade `src/index.html`, `src/app.js`, `src/hud.html`, `src/hud.js`, `src/overlay.html`, and `src-tauri/src/state.rs` to support M3 dynamic color controls (`schemeMode`: `'auto' | 'dark' | 'light'`, `customSeedEnabled`, `customSeedColor`) and real-time `theme-updated` IPC synchronization across windows.
4. Validate HCT color math, tonal palettes, semantic tokens, and WCAG AA contrast ratios via `tests/m3-color.test.js`.

## Outputs
- `output/m3_design_system_spec.md`: Complete specification of the Material Design 3 HCT color system, semantic token table, component anatomy, and test coverage.
- **Review Gate**: Direct Argon code review sign-off and 100% pass rate across all 21 frontend unit tests (`npm test`).
