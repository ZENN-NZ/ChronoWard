# Changelog

## [2.0.1] - 2026-07-30

### Fixed
- **DOM XSS Security Vulnerability**: Sanitized input variables (`fromStr`, `toStr`) rendered directly to `container.innerHTML` in `renderDateRangeTimesheets()` in `src/app.js` using `escHtml()`, resolving GitHub CodeQL security alert (`js/xss-through-dom`, CWE-79 / CWE-116).
- **Theme Settings Persistence & Default Selection**: Fixed an issue where manual theme selection was lost upon closing and reopening ChronoWard. Selecting a theme swatch now immediately persists `settings.theme` and `settings.themeSetAt` to storage, making the chosen theme the default on restart.
- **Weekly Theme Auto-Rotation Integration**: Updated weekly theme auto-rotation (`autoRotateTheme`) to rotate seamlessly relative to the user's selected base theme (`settings.theme`) starting from `settings.themeSetAt`.

### Security
- Enhanced `escHtml()` in `src/utils.js` to escape single quotes (`'`) to `&#39;` alongside double quotes, ampersands, and angle brackets, preventing attribute injection vulnerabilities.

### Changed
- `src/app.js` — sanitized DOM string interpolation in range renderer, updated `applyTheme` to immediately persist settings and record `themeSetAt`, and updated `init()` theme calculation to advance auto-rotation relative to saved base theme.
- `src/utils.js` — expanded `escHtml()` single quote entity replacement.
- `tests/utils.test.js` — added unit tests covering `escHtml()` sanitization across special characters and edge cases (6/6 Node.js unit tests passing cleanly).
- `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` — bumped version number to `2.0.1`.

---

## [2.0.0] - 2026-07-29

### Core Features & Neurodivergent UX
- **Designed for Focus (ADHD / ASD Support)**: Built ChronoWard's layout specifically to reduce distractions, combat time-blindness, and assist with executive focus and task management.
- **Quick-Capture HUD (`Ctrl+Shift+Space`)**: Press `Ctrl+Shift+Space` anywhere on your computer to open a pop-up window (`src/hud.html`) and log active tasks in seconds, featuring an optional `Ticket #` field and streamlined entry.
- **Pomodoro Focus View**: Added a `🍅 Pomodoro` mode that hides busy tables and displays only your single active task card to prevent feeling overwhelmed.
- **Visual Time Ring**: Added a smooth progress ring around active timers so you can visually see time passing rather than just watching numbers count down.
- **Date Range Timesheet Explorer**: Refactored the secondary view into an interactive range explorer featuring `From` and `To` date pickers, quick presets (`This Week`, `This Month`), summary stats, and easy day navigation (`Edit Date ↵`).
- **Keyboard Shortcuts Help Menu (`?`)**: Added `Ctrl+Shift+Space` (Open Quick Capture HUD) to the interactive Keyboard Shortcuts help modal (`?`).

### Quick Log HUD & Real-Time Synchronization
- **Zero-I/O HUD Event Decoupling**: Completely removed redundant `load_sheets` and `save_sheets` disk I/O from `commitLog()` in `hud.html`. The HUD now functions as a zero-I/O event emitter broadcasting full task row payloads (`hud-entry-added`), leaving `app.js` as the single source of truth for DOM state and disk persistence, eliminating split-brain race conditions.
- **Non-Destructive IPC Bridge & Seamless DOM Append**: Removed destructive `loadSheets()` disk-reloads from `api.js` and updated `app.js` to append HUD task rows seamlessly via `addRow()`. Persists combined state immediately, preserving unsaved typing, cursor focus, button event listeners, and `detailedMode` / `projectMode` styling.
- **Real-Time Active Timer & Log Refresh**: Ensured Quick Log HUD entry additions cleanly sync state, refresh main window logs instantly, and preserve running timer button highlights without DOM thrashing or resetting running intervals.

### Security, Concurrency & Data Integrity
- **Insecure Downgrade Attack Prevention & Command Enforcement**: Hardened `decrypt()` and `probe_keychain()` in `crypto.rs` to track OS Keychain key creation state (`is_new_key`), strictly blocking unencrypted plaintext JSON fallbacks when an established key is active to prevent downgrade attacks. Optimized legacy JSON syntax validation to use zero-allocation `serde::de::IgnoredAny` parsing, and updated all command loaders (`sheets.rs`, `timers.rs`, `settings.rs`) to route all payloads directly through `state.decrypt()`.
- **OS Keychain Performance Optimization**: Cached the OS Keychain encryption key in `AppState` using `secrecy::SecretVec<u8>` at startup, eliminating repetitive OS IPC overhead during rapid typing and timer ticks.
- **CSV Formula Injection & Falsy Value Data Loss Neutralization**: Created and enhanced `sanitizeCsvCell()` in `utils.js` to evaluate formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) against leading-whitespace trimmed values while prepending a single quote `'`, neutralizing formula injection while preserving formatting. Fixed a data loss bug by switching from `val || ''` to nullish coalescing `val ?? ''` to preserve legitimate `0` and `false` values in CSV exports.
- **Concurrent Save Race Condition Protection**: Implemented `write_lock: tokio::sync::Mutex<()>` across backend `save_sheets`, `save_timers`, and `save_settings` command handlers to ensure thread-safe disk persistence.
- **Enterprise Security Permissions**: Created official permission files (`src-tauri/capabilities/`) to safely control capability scopes per window for enterprise safety.

### Architecture, State Management & System Hardening
- **ES6 Modular Frontend Architecture**: Restructured monolithic `app.js` into focused ES6 modules (`utils.js`, `api.js`, `state.js`, `timers.js`).
- **Reactive State Store & Boot Hydration**: Built an `EventTarget`-backed reactive store (`state.js`) and centralized Tauri IPC listeners in `api.js`. Initialized `store.timers` and `store.settings` during boot with reactive event listeners (`timers-changed`, `settings-changed`) for cross-module state synchronization.
- **Configurable Timer Duration Stepping & Precision Protection**: Updated `stopTimer()` in `timers.js` to dynamically apply `store.settings.hourIncrement` rounding with non-zero validation while replacing `.toFixed(1)` truncation with `parseFloat((existing + roundedHours).toFixed(3))` and `Math.round(val * 100) / 100` rounding to eliminate IEEE 754 precision drift.
- **DRY Timer Interval Teardown & Dead State Cleanup**: Extracted `clearTimerInterval(timerId)` helper in `timers.js` and moved handle deletion above state guards, eliminating duplicate interval cleanup logic, preventing interval memory leaks, and purging unused module-scoped declarations.
- **DST / Timezone Boundary Drift Insulation**: Fixed date parsing in `getWeekMonday()`, `dayAbbr()`, and `getWeekdayDates()` in `utils.js` to parse date strings at fixed noon (`T12:00:00`), preventing daylight saving time transitions from causing day-shifting drift across midnight.
- **Orphaned Temp File Purging**: Added background startup cleanup in `lib.rs` to automatically purge `.tmp.*` files older than 1 hour.
- **App Startup Reliability & Version Alignment**: Cleaned up window initialization in `app.js` to ensure the app launches cleanly without background errors, and aligned project configuration version numbers (`package-lock.json` and `package.json`).

### Test Coverage Expansion
- **State & Crypto Unit Test Suites**: Added `test_state_decrypt_blocks_plaintext_downgrade_when_key_preexists` and `test_state_decrypt_allows_plaintext_migration_when_key_is_new` in `state.rs`, alongside `crypto.rs` tests (100% of 24 Rust unit tests passing cleanly).
- **Backend Scheduler Test Suite Expansion**: Added unit tests covering time parsing, boundary cases, whitespace handling, and focus trigger daily housekeeping in `scheduler.rs` (100% of 20 unit tests passing cleanly).
- **Frontend Utility Test Suite**: Created Node.js native test runner test suite in `tests/utils.test.js` and configured `"test": "node --test"` in `package.json` covering `sanitizeCsvCell()` edge cases including falsy values, quote escaping, and formula injection (5/5 unit tests passing cleanly).

---

## [1.3.5] - 2026-07-22

### Added
- **Keyboard Shortcuts Modal:** Interactive shortcuts modal dialog (`#shortcutsModal`) accessible via top header `❓` help button or pressing `?` key
- **Expanded Keyboard Navigation:** Comprehensive keybindings for Detailed Mode toggle (`Ctrl+Shift+D`), Project Mode toggle (`Ctrl+Shift+P`), CSV Export (`Ctrl+E`), Force Save (`Ctrl+S`), Date Navigation (`Alt+Left`/`Alt+Right`/`Alt+T`), and View switching (`Ctrl+1`/`2`/`3`)

### Changed
- `.gitignore` — added `.gemini/` directory to prevent workspace skill files from being committed to version control
- `src/index.html` — added `❓` help button to view header and modal overlay structure
- `src/styles.css` — added theme-adaptive modal styling, key row flex layouts, and custom `<kbd>` badges
- `src/app.js` — expanded `setupKeyboardShortcuts()` handler, date navigation helpers, and modal toggle bindings

---

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