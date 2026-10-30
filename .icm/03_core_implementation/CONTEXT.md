# Stage 03: Core Implementation

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 3 (Reference) | `../_config/architecture_spec.md` | Tauri v2 multi-window & ES6 module architecture |
| Layer 3 (Reference) | `../_config/data_schema.json` | Sheets, timers, and settings data contracts |
| Layer 4 (Working)   | `../02_security_and_audit/output/security_and_audit_report.md` | Cryptographic integration, `.json.bak` recovery & window ACL specs |

## Process
1. Implement Tauri backend commands in Rust (`sheets`, `timers`, `settings`, `csv`, `window`) with `window.label() == "main"` ACL enforcement and `guard_write!`.
2. Implement thread-safe persistence using `tokio::sync::Mutex<()>` in `AppState`, copy-before-rename `atomic_write`, `.json.bak` automatic recovery, and first-run plaintext re-encryption.
3. Implement modular ES6 frontend architecture (`app.js`, `state.js`, `api.js`, `timers.js`, `utils.js`, `m3-color.js`, `hud.js`, `overlay.js`).
4. Support Pomodoro Focus Mode, visual time ring, M3 HCT dynamic color generation (`src/m3-color.js`), and habituation defense weekly theme rotation (`themeBaseOffset`).
5. Prevent data loss during date switching shortcuts by triggering `document.activeElement.blur()` before date updates, and use `evaluateMidnightRollover()` so viewing historical dates is never reset by the 60s midnight check.
6. Ensure serialized sheet saving (`flushSheetsToDisk`) and deterministic Quick Log HUD acknowledgment handshakes (`hud-entry-saved` / `hud-entry-failed`) with listener cleanup.

## Outputs
- `output/implementation_summary.md`: Summary of core modules, architectural contracts, and IPC surfaces.
- **Review Gate**: Code quality check, modular separation sign-off, IPC payload validation.
