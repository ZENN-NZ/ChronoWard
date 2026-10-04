# Architecture Specification — ChronoWard (Layer 3)

## 1. System Overview
ChronoWard utilizes a hybrid desktop architecture combining **Tauri v2** with a native **Rust backend** and a lightweight, dependency-free **Vanilla ES6 frontend**.

```text
┌─────────────────────────────────────────────────────────────┐
│                       Frontend UI                           │
│  ┌───────────────┐     ┌───────────────┐   ┌─────────────┐  │
│  │  Main Window  │     │ Quick Log HUD │   │   Overlay   │  │
│  │ (index.html)  │     │  (hud.html)   │   │(overlay.html│  │
│  └───────┬───────┘     └───────┬───────┘   └──────┬──────┘  │
│          │                     │                  │         │
│          └───────────────┬─────┴──────────────────┘         │
│                          ▼                                  │
│                 ES6 Modular Core                            │
│           (api.js, state.js, utils.js, timers.js)           │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC invoke() / listen()
┌──────────────────────────▼──────────────────────────────────┐
│                      Tauri v2 Core                          │
│         Capability Boundary & Event Broadcast               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      Rust Backend                           │
│  ┌───────────────────┐  ┌─────────────────┐ ┌─────────────┐ │
│  │  Command Handlers │  │ Crypto Engine   │ │ OS Keychain │ │
│  │  (sheets, timers, │  │ (AES-256-GCM,   │ │ (DPAPI/Key- │ │
│  │   settings, csv)  │  │  Atomic I/O)    │ │  ring v3)   │ │
│  └───────────────────┘  └─────────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Window Layout & Responsibilities
1. **Main Window (`src/index.html`):**
   - Main view for daily sheets, weekly summaries, pomodoro focus view, range explorer, and settings.
   - Capability: `src-tauri/capabilities/main.json`.
2. **Quick Capture HUD (`src/hud.html`):**
   - Lightweight pop-up window triggered globally via `Ctrl+Shift+Space`.
   - Captures task descriptions, optional ticket identifiers, categories, and duration.
   - Capability: `src-tauri/capabilities/hud.json`.
3. **Desktop Overlay (`src/overlay.html`):**
   - Compact, always-on-top desktop widget showing the active timer.
   - Auto-minimizes after 5 seconds of inactivity.
   - Capability: `src-tauri/capabilities/overlay.json`.

---

## 3. Frontend ES6 Modular Architecture
- `src/app.js`: Application lifecycle, DOM event orchestration, rendering routines, weekly completion bars.
- `src/state.js`: Reactive `EventTarget`-backed state store (`store.sheets`, `store.timers`, `store.settings`). Dispatches `sheets-changed`, `timers-changed`, `settings-changed`.
- `src/api.js`: Centralized Tauri IPC wrapper (`invokeApi`), event listeners, and inter-window event dispatchers.
- `src/timers.js`: Interval management, tick handlers, Pomodoro state, visual time ring calculation.
- `src/utils.js`: Pure functions: `sanitizeCsvCell()`, `escHtml()`, `parseTicketNum()`, date math (`getWeekMonday()`, `dayAbbr()`).

---

## 4. Backend Rust Modules
- `src-tauri/src/lib.rs`: Tauri builder, plugin registrations (`autostart`, `dialog`, `global-shortcut`, `single-instance`), window event handlers.
- `src-tauri/src/state.rs`: `AppState` container holding master encryption key, paths, and async write lock.
- `src-tauri/src/crypto.rs`: AES-256-GCM encryption/decryption, hardware keychain probe, quarantine logic.
- `src-tauri/src/commands/`:
  - `sheets.rs`: `load_sheets`, `save_sheets`
  - `timers.rs`: `load_timers`, `save_timers`
  - `settings.rs`: `load_settings`, `save_settings`
  - `csv.rs`: `export_csv_dialog`
  - `window.rs`: `show_hud_window`, `hide_hud_window`, `set_overlay_position`
