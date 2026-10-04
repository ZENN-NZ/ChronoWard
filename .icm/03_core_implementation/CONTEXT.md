# Stage 03: Core Implementation

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 3 (Reference) | `../_config/architecture_spec.md` | Tauri v2 multi-window & ES6 module architecture |
| Layer 4 (Working)   | `../02_security_and_audit/output/security_and_audit_report.md` | Cryptographic integration & thread safety specifications |

## Process
1. Implement Tauri backend commands in Rust (`sheets`, `timers`, `settings`, `csv`, `window`).
2. Implement thread-safe persistence using `tokio::sync::Mutex<()>` in `AppState`.
3. Implement modular ES6 frontend architecture (`app.js`, `state.js`, `api.js`, `timers.js`, `utils.js`).
4. Support Pomodoro Focus Mode, visual time ring, and habituation defense weekly theme rotation.
5. Prevent data loss during date switching shortcuts by triggering `document.activeElement.blur()` before date updates.
6. Support persistent manual theme overrides in rotation queue using `themeBaseOffset`.

## Outputs
- `output/implementation_summary.md`: Summary of core modules, architectural contracts, and IPC surfaces.
- **Review Gate**: Code quality check, modular separation sign-off, IPC payload validation.
