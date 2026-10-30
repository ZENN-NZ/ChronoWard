# ChronoWard — Workspace Context (Layer 0)

## Project Identity
**ChronoWard 2.0** ("The Vault" + Neurodivergent Focus Update + Material Design 3 UI) is a privacy-first, offline-only desktop time-tracking application and "computational prosthesis" designed specifically for neurodivergent minds (ADHD/ASD). It eliminates time-blindness, executive dysfunction, and spreadsheet anxiety while enforcing hardware-backed local encryption.

## Core Stack
- **Desktop Runtime:** Tauri v2 (Rust Backend + OS Native WebView)
- **Backend Language:** Rust 2021 (`aes-gcm`, `keyring`, `tokio`, `serde`, `chrono`, `secrecy`)
- **Frontend UI:** Vanilla HTML5 / CSS3 / Modular ES6 JavaScript (`app.js`, `state.js`, `api.js`, `timers.js`, `utils.js`, `m3-color.js`, `hud.js`, `overlay.js`)
- **Design System:** Google Material Design 3 (M3 / Material You) with perceptual HCT (`Hue, Chroma, Tone`) dynamic color generation
- **Testing:** Node.js native test runner (`node --test` across `tests/utils.test.js`, `tests/timers.test.js`, `tests/m3-color.test.js`) + Cargo test suite (`cargo test`)
- **Security Audit:** `cargo audit` (with `.cargo/audit.toml` policy enforcement)

## Architectural Principles
1. **100% Offline & Zero Telemetry:** Enforced via strict Content Security Policy (`connect-src 'none'`; externalized scripts with no `'unsafe-inline'` in `script-src`). Data never leaves the local machine.
2. **Hardware-Backed Encryption & Atomic Recovery:** `sheets.json`, `timers.json`, and `settings.json` are all encrypted at rest using **AES-256-GCM** (`enc1:` format). Master keys are stored in the OS Keychain (Windows DPAPI, macOS Keychain, Linux Secret Service) and cached in memory via `secrecy::SecretVec<u8>`. All writes use atomic temp-file fsync, copy-before-rename `.json.bak` backup rotation, automatic `.json.bak` recovery, and per-window command ACL validation (`window.label() == "main"`).
3. **Anti-Downgrade & Emergency Read-Only Protection:** Once an encryption key exists in the keychain (`is_new_key == false`), unencrypted plaintext payloads are rejected. Legacy plaintext files on first run (`is_new_key == true`) are automatically re-encrypted on load. Keychain loss or unrecoverable decrypt failure engages write-protected emergency mode (`write_protected`).
4. **Neurodivergent UX Invariants:**
   - **Frictionless Capture (`Ctrl+Shift+Space`):** Global Quick Log HUD operates as a zero-I/O event emitter (`hud-entry-added`) with handshake acknowledgments (`hud-entry-saved` / `hud-entry-failed`) to `app.js`, preventing split-brain file contention.
   - **Dual 12/12 Ticket Tracking:** Enterprise ticket validation supporting up to 12-char prefixes and 12-digit numeric IDs (`parseTicketNum`).
   - **Material Design 3 & Habituation Defense:** Perceptual HCT (`Hue, Chroma, Tone`) dynamic color engine (`src/m3-color.js`) generating 6 tonal palettes and 34 `--md-sys-color-*` semantic roles across 10 weekly auto-rotating themes (`themeBaseOffset`), Dark/Light/Auto scheme modes (`schemeMode`), and custom Material You seed colors (`customSeedEnabled`, `customSeedColor`) with guaranteed WCAG AA contrast ($\ge 4.5:1$).

## ICM Spatial Directory Map
- `WORKSPACE.md` — Global identity & architectural invariants (Layer 0)
- `ROUTING.md` — Pipeline stage map, status, and task routing (Layer 1)
- `_config/` — Shared technical references, schemas, and security specs (Layer 3)
- `01_requirements_and_tickets/` — Dual 12/12 ticket tracking & neurodivergent UX specs
- `02_security_and_audit/` — Keychain crypto, anti-downgrade, CSV sanitization & RustSec policies
- `03_core_implementation/` — Tauri Rust commands & ES6 modular frontend architecture
- `04_verification_and_testing/` — Unit test suites (Frontend Node.js & Backend Rust)
- `05_release_packaging/` — Version alignment (`v2.0.5`), changelog & release readiness
- `06_code_review/` — End-to-end security, correctness, data-integrity & M3 UI code review
- `07_ui_m3_redesign/` — Material Design 3 (M3) UI & HCT perceptual color system redesign
