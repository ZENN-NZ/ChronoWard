# Changelog

## [1.1.1] - 2026-04-18

### Fixed
- **Critical:** Prevented duplicate background processes by implementing a single-instance lock via `tauri-plugin-single-instance`
- Secondary launch attempts now automatically focus and unminimize the primary application window

### Security
- Ran through cargo audit, clippy and fmt. No issues found.

---

## [1.1.0] - 2026-04-19

### Added
- Native autostart support via `tauri-plugin-autostart`
- `settingAutoStart` toggle switch in the Settings configuration page

### Changed
- `src-tauri/src/state.rs` — upgraded `Settings` schema to include `auto_start` defaulting to `true`
- `src-tauri/src/lib.rs` — initialized autostart plugin within native setup lifecycle
- `src-tauri/src/commands/settings.rs` — updated `save_settings` to accept `AppHandle` for instantaneous boot persistence syncing
- `app.js` — updated state hydration to pull/push `auto_start` property during load and save operations
- `README.md` updated with Linux XDG Autostart requirements

### Security
- Minimized JavaScript bundle size by bypassing NPM packages in favor of native Rust execution for autolaunch logic

---

## [1.0.0] - 2026-04-18

### Added
- `SECURITY.md` documenting encryption architecture, threat model, CSP, and vulnerability reporting process
- App icons for all required resolutions (`32x32`, `64x64`, `128x128`, `128x128@2x`)

### Fixed
- **Critical:** All buttons and toggles non-functional in production builds — caused by WebView2 blocking inline `onclick`/`onchange`/`oninput`/`onblur` handlers under strict CSP. Rewrote `addRow()` to use DOM methods and added `setupStaticListeners()` to wire all static UI elements via `addEventListener`
- Export filename date format corrected
- Time picker clock icons now visible across all dark themes via `::-webkit-calendar-picker-indicator` CSS; light theme uses darker variant

### Changed
- `index.html` — removed all inline event handler attributes; static buttons given explicit IDs
- `app.js` — added `setupStaticListeners()` called from `init()`; `addRow()` fully rewritten to use `createElement`/`addEventListener` instead of `innerHTML` with inline handlers
- `tauri.conf.json` — added `'unsafe-inline'` to `script-src` CSP (retained as belt-and-suspenders alongside the handler rewrite)
- `README.md` updated

### Security
- AES-256-GCM encryption at rest via OS native keychain (Windows DPAPI / macOS Keychain / Linux libsecret)
- Emergency read-only mode when keychain unavailable with encrypted data present
- Atomic writes (`.tmp` → rename) preventing partial write corruption
- Corrupt data quarantine with timestamped filename
- CSP blocks all external connections (`connect-src 'none'`)