<p align="center">
<img width="256" height="256" alt="128x128@2x" src="https://github.com/user-attachments/assets/70af6d13-fd3f-4a6d-87cc-5e59112dfcb8" />
</p>

# ChronoWard — Protect your time, meet your goals

> A secure, fully offline timesheet application — minimal, sleek, and built for neurodivergent workflows.

Refactored and built with **Tauri v2** + **Rust** backend. All data is encrypted at rest using AES-256-GCM with keys stored in the OS keychain (Windows DPAPI / macOS Keychain / Linux libsecret).

---

## ✨ Features

### Core

- **10 Themes** — Midnight, Obsidian, Aurora, Ember, Forest, Rose, Steel, Void, Neon, Light
- **Timesheet columns** — Task | Hours | OT (Overtime toggle)
- **Detailed Mode** — adds Ticket # and Description columns per row
- **Project Mode** — per-row digital timers with pause/resume, auto-converts to half-hours on stop
- **Date-aware** — each date has its own saved sheet, navigable via date picker

### Productivity

- **Focus reminders** — app surfaces to foreground at configurable times (default: 11:00, 14:00, 16:00)
- **Hours warning** — after a configurable time (default: 16:30), shows a banner and stays on top until minimum hours are met
- **Idle detection** — auto-minimizes to tray after 1 min of inactivity
- **Keyboard shortcut** — `Ctrl+N` adds a new row; `Escape` closes modals
- **Auto-start** — app starts automatically on boot

### Data

- **Export CSV** — saves `timesheet_YYYY-MM-DD.csv`; dynamic columns (Ticket #, Description included only when data present)
- **Import CSV** — multi-file picker, renders imported rows with Copy and View Description buttons
- **Row actions** — select-all checkbox, bulk delete, per-row duplicate/delete via `⋮` context menu

### Security

- **AES-256-GCM encryption** at rest for `sheets.json` and `timers.json`
- **OS keychain** for key storage — survives app reinstalls
- **Emergency read-only mode** — if keychain is unavailable and encrypted data exists, the app enters read-only mode rather than losing or exposing data
- **Atomic writes** — all saves use write-to-temp → rename to prevent half-written files
- **Corrupt data quarantine** — if a data file can't be parsed, it's moved to `*.corrupt.<timestamp>` and the app recovers cleanly

### System Tray

- Closing the window minimizes to tray (never quits)
- Tray overlay: a floating icon in the top-right corner of the screen when minimized
- Left-click tray icon or overlay to restore
- Tray menu: **Open ChronoWard** / **Quit**

---

## 🚀 Setup

### Prerequisites

| Requirement                                                       | Version           |
| ----------------------------------------------------------------- | ----------------- |
| [Node.js](https://nodejs.org/)                                    | v18+              |
| [Rust](https://rustup.rs/)                                        | stable            |
| [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) | platform-specific |

> **Windows**: requires WebView2 (included in Windows 11; installer bootstraps it on Windows 10)  
> **macOS**: requires Xcode Command Line Tools  
> **Linux**: requires `webkit2gtk`, `libayatana-appindicator` or `libappindicator`, and `libsecret`. For the **Open on Startup** feature to function on Linux, your Desktop Environment or Window Manager must implement the XDG Autostart specification (e.g., GNOME, KDE Plasma, XFCE). The application creates a `.desktop` file in `~/.config/autostart/`.

### Install & Dev

```bash
npm install
npm run tauri dev
```

### Build Distributable

```bash
npm run tauri build
```

Outputs are placed in `src-tauri/target/release/bundle/`:


### Additional Icon Generation
```bash
npm run tauri icon src-tauri/icons/icon.png
```

| Platform | Format                         |
| -------- | ------------------------------ |
| Windows  | `.msi` / NSIS `.exe` installer |
| macOS    | `.dmg` / `.app`                |
| Linux    | `.AppImage` / `.deb`           |

---

## 📁 Project Structure

```
ChronoWard/
├── src/                        # Frontend (HTML/CSS/JS — no bundler)
│   ├── fonts/
│   │   ├── DMMono-Medium.woff2
│   │   ├── DMMono-Regular.woff2
│   │   └── Syne-Variable.woff2
│   ├── app.js                  # All renderer logic
│   ├── favicon.ico
│   ├── icon.png
│   ├── index.html              # Main window
│   ├── overlay.html            # Tray overlay window
│   └── styles.css              # All themes + component styles
├── src-tauri/
│   ├── icons/                  # App icons (all sizes)
│   ├── nsis/                   # Windows installer assets
│   ├── src/
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── csv.rs          # export_csv, import_csv, get_data_dir
│   │   │   ├── settings.rs     # load_settings, save_settings
│   │   │   ├── sheets.rs       # load_sheets, save_sheets
│   │   │   ├── timers.rs       # load_timers, save_timers
│   │   │   └── window.rs       # show_window, minimize_to_tray, overlay
│   │   ├── crypto.rs           # AES-256-GCM + OS keychain
│   │   ├── lib.rs              # App entry, Tauri setup
│   │   ├── main.rs             # Binary entry point
│   │   ├── scheduler.rs        # Focus time + hours warning background task
│   │   ├── state.rs            # AppState, Settings schema
│   │   └── tray.rs             # System tray setup
│   ├── build.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── README.md
```

---

## ⚙️ Settings

All configurable from the **Settings** tab in the app:

| Setting               | Default  | Description                                 |
| --------------------- | -------- | ------------------------------------------- |
| Theme                 | Midnight | Visual colour theme                         |
| Hour Increment        | 0.5h     | Step size for ± stepper buttons             |
| Minimum Hours Warning | 7.5h     | Hours threshold for end-of-day banner       |
| Warning Trigger Time  | 16:30    | Time after which the hours banner activates |
| Focus Time 1          | 11:00    | App surfaces to foreground                  |
| Focus Time 2          | 14:00    | App surfaces to foreground                  |
| Focus Time 3          | 16:00    | App surfaces to foreground                  |
| Project Mode          | Off      | Enables per-row timers                      |
| Detailed Mode         | Off      | Adds Ticket # and Description columns       |
| Open on Startup       | On       | Starts ChronoWard automatically on boot     |

---

## 🔒 Security Model

| Layer                | Implementation                                              |
| -------------------- | ----------------------------------------------------------- |
| Encryption           | AES-256-GCM, random 96-bit nonce per write                  |
| Key storage          | OS keychain (`com.chronoward.app` / `chronoward-data-key`)  |
| Key format           | 256-bit random, hex-encoded in keychain                     |
| Sentinel             | `enc1:` prefix on all encrypted files                       |
| Legacy migration     | Plaintext files detected on load, re-encrypted on next save |
| Emergency mode       | Read-only if keychain unavailable + encrypted data exists   |
| Write safety         | Atomic write (`.tmp` → rename)                              |
| Data dir permissions | `chmod 700` on Unix                                         |

`settings.json` is stored in plaintext by default (no sensitive data) and encrypted after the first save cycle if a keychain key exists.

---

## 📝 Data Storage

| OS      | Path                                                       |
| ------- | ---------------------------------------------------------- |
| Windows | `%APPDATA%\ChronoWard\timesheet-data\`                     |
| macOS   | `~/Library/Application Support/ChronoWard/timesheet-data/` |
| Linux   | `~/.local/share/ChronoWard/timesheet-data/`                |

Files:

| File            | Contents                                  |
| --------------- | ----------------------------------------- |
| `sheets.json`   | All timesheet rows, keyed by `YYYY-MM-DD` |
| `timers.json`   | Timer states (persist across sessions)    |
| `settings.json` | User preferences                          |

---

## 🎨 Themes

| Theme    | Style                         |
| -------- | ----------------------------- |
| Midnight | Deep navy, violet accent      |
| Obsidian | Near-black, blue accent       |
| Aurora   | Dark ocean, cyan accent       |
| Ember    | Warm dark, orange accent      |
| Forest   | Dark green, mint accent       |
| Rose     | Dark plum, pink accent        |
| Steel    | Cool dark grey, slate accent  |
| Void     | Pure black, white accent      |
| Neon     | Ultra dark, green neon accent |
| Light    | Clean white, indigo accent    |

---

## 🧠 Neurodivergent Features

- **Scheduled focus** — app pops up at key times to prompt logging
- **Inactivity detection** — auto-minimizes after 1 min idle
- **End-of-day enforcer** — stays on top until minimum hours are logged
- **Timer support** — start/pause/stop per task, auto-rounds to nearest 0.5h
- **Tray persistence** — never fully lost, always one click away
- **Keyboard shortcut** — `Ctrl+N` for instant row creation

---

## 📄 License

MIT — © 2025 Jeremiah Benjamin
