# Changelog

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
