# ChronoWard — Stage Routing & Pipeline Map (Layer 1)

## Active Stages & Status

| Stage | Directory | Focus Area | Status | Output Deliverable |
| :--- | :--- | :--- | :--- | :--- |
| **01** | `01_requirements_and_tickets/` | Dual 12/12 Ticket Spec & ADHD/ASD UX | ✅ Completed | `output/ticket_tracking_spec.md` |
| **02** | `02_security_and_audit/` | AES-256-GCM, Backup Recovery & Window ACLs | ✅ Completed | `output/security_and_audit_report.md` |
| **03** | `03_core_implementation/` | Rust IPC Commands, Pomodoro Engine & ES6 Store | ✅ Completed | `output/implementation_summary.md` |
| **04** | `04_verification_and_testing/` | Node.js (27/27) & Cargo (27/27) Unit Tests | ✅ Completed | `output/test_verification_report.md` |
| **05** | `05_release_packaging/` | v2.0.5 Release Diff, Branch Sync & Tagging | 🟡 In Progress | `output/version_diff_and_release_plan.md` |
| **06** | `06_code_review/` | Pass 1, Pass 2 & M3 Code Review + Remediation | ✅ Completed | `output/code_review_report.md` |
| **07** | `07_ui_m3_redesign/` | Material Design 3 UI, HCT Color & Pomodoro UX | ✅ Completed | `output/m3_design_system_spec.md` |

---

## Stage Dependency Graph

```text
[01_requirements_and_tickets]
              │
              ▼
   [02_security_and_audit]
              │
              ▼
   [03_core_implementation] ◄───────────┐
              │                         │ (Pass 1 & Pass 2 Rework Resolved)
              ▼                         │
[04_verification_and_testing]           │
              │                         │
              ▼                         │
      [06_code_review] ─────────────────┘
              │
              ▼
     [07_ui_m3_redesign]
              │
              ▼
    [05_release_packaging]
```

---

## Detailed Stage Routing

### When to enter each stage:
- **Stage 01 (`01_requirements_and_tickets`)**: Modify ticket validation rules, HUD quick-capture UX, or neurodivergent focus features.
- **Stage 02 (`02_security_and_audit`)**: Update encryption formats (`enc1:`), `.json.bak` recovery, keychain handling, CSV formula sanitization, window ACLs, or `.cargo/audit.toml` exceptions.
- **Stage 03 (`03_core_implementation`)**: Modify `src/*.js` or `src-tauri/src/**/*.rs` business logic, Pomodoro timer state machine (`src/timers.js`), state synchronization, midnight rollover, or theme rotation offsets.
- **Stage 04 (`04_verification_and_testing`)**: Run or expand `tests/utils.test.js`, `tests/timers.test.js`, `tests/m3-color.test.js`, or Rust `#[cfg(test)]` suites.
- **Stage 05 (`05_release_packaging`)**: Reconcile branches (`main`, `dev`, `UI/Dev`), bump versions across `package.json`, `Cargo.toml`, `tauri.conf.json`, and tag releases.
- **Stage 06 (`06_code_review`)**: Perform end-to-end security, data-integrity, and correctness code reviews across `src/` and `src-tauri/` (conducted directly by Argon).
- **Stage 07 (`07_ui_m3_redesign`)**: Modify the Material Design 3 (M3 / Material You) design tokens, HCT perceptual color engine (`src/m3-color.js`), material surface profiles (`midnight-velvet`, `volcanic-glass`), 10 weekly seed palettes, scheme modes (`dark`/`light`/`auto`), custom seed picker, or M3 component styles (`src/styles.css`).
