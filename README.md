<p align="center">
  <img width="140" height="140" alt="ChronoWard Icon" src="https://github.com/user-attachments/assets/29eeee54-4ac1-4472-9f79-7a1cdb2c4c97" />
</p>

# ChronoWard 2.0 ⏱️

> **A friendly, super simple, zero-stress time tracker built for everyday people and neurodivergent brains (ADHD, ASD, & PDA).**  
> Protect your time, stay focused, and track your goals without guilt trips, strict bosses, or complicated setups!

---

## 🤔 Why ChronoWard?

Have you ever downloaded a productivity app, used it for a few days, and then forgot it existed? Or opened a time tracker only to feel overwhelmed by endless lists, red warning marks, and broken streak counters?

**You’re not alone, and your brain isn't broken.**

Most time trackers are built like strict bosses. They demand your constant attention, spam you with loud alerts, and make you feel guilty when you take a break or miss a day.

**ChronoWard is different.** It works *with* your brain, not against it. It keeps time tracking fast, visual, gentle, and stress-free.

---

## ✨ Features You'll Love

### ⚡ 1. Super-Fast Quick Capture HUD (`Ctrl+Shift+Space`)
Logging time shouldn't interrupt your focus. Press **`Ctrl+Shift+Space`** anywhere on your computer to open a lightweight pop-up search bar. Type what you're working on, hit `Enter`, and get back to your flow in less than 2 seconds.

### 🍅 2. Pomodoro Focus Mode (Zero Distractions)
Looking at a long table of 20 tasks can cause instant overwhelm and brain freeze. Click **`🍅 Pomodoro`** mode to hide all background clutter and focus on just one active task card at a time.

### ⭕ 3. Visual Time Ring (See Time Pass)
Clocks and ticking numbers can feel abstract or stressful. ChronoWard features a smooth **Visual Time Ring** around active timers. As time moves forward, the ring gently shrinks so you can visually sense time passing at a glance.

### 📅 4. Date Range Timesheet Explorer
Want to see where your time went over the past week or month? The interactive Date Range Explorer lets you review your work with flexible `From` and `To` date pickers, quick presets (`This Week`, `This Month`), summary stats, and easy day-by-day navigation.

### 📌 5. Desktop Overlay & Smart Sizing
Keep your active timer visible while working in other apps! ChronoWard includes a freestanding desktop overlay widget that stays on screen, supports customizable positions (Top Right, Bottom Left, etc.), and automatically shrinks after 5 seconds of inactivity so it never gets in your way.

### 🎨 6. Weekly Fresh Themes (No Visual Burnout)
Staring at the exact same screen every single day leads to app fatigue. ChronoWard automatically rotates its visual color theme every **7 days**, keeping your workspace feeling fresh, novel, and fun to use.

### 💬 7. Friendly Reminders & Zero Guilt
No loud alarms, scary red failure markers, or broken streak penalties. Missing days are simply framed as **Rest & Recharge** periods. Notifications are calm and encouraging so you stay in control of your day.

---

## 🔒 100% Private, Secure & Local-First

- **Stays on Your Workstation**: Your data never leaves your computer. No user accounts, sign-ups, or cloud servers required.
- **Bank-Grade Encryption**: Protects your log files automatically on disk using AES-256-GCM encryption backed by your computer's native system keychain (Windows DPAPI, macOS Keychain, or Linux libsecret).
- **Command-Level Protection**: Automatically guards against unauthorized data tampering or downgrade attempts.
- **Zero Ads, Telemetry, or Tracking**: Fully functional offline without an internet connection.

---

## ⌨️ Easy Keyboard Shortcuts

| Shortcut | What It Does |
| :--- | :--- |
| `Ctrl+Shift+Space` | Pop open the Quick Capture HUD from anywhere on your computer |
| `Ctrl+N` | Add a new task line |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | Switch between **Sheet View**, **Import View**, and **Settings** |
| `Ctrl+Shift+D` | Toggle Detailed Mode (Ticket # & Notes) |
| `Ctrl+Shift+P` | Toggle Project Mode |
| `Ctrl+S` | Save your timesheet instantly |
| `Ctrl+E` | Export your timesheet to a clean CSV spreadsheet |
| `Alt+Left` / `Alt+Right` | Navigate back or forward a day in your calendar |
| `Alt+T` | Jump back to Today |
| `?` | Show interactive keyboard shortcuts guide |
| `Escape` | Close any open window or pop-up modal |

---

## 💻 How to Run & Build

### System Requirements
- [Node.js](https://nodejs.org/) (v18 or newer)
- [Rust](https://rustup.rs/)

### Development Mode
```bash
npm install
npm run tauri dev
```

### Production Build
```bash
npm run tauri build
```
Generates native desktop installers for Windows (`.exe` / `.msi`), macOS (`.dmg`), and Linux (`.AppImage` / `.deb`).

---

## 📝 License

Free and open-source under the [MIT License](LICENSE).
