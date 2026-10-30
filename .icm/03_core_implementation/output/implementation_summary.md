# Core Implementation Summary

## Status: Complete (Updated 2026-10-31)

### 1. Backend Modules (`src-tauri/src/`)
- **`crypto.rs`**: AES-256-GCM cryptographic engine (`enc1:`), hardware keychain interfacing (`keyring`), and pre-probe `check_encrypted_data_exists()` guard.
- **`state.rs`**: Managed `AppState` with `write_protected: AtomicBool`, async serialization mutex (`write_lock`), and `Settings` struct (including `theme_base_offset`, M3 `scheme_mode`, `custom_seed_enabled`, `custom_seed_color`, and 8 Pomodoro configuration fields `pomo_*`).
- **`scheduler.rs`**: 60-second background ticker evaluating `warning_time` and `focus_times` without stealing window focus repeatedly.
- **`commands/`**:
  - `sheets.rs`: Encrypted `load_sheets` / `save_sheets` with `.json.bak` recovery, first-run plaintext re-encryption, and `main` window ACL check.
  - `timers.rs`: Encrypted `load_timers` / `save_timers` with isolated corruption quarantine and `main` window ACL check.
  - `settings.rs`: Encrypted `load_settings` / `save_settings` with copy-before-rename `atomic_write`, `.json.bak` recovery, and OS autostart sync.
  - `csv.rs`: `export_csv` running native save dialog inside `tokio::task::spawn_blocking`.
  - `window.rs`: Multi-monitor & taskbar-aware `show_overlay` (via `monitor.work_area()`), `show_window`, `minimize_to_tray`, `toggle_hud_cmd`, and `hide_hud_cmd`.

### 2. Frontend Modules (`src/`)
- **`app.js`**: Main controller with serialized `flushSheetsToDisk()` save queue, `evaluateMidnightRollover()` 60s date-transition check, input-blur date-navigation protection, interactive Pomodoro Focus controller (segmented phase tabs, presets, auto-logging, Web Audio chime synthesizer `playPomodoroChime`), M3 theme/scheme/seed application, and `theme-updated` IPC emission.
- **`m3-color.js`**: Perceptual HCT (`Hue, Chroma, Tone`) color engine generating 6 tonal palettes across 24 tone steps, 34 `--md-sys-color-*` semantic roles + 16 legacy CSS aliases, WCAG AA contrast verification ($\ge 4.5:1$), monochrome OLED `void` support, custom surface/material profiles (`midnight-velvet`, `volcanic-glass` `obsidian`), and 10 weekly seed themes (`M3_THEMES`).
- **`state.js`**: Reactive `EventTarget` store managing application state and emitting `timers-changed` and `settings-changed`.
- **`api.js`**: Tauri IPC command and event wrappers.
- **`timers.js`**: Real-time row interval timers (`calculateRoundedHours()`, `hourIncrement` dynamic stepping, `[0, 24]` clamping) plus the pure **Pomodoro Focus Timer State Machine** (`POMODORO_PHASES`, `POMODORO_PRESETS`, `createPomodoroState`, `startPausePomodoro`, `advancePomodoroPhase`, `resetPomodoroPhase`, `switchPomodoroPhase`, `updatePomodoroConfig`, `calculatePomodoroRingOffset`).
- **`utils.js`**: Pure helpers including `sanitizeCsvCell`, `escHtml`, `parseTicketNum`, `validateHudPayload`, `evaluateMidnightRollover`, and `generateId` (`crypto.randomUUID()`).
- **`hud.js` & `overlay.js`**: Externalized controller scripts for `hud.html` (with M3 theme sync, weekly rotation calculation, and ack listener cleanup) and `overlay.html`.
