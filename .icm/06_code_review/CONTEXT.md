# Stage 06: Code Review

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 3 (Reference) | `../_config/architecture_spec.md` | Intended module boundaries, IPC surface, multi-window layout |
| Layer 3 (Reference) | `../_config/security_policy.md` | Encryption, anti-downgrade, persistence and sanitisation invariants |
| Layer 3 (Reference) | `../_config/data_schema.json` | Declared data contracts for sheets, timers and settings |
| Layer 4 (Working)   | `../02_security_and_audit/output/security_and_audit_report.md` | Claimed security guarantees to verify against code |
| Layer 4 (Working)   | `../03_core_implementation/output/implementation_summary.md` | Claimed implementation surface |
| Source              | `../../src/`, `../../src-tauri/src/`, `../../src-tauri/tauri.conf.json`, `../../src-tauri/capabilities/`, `../../tests/` | Code under review |

## Process
1. Read the Layer 3 invariants and record each as a checkable claim.
2. Review the Rust backend (`crypto.rs`, `state.rs`, `lib.rs`, `scheduler.rs`, `tray.rs`, `commands/*`) for correctness, data-integrity, error handling and security.
3. Review the frontend (`app.js`, `api.js`, `state.js`, `timers.js`, `utils.js`, `index.html`, `hud.html`, `overlay.html`) for correctness, state consistency, XSS sinks, input validation and UX invariants.
4. Review configuration (`tauri.conf.json`, capabilities, `Cargo.toml`, `.cargo/audit.toml`) and tests (`tests/`, Rust `#[cfg(test)]`, `scripts/run_tests.ps1`).
5. Trace end-to-end failure paths (keychain loss, decrypt failure, power loss, midnight rollover) across the IPC boundary rather than reviewing files in isolation.
6. Classify each finding: **Critical** (data loss / security break), **High** (core feature broken), **Medium** (correctness, hardening, UX invariant), **Low** (hygiene, drift, dead code).
7. Every finding must cite file + line range, describe impact, and propose a concrete fix. Do not modify source code in this stage.
8. Run deterministic, side-effect-free checks only (`npm test`). Do NOT run `cargo test` until finding M1 is resolved (it touches the real OS keychain).

## Outputs
- `output/code_review_report.md`: Severity-ranked findings with evidence, impact and recommended fix, plus a prioritised remediation order.
- **Review Gate**: Human triages each finding (accept / defer / reject). Accepted Critical and High findings become Stage 03 rework items and must gain regression tests in Stage 04 before Stage 05 (v2.0.5 release) can be signed off.
