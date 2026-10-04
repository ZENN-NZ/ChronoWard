# ChronoWard — ICM Workspace Identity (Layer 0)

## Workspace Overview
- **Project Name:** ChronoWard
- **Repository:** `ZENN-NZ/ChronoWard`
- **Application Type:** Cross-platform desktop time tracker
- **Core Purpose:** A local-first, zero-stress, ADHD/ASD/PDA-friendly time-tracking computational prosthesis designed to reduce overwhelm, prevent time blindness, and ensure complete data sovereignty.
- **Current Development Target:** ChronoWard v2.0.5

---

## Architectural Principles & Invariants
1. **100% Local-First & Zero Telemetry:**
   - No external API requests, metrics collection, or cloud sync.
   - Network isolation enforced via strict Webview CSP (`connect-src 'none'`).
2. **Hardware-Backed Encryption at Rest:**
   - Timesheet data (`sheets.json`) and active timers (`timers.json`) encrypted using AES-256-GCM.
   - Master 256-bit encryption key securely generated and stored in OS Keychain (Windows DPAPI, macOS Keychain, Linux Secret Service).
   - In-memory key caching using `secrecy::SecretVec<u8>` to eliminate OS IPC overhead during rapid updates.
3. **Command-Level Downgrade Protection:**
   - Detects pre-existing keys (`is_new_key`); strictly rejects unencrypted plaintext payloads if a valid key already exists.
4. **Thread-Safe Atomic Persistence:**
   - Global asynchronous `write_lock` (`tokio::sync::Mutex<()>`) serializes disk operations across IPC commands.
   - Atomic write-and-rename pipeline via `.tmp` staging files. Leftover `.tmp` files older than 1 hour automatically purged.
5. **Neurodivergent UX Optimization:**
   - Quick Capture HUD (`Ctrl+Shift+Space`) for frictionless task capture.
   - Pomodoro Focus Mode to isolate single active task cards.
   - Visual Time Ring for analog visual passage of time.
   - Weekly theme auto-rotation (7-day habituation defense) with persistent manual offset support.

---

## Technology Stack
| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Desktop Framework** | Tauri | v2.11.5 | Lightweight native application runtime and OS integration |
| **Backend Core** | Rust | 2021 Edition | Secure file I/O, OS Keychain access, AES-256-GCM crypto, global shortcuts |
| **Frontend UI** | Vanilla HTML5 / CSS3 / ES6 | ES2022 | High-performance, dependency-free UI modules (`app.js`, `state.js`, `api.js`, `timers.js`, `utils.js`) |
| **Test Runners** | Node.js Test Runner / Cargo Test | Node 18+ / Rustc | Fast unit testing for utils, CSV sanitization, scheduler, crypto, and state |

---

## ICM Spatial Directory Map
```text
.icm/
├── WORKSPACE.md                     # Layer 0: Root identity, stack invariants, and architecture standards
├── ROUTING.md                       # Layer 1: Stage catalog, dependency graph, and execution roadmap
├── _config/                         # Layer 3: Persistent factory contracts and policies
│   ├── security_policy.md           # Encryption, CSP, anti-downgrade, and Cargo audit policy
│   ├── architecture_spec.md         # Tauri v2 multi-window architecture, IPC API, and store design
│   └── data_schema.json             # JSON schemas for sheets, timers, settings, and tickets
├── 01_requirements_and_tickets/     # Stage 1: ADHD/ASD UX spec & Dual 12/12 ticket tracking system
│   ├── CONTEXT.md
│   └── output/
├── 02_security_and_audit/           # Stage 2: AES-256-GCM crypto, anti-downgrade & dependency security
│   ├── CONTEXT.md
│   └── output/
├── 03_core_implementation/          # Stage 3: Tauri backend, IPC commands, and ES6 modular frontend
│   ├── CONTEXT.md
│   └── output/
├── 04_verification_and_testing/     # Stage 4: Frontend and backend test suites & security verification
│   ├── CONTEXT.md
│   └── output/
├── 05_release_packaging/            # Stage 5: Version alignment (2.0.5), changelog, and release bundles
│   ├── CONTEXT.md
│   └── output/
└── scripts/                         # Deterministic verification and testing automation scripts
```
