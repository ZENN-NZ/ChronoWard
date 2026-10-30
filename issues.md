# ChronoWard - GitHub Issue & Closure Drafts

> [!IMPORTANT]
> **When retrospectively raising and closing these issues on GitHub, they MUST be logged and closed in chronological order (from oldest version to newest version) to accurately reflect the original timeline of events.**

Use the following templates to retrospectively raise GitHub issues for historical bugs and immediately close them with the corresponding closure note and commit hash.

---

## 🟢 v2.0.4 (Commit: `1e427bb`)

### [COMPLETED] Issue: Shortcut Date Navigation Causes Data Overwrite
*Note: Already logged and closed on GitHub as Issue #1.*

**Description:**
When a user is actively typing in a task input field and uses date navigation shortcuts (`Alt + Left`, `Alt + Right`, or `Alt + T`), the current rows copy over and overwrite the target date's timesheet. This occurs because the browser's DOM element removal fires a `blur` event *after* `currentDate` has already updated.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.4 (Commit: `1e427bb`). Added explicit `document.activeElement.blur()` handling at the top of `shiftSelectedDate()` and `jumpToToday()` in `src/app.js`. This forces the active text input to save its data to the *origin* date prior to clearing the DOM and switching the date view.

### Issue: Manual Theme Selections Not Persisting with Auto-Rotate Enabled
**Description:**
If "Auto-Rotate Theme" is enabled, manually clicking a theme swatch applies the theme temporarily but reverts back to the original auto-rotated theme upon restarting the application.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.4 (Commit: `1e427bb`). Implemented an offset-based queue system (`themeBaseOffset`) calculated against the `installedAt` timestamp. Selecting a theme now sets an offset so the chosen theme applies for the current week and correctly transitions to the next theme in the 7-day queue. Added `theme_base_offset` to the Rust `Settings` struct for proper disk persistence, and prevented `applyTheme()` from corrupting in-memory settings on startup.

---

## 🟢 v2.0.1 (Commit: `e0b83be`)

### Issue: DOM XSS Security Vulnerability in Timesheet Range View
**Description:**
A GitHub CodeQL security alert flagged a DOM Cross-Site Scripting (XSS) vulnerability (`js/xss-through-dom`, CWE-79 / CWE-116). Input variables (`fromStr`, `toStr`) are rendered directly into `container.innerHTML` without sanitization in the `renderDateRangeTimesheets()` function.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.1 (Commit: `e0b83be`). Applied `escHtml()` sanitization to all date string interpolations rendered into the DOM. Enhanced `escHtml()` in `src/utils.js` to additionally escape single quotes (`'`) to prevent attribute injection.

### Issue: Theme Settings Default Selection Lost on Restart
**Description:**
Manual theme selections are lost when closing and reopening ChronoWard. The app does not save the active theme immediately upon clicking the swatch.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.1 (Commit: `e0b83be`). Selecting a theme swatch now immediately triggers `invoke('save_settings')`, persisting `settings.theme` and `settings.themeSetAt` to disk so the chosen theme becomes the default on next launch.

---

## 🟢 v2.0.0 (Commit: `bbe70b8`)

### Issue: Insecure Downgrade Attack via Unencrypted JSON
**Description:**
The application automatically falls back to reading plaintext unencrypted JSON if standard decryption fails. If a malicious actor strips the `enc1:` prefix from the payload, they can force the application to load unencrypted data, bypassing OS Keychain protections (Downgrade Attack).

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.0 (Commit: `bbe70b8`). Hardened `decrypt()` and `probe_keychain()` in `crypto.rs` to track OS Keychain key creation state (`is_new_key`). Unencrypted plaintext JSON fallbacks are now strictly blocked when an established key is active. All command loaders now route payloads directly through `state.decrypt()` to enforce command-level downgrade protection.

### Issue: CSV Formula Injection & Falsy Value Data Loss
**Description:**
Task fields containing formula trigger characters (`=`, `+`, `-`, `@`) can cause CSV injection vulnerabilities when opened in Excel. Additionally, a data loss bug exists where numeric `0` and boolean `false` values are converted to empty strings in CSV exports.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.0 (Commit: `bbe70b8`). Created `sanitizeCsvCell()` in `utils.js` to evaluate formula trigger characters against leading-whitespace trimmed values and prepend a single quote (`'`), neutralizing the injection. Switched from `val || ''` to nullish coalescing `val ?? ''` to preserve legitimate `0` and `false` values in exports.

### Issue: Concurrent Save Race Condition
**Description:**
Rapidly typing or firing multiple IPC save commands (`save_sheets`, `save_timers`, `save_settings`) can cause thread collisions during disk persistence.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.0 (Commit: `bbe70b8`). Implemented an async `write_lock: tokio::sync::Mutex<()>` across all backend save command handlers to serialize disk writes and ensure thread-safe persistence.

### Issue: Floating-Point Precision Drift (IEEE 754) on Timers
**Description:**
Stopping timers incrementally adds floating-point artifacts (e.g., `0.30000000000000004` instead of `0.3`), corrupting the hour totals due to `.toFixed(1)` truncation issues in JS.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.0 (Commit: `bbe70b8`). Replaced truncation with `parseFloat((existing + roundedHours).toFixed(3))` and dynamic rounding against `settings.hourIncrement`, eliminating precision drift and accurately supporting 15-minute (`0.25h`) and 6-minute (`0.1h`) intervals.

### Issue: Timer Interval Memory Leaks & Duplicate Cleanups
**Description:**
Deleting a running timer row leaves the `setInterval` handle running in the background, causing memory leaks.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.0 (Commit: `bbe70b8`). Extracted a `clearTimerInterval(timerId)` helper and moved handle deletion above state guards, eliminating duplicate interval cleanup logic and preventing leaks.

### Issue: Daylight Saving Time (DST) Boundary Day-Shift Drift
**Description:**
When a daylight saving time transition occurs, parsing date strings (e.g., `getWeekMonday()`) defaults to midnight, causing hour shifts to push the date into the previous or next day.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.0 (Commit: `bbe70b8`). Forced all date string parsing in `utils.js` to instantiate at fixed noon (`T12:00:00`), completely insulating calculations from timezone and DST boundary drift.

### Issue: Orphaned Temporary Files Filling Disk
**Description:**
Atomic file saves occasionally leave behind `.tmp.*` files if the process is hard-killed before the rename operation completes. Over time, these orphaned files accumulate.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.0 (Commit: `bbe70b8`). Added a background startup cleanup routine in `lib.rs` to automatically purge `.tmp.*` files older than 1 hour upon boot.

### Issue: Quick Log HUD IPC Causes DOM Thrashing
**Description:**
Submitting a task via the Quick Log HUD triggers a full disk read/write (`load_sheets` / `save_sheets`) inside the main window, causing the DOM to thrash, resetting cursor focus and active running timer button highlights.

**Closure Note:**
> **Status: Closed**
> Fixed in v2.0.0 (Commit: `bbe70b8`). Refactored the HUD to function as a zero-I/O event emitter (`hud-entry-added`). The main window intercepts the payload and seamlessly appends it via `addRow()`, preserving focus and running timers without destructive reloads.

---

## 🟢 v1.3.4 (Commit: `f825a91`)

### Issue: Native Windows DWM Shadow Applied to Transparent Overlay
**Description:**
The desktop overlay widget renders a hard black box/shadow behind it because the Windows Desktop Window Manager (DWM) applies native shadows to the transparent webview.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.3.4 (Commit: `f825a91`). Disabled the native window shadow (`"shadow": false`) in `tauri.conf.json` specifically for the overlay window.

### Issue: Overlay Auto-Shrink Sync Failure After Warning Banner
**Description:**
The overlay fails to resume its auto-shrinking behavior after the user hits their required hours and dismisses the main warning banner.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.3.4 (Commit: `f825a91`). Fixed the sizing state synchronization logic so the overlay correctly resumes auto-shrinking after the warning lifecycle concludes.

---

## 🟢 v1.3.3 (Commit: `03a8b68`)

### Issue: Multiple Focus Time Popups (Trigger Deduplication)
**Description:**
When a scheduled focus time hits, the scheduler fires multiple identical popup windows per active window slot.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.3.3 (Commit: `03a8b68`). Corrected the scheduler focus time trigger deduplication logic to ensure only one popup fires per scheduled block.

### Issue: High CPU Usage from Uncapped Warning Checks
**Description:**
The `check-hours-warning` background IPC event fires excessively, causing high CPU usage.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.3.3 (Commit: `03a8b68`). Rate-limited the `check-hours-warning` event to fire a maximum of once per minute.

### Issue: CSV Import Boolean Conversion Bug
**Description:**
When importing CSV files, the "OT" (Overtime) string value of `"No"` evaluates to `true` because non-empty strings are truthy in JavaScript.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.3.3 (Commit: `03a8b68`). Explicitly checked for `"Yes"` and `"No"` strings during CSV import conversion to properly cast boolean values.

---

## 🟢 v1.2.0 (Commit: `7a2c033` / `af102fc`)

### Issue: Weekly Completion Chips Stale Until Restart
**Description:**
The Mon-Fri weekly completion banner chips do not update immediately when users log hours, requiring a restart or disk reload to reflect current totals.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.2.0 (Commit: `7a2c033`). Bound the weekly completion chips to read today's hours live directly from the DOM rather than the static saved sheets object.

---

## 🟢 v1.1.3 (Commit: `e53a6c0`)

### Issue: Warning Timer Does Not Unminimize App
**Description:**
If the application is minimized to the taskbar, the automatic hours warning popup fails to appear on screen.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.1.3 (Commit: `e53a6c0`). Updated the window management logic to automatically unminimize and focus the application when the hours warning triggers.

---

## 🟢 v1.1.1 (Commit: `6c71ada`)

### Issue: Duplicate Background Processes on Multiple Launches
**Description:**
Users can launch multiple instances of ChronoWard simultaneously, causing database locks and duplicate background processes.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.1.1 (Commit: `6c71ada`). Implemented a single-instance lock via `tauri-plugin-single-instance`. Secondary launch attempts are now caught and used to automatically unminimize and focus the primary application window.

---

## 🟢 v1.0.0 (Commit: `a62c20c` / `ef9c4a2`)

### Issue: All Buttons Non-Functional in Production Build
**Description:**
In the production release, none of the buttons, inputs, or toggles work. This is caused by the WebView2 strict Content Security Policy (CSP) blocking inline `onclick`/`onchange`/`oninput`/`onblur` HTML attributes.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.0.0 (Commit: `a62c20c`). Stripped all inline event handlers from `index.html`. Rewrote `addRow()` to use DOM `createElement` and added a centralized `setupStaticListeners()` function to attach event listeners programmatically, bypassing the CSP inline execution blocks.

### Issue: Time Picker Icons Invisible in Dark Mode
**Description:**
The browser-native time picker clock icons (`::-webkit-calendar-picker-indicator`) are black, making them invisible against the dark theme background.

**Closure Note:**
> **Status: Closed**
> Fixed in v1.0.0 (Commit: `a62c20c`). Applied CSS filters to invert the calendar picker indicators in all `.theme-` dark modes, retaining the standard dark variant exclusively for `.theme-light`.
