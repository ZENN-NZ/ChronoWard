# Changelog
## [1.3.4] - 2026-07-22

### Added
- **Overlay Positioning:** Configurable desktop overlay positioning option (`Top Right`, `Center Right`, `Bottom Right`, `Top Left`, `Center Left`, `Bottom Left`) in Appearance settings with taskbar height clearance
- **Overlay Auto-Shrink:** Auto-shrinking overlay icon behavior after 5 seconds of inactivity with smooth hover expansion to original size

### Fixed
- **Overlay Glass Panel:** Disabled native Windows DWM window shadow on transparent overlay window
- **Warning Lifecycle:** Fixed overlay sizing state sync so overlay resumes auto-shrinking after required hours are logged and warning banner is dismissed

### Changed
- `src-tauri/tauri.conf.json` — disabled window shadow (`"shadow": false`) and updated app version to `1.3.4`
- `src-tauri/src/commands/window.rs` — implemented multi-position monitor coordinates and taskbar clearance margin
- `src-tauri/src/state.rs` — added `overlay_position` field to `Settings` struct
- `src/index.html` — added Overlay Position dropdown in Appearance section below Theme grid
- `src/app.js` — mapped `#settingOverlayPosition` in UI load and save handlers
- `src/overlay.html` — implemented transparent styling, auto-shrink, hover expansion, and position alignment

---

## [1.3.3] - 2026-07-22

### Fixed
- **Critical:** Fixed scheduler focus time trigger deduplication to prevent multiple popups per window slot
- **Critical:** Rate-limited `check-hours-warning` background IPC event to fire at most once per minute
- Autostart setting deserialization on startup when `settings.json` is encrypted with OS keychain
- CSV import `OT` boolean conversion bug where `"No"` evaluated as truthy in JavaScript
- Replaced invalid `<icon>` tag with standard HTML5 `<img>` element for sidebar brand icon

### Changed
- `src-tauri/src/commands/settings.rs` — updated `atomic_write()` to use unique nanosecond timestamp temp filenames and cleanup on error for Windows file lock safety
- Upgraded Mutex guards in command modules to use `unwrap_or_else` to prevent lock poisoning thread cascades
- Bumped version to `1.3.3` in `package.json` and `Cargo.toml`

### Security
- Explicitly blocked mid-session unencrypted file writes if OS keychain becomes unreachable during save operations
- Ran unit test suite (`cargo test`). 15/15 tests passing cleanly.

---

## [1.3.2] - 2026-05-21

### Updated
Weekly completion banner
- Design more inline with overall app theme
- Logic updated: Now linked to the week that is selected

Security update

## [1.2.0] - 2026-05-21

### Added
- Weekly completion banner in the table footer — shows Mon-Fri completion chips (green check / red X) next to the hour stats. Uses settings.warningTime as the gate for today's chip.

### Fixed
- Weekly completion chips now read today's hours live from the DOM instead of the saved sheets object, so they update in real time as hours are entered


## [1.1.3] - 2026-04-22
### Fixed
- Warning timer issue - App would not pop up automatically when minimised, if hours were less than 7.5


## [1.1.2] - 2026-04-22

### Fixed
- Autostart issue - Webview2 not loading on startup at random.

---

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