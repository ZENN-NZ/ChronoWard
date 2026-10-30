# Technical Architecture Specification — ChronoWard (Layer 3)

## 1. System Topology
ChronoWard uses a multi-window Tauri v2 architecture combining a privileged Rust core with three specialized WebView windows:

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         TAURI v2 RUST CORE                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │  crypto.rs   │  │   state.rs   │  │ scheduler.rs │  │ tray.rs  │  │
│  │ (AES-256-GCM │  │ (AppState +  │  │ (60s Ticker  │  │ (System  │  │
│  │  + Keychain) │  │  WriteLock)  │  │  & Focus)    │  │  Tray)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  │
│         └─────────────────┴────────┬────────┴───────────────┘        │
│                                    │ IPC Commands & Events           │
└────────────────────────────────────┼─────────────────────────────────┘
                                     │
       ┌─────────────────────────────┼─────────────────────────────┐
       ▼                             ▼                             ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│   Main Window        │  │   Quick Log HUD      │  │   Overlay Widget     │
│   (src/index.html)   │  │   (src/hud.html)     │  │   (src/overlay.html) │
│                      │  │   + src/hud.js       │  │   + src/overlay.js   │
│  ES6 Modular Core:   │  │  Zero-I/O Emitter:   │  │  Status Pill:        │
│  - app.js            │  │  Emits               │  │  Auto-shrinking      │
│  - state.js          │  │  'hud-entry-added'   │  │  glassmorphic alert  │
│  - api.js            │  │  Awaits ack:         │  │  positioned on       │
│  - timers.js         │  │  'hud-entry-saved' / │  │  active monitor      │
│  - utils.js          │  │  'hud-entry-failed'  │  │  work_area()         │
│  - m3-color.js       │  │  Syncs M3 theme via  │  │                      │
│                      │  │  'theme-updated'     │  │                      │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

---

## 2. Rust Backend Modules (`src-tauri/src/`)
- **`main.rs` / `lib.rs`**: Application bootstrap, single-instance lock (`tauri-plugin-single-instance`), global shortcut registration (`Ctrl+Shift+Space`), orphaned `.tmp.*` file janitor (purges files > 1 hour old), and startup autostart sync via `load_settings_impl`.
- **`crypto.rs`**:
  - Hardware keychain integration (`keyring` crate) with pre-probe `check_encrypted_data_exists()` guard so keychain loss never generates a new key over existing `enc1:` files.
  - Format: `enc1:<hex(12-byte nonce || AES-256-GCM ciphertext + 16-byte tag)>`.
  - Tracks `is_new_key` on startup to enforce anti-downgrade verification while permitting automatic first-run plaintext re-encryption.
- **`state.rs`**:
  - Holds `AppState`: `data_dir`, `keychain_status`, cached `encryption_key: Option<SecretVec<u8>>`, `emergency_mode`, `write_protected: AtomicBool`, cached `settings: Mutex<Option<Settings>>`, `warning_active: Mutex<bool>`, and `write_lock: tokio::sync::Mutex<()>`.
  - Defines `Settings` struct (with `#[serde(rename_all = "camelCase")]` and `#[serde(default)]`), including:
    - Theme & M3 fields: `theme`, `theme_base_offset`, `auto_rotate_theme`, `scheme_mode`, `custom_seed_enabled`, `custom_seed_color`.
    - Pomodoro fields: `pomo_work_minutes`, `pomo_short_break_minutes`, `pomo_long_break_minutes`, `pomo_sessions_before_long_break`, `pomo_auto_start_breaks`, `pomo_auto_start_work`, `pomo_auto_log_work`, `pomo_sound_enabled`.
- **`scheduler.rs`**:
  - Background `tokio` loop ticking every 60s.
  - Evaluates `warning_time` for daily hours alerts (emitting `check-hours-warning` without stealing window focus every minute) and triggers configured `focus_times` slots once per day.
- **`commands/`**:
  - `sheets.rs`: `load_sheets`, `save_sheets` (restricted to `window.label() == "main"`, guarded by `guard_write!` and `write_lock`, with automatic `.json.bak` recovery and first-run plaintext re-encryption).
  - `timers.rs`: `load_timers`, `save_timers` (restricted to `window.label() == "main"`, encrypted at rest; corrupt `timers.json` is quarantined without locking out `sheets.json`).
  - `settings.rs`: `load_settings`, `save_settings` (`save_settings` restricted to `window.label() == "main"`, encrypted at rest with `.json.bak` copy-before-rename `atomic_write` and OS autostart sync).
  - `csv.rs`: `export_csv` (restricted to `window.label() == "main"`, runs native save file dialog inside `tokio::task::spawn_blocking`).
  - `window.rs`: `set_warning_active`, `is_warning_active`, `set_always_on_top`, `show_window`, `minimize_to_tray`, `show_overlay` (using `monitor.work_area()` for multi-monitor & taskbar clearance), `toggle_hud_cmd`, `hide_hud_cmd`.

---

## 3. Frontend ES6 Modular Architecture (`src/`)
- **`state.js`**: `EventTarget`-backed reactive store (`store`) holding `sheets`, `timers`, `settings`, `currentDate`, `projectMode`, `detailedMode`, `isCleanSlateMode`, and `isEmergencyMode`. Emits `timers-changed` and `settings-changed`.
- **`api.js`**: Tauri IPC wrapper around `invoke` and `listen` calls.
- **`utils.js`**: Pure, side-effect-free utilities (`sanitizeCsvCell`, `escHtml`, `parseTicketNum`, `validateHudPayload`, `evaluateMidnightRollover`, `getWeekMonday`, `getWeekdayDates`, `dayAbbr`, `generateId`).
- **`timers.js`**:
  - Row timer interval management (`clearTimerInterval`), `calculateRoundedHours`, and dynamic `hourIncrement` stepping clamped to `[0, 24]`.
  - **Pomodoro Focus Timer State Machine**: Pure, drift-free timestamp countdown engine (`POMODORO_PHASES`, `POMODORO_PRESETS`, `normalizePomodoroConfig`, `createPomodoroState`, `getPomodoroRemainingSecs`, `getPomodoroUnloggedWorkSecs`, `formatPomodoroTime`, `calculatePomodoroRingOffset`, `startPausePomodoro`, `resetPomodoroPhase`, `switchPomodoroPhase`, `advancePomodoroPhase`, `updatePomodoroConfig`).
- **`m3-color.js`**: Material Design 3 (M3 / Material You) perceptual HCT (`Hue, Chroma, Tone`) color engine:
  - Converts Hex $\leftrightarrow$ sRGB $\leftrightarrow$ CIE XYZ (D65) $\leftrightarrow$ CIE $L^*a^*b^*$ / $L^*C^*h^\circ$ with binary-searched gamut mapping.
  - Generates 6 tonal palettes (`primary`, `secondary`, `tertiary`, `neutral`, `neutralVariant`, `error`) across 24 tone steps (`0`–`100`), supporting per-theme chroma overrides, custom `surfaceTones` (e.g., `midnight-velvet` vs `volcanic-glass` `obsidian`), and pure `Chroma = 0` for achromatic seeds (`C < 5`, e.g., `void`).
  - Generates 34 `--md-sys-color-*` semantic roles + 16 legacy CSS aliases (`--bg`, `--accent`, etc.) with automatic WCAG AA contrast verification ($\ge 4.5:1$).
- **`app.js`**: Primary UI controller, DOM event orchestration, serialized save queue (`flushSheetsToDisk`), Pomodoro Focus UI & Web Audio chime synthesizer (`playPomodoroChime`), M3 theme/scheme/seed application, `theme-updated` IPC emitter, midnight rollover handling, and keyboard shortcuts.
- **`hud.js` & `overlay.js`**: Externalized controller scripts for `hud.html` (Quick Log HUD with M3 dynamic theme sync and ack listener cleanup) and `overlay.html` (floating status widget).
