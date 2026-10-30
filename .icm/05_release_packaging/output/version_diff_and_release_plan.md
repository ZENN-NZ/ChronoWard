# Version Differences & Release Plan (v2.0.4 ➔ v2.0.5 + M3 Redesign)

## 1. Branch & Version State Summary (Updated 2026-10-31)

| Dimension | `origin/main` | `dev` (`2026-10-27`) | `UI/Dev` (`2026-10-31`) |
| :--- | :--- | :--- | :--- |
| **Git Commit** | `7bcd5ef` | `296668e` (Pass 1 & 2 fixes) | `6f8cabb` (`dev` merged) + M3 UI Redesign |
| **Git Tag** | `v2.0.4` (at `1e427bb`) | Pending `v2.0.5` | Pending `v2.0.5` / `v2.1.0` |
| **`package.json`** | `2.0.5` | `2.0.5` | `2.0.5` |
| **`package-lock.json`** | `2.0.5` | `2.0.5` | `2.0.5` |
| **`src-tauri/Cargo.toml`** | `2.0.5` | `2.0.5` | `2.0.5` |
| **`src-tauri/Cargo.lock`** | `2.0.5` | `2.0.5` | `2.0.5` |
| **`src-tauri/tauri.conf.json`**| `2.0.5` | `2.0.5` | `2.0.5` |
| **`CHANGELOG.md`** | Includes `[2.0.5]` | Includes `[2.0.5]` | Includes `[2.0.5]` |
| **`.cargo/audit.toml`** | Exists (`RUSTSEC-2024-0429`) | Exists (`RUSTSEC-2024-0429`) | Exists (`RUSTSEC-2024-0429`) |
| **Design System** | Legacy Custom Dark UI | Legacy Custom Dark UI | **Material Design 3 + HCT Dynamic Color** |

---

## 2. Key Changes Accumulated (`2026-10-26` – `2026-10-31`)

1. **Dependency Pinning & RustSec Resolution (`v2.0.5` Base):**
   - Pinned all NPM `@tauri-apps/*` packages (`api: 2.11.1`, `plugin-dialog: 2.7.0`, `cli: 2.11.4`) and Cargo crates (`=` exact versions).
   - Upgraded `event-listener` from `5.4.1` to `5.4.2` (`RUSTSEC-2024-0374`) and documented Linux-only `RUSTSEC-2024-0429` exception in `.cargo/audit.toml` and `SECURITY.md`.
2. **Stage 06 Pass 1 & Pass 2 Security & Reliability Remediations (`dev` at `296668e`):**
   - Encrypted `settings.json` at rest (`enc1:`), added copy-before-rename `atomic_write`, `.json.bak` automatic recovery, and first-run legacy plaintext re-encryption across `sheets.rs`, `settings.rs`, and `timers.rs`.
   - Enforced `window.label() == "main"` ACL checks on privileged IPC commands and extracted inline scripts into `src/hud.js` and `src/overlay.js` for strict CSP (`script-src 'self'`).
   - Added `evaluateMidnightRollover()` in `src/utils.js` (fixing the 60s historical-date reset regression), serialized sheet saving (`flushSheetsToDisk`), and deterministic HUD ack handshakes.
3. **Stage 07 Material Design 3 (M3 / Material You) Full Redesign (`UI/Dev`):**
   - Implemented `src/m3-color.js` (perceptual HCT color space, 6 tonal palettes, 34 `--md-sys-color-*` tokens + 16 legacy aliases, WCAG AA contrast verification, monochrome OLED `void`, and 10 weekly seed palettes).
   - Rewrote `src/styles.css` and upgraded `src/index.html`, `src/app.js`, `src/hud.html`, `src/hud.js`, `src/overlay.html`, and `src-tauri/src/state.rs` with M3 components, scheme modes (`dark`/`light`/`auto`), and custom seed color picker.

---

## 3. Release Execution Steps
1. Commit the Material Design 3 redesign and updated `.icm/` documentation to `UI/Dev`.
2. Merge `UI/Dev` into `dev` (and `main` once approved).
3. Tag the release commit (`git tag v2.0.5` or `v2.1.0`) and push to `origin`.
4. Trigger Tauri production build (`npm run tauri build`).
