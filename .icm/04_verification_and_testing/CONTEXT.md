# Stage 04: Verification and Testing

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 3 (Reference) | `../_config/security_policy.md` | Security and audit rules |
| Layer 4 (Working)   | `../03_core_implementation/output/implementation_summary.md` | Code changes, Pomodoro state machine & module contracts |
| Layer 4 (Working)   | `../07_ui_m3_redesign/output/m3_design_system_spec.md` | M3 HCT color engine, material profiles & WCAG AA contrast contracts |

## Process
1. Execute Node.js native unit test runner (`npm test` / `node --test`).
2. Verify all 11 utility test cases in `tests/utils.test.js` (CSV formula injection, falsy value retention, quote escaping, HTML escaping, Dual 12/12 ticket parsing, HUD payload validation, and midnight rollover evaluation).
3. Verify all 6 timer & Pomodoro state machine tests in `tests/timers.test.js` (`calculateRoundedHours`, `createPomodoroState` & `normalizePomodoroConfig`, `formatPomodoroTime` & `calculatePomodoroRingOffset`, drift-free `startPausePomodoro`, `advancePomodoroPhase` cycle transitions, and `resetPomodoroPhase` / `switchPomodoroPhase` / `updatePomodoroConfig`).
4. Verify all 10 Material Design 3 HCT color theory tests in `tests/m3-color.test.js` (HCT $\leftrightarrow$ Hex round-trip & tone boundaries, 6 tonal palettes with $+60^\circ$ tertiary shift, 34 `--md-sys-color-*` tokens + 16 legacy aliases, 10 `M3_THEMES`, WCAG AA $\ge 4.5:1$ contrast across all 10 themes, `applyM3ThemeToDocument`, custom seed & scheme mode overrides, invalid hex edge cases, achromatic `void` OLED purity, and `Midnight` vs `Obsidian` distinct material/surface/primary/tertiary profiles).
5. Execute Rust backend unit test suite (`cargo test --manifest-path src-tauri/Cargo.toml`) covering `crypto`, `state`, `scheduler`, `sheets` (`C1`, `R-H3`, `R-H4`), and `settings` (`atomic_write`).

## Outputs
- `output/test_verification_report.md`: Complete summary of automated unit tests, execution status, and pass counts.
- **Review Gate**: 100% test pass rate across both frontend (27/27) and backend (27/27) suites.
