# ChronoWard — Pipeline Routing Catalog (Layer 1)

## Stage Catalog & Status Overview

| Stage | Name | Stage Objective | Status | Review Gate |
| :--- | :--- | :--- | :--- | :--- |
| **01** | `01_requirements_and_tickets` | Define neurodivergent UX requirements and Dual 12/12 enterprise ticket specs | ✅ Completed | UX & ticket schema sign-off |
| **02** | `02_security_and_audit` | Establish AES-256-GCM crypto, anti-downgrade controls, and Cargo audit policy | ✅ Completed | Threat model & audit sign-off |
| **03** | `03_core_implementation` | Tauri v2 multi-window backend and ES6 modular reactive frontend | ✅ Completed | Code & IPC interface sign-off |
| **04** | `04_verification_and_testing` | Unit tests for frontend utils, tickets, backend crypto, state, and scheduler | ✅ Verified | 100% test suite pass rate |
| **05** | `05_release_packaging` | Align version numbers (v2.0.5), sync changelog, and prepare release artifact | 🟡 In Progress | Version & dependency review |
| **06** | `06_code_review` | Cross-layer code review of backend, frontend, config and tests | 🟠 Awaiting Triage | Finding triage; Critical/High block Stage 05 |

---

## Stage Dependency & Execution Flow

```text
[01_requirements_and_tickets]
          │
          ▼
[02_security_and_audit]
          │
          ▼
[03_core_implementation]
          │
          ▼
[04_verification_and_testing]
          │
          ▼
[05_release_packaging] ──► Release Tag: v2.0.5
```

---

## Detailed Stage Routing

### Stage 01: Requirements and Ticket Specification
- **Path:** `01_requirements_and_tickets/`
- **Primary Input:** Project mission, neurodivergent accessibility needs, enterprise ticket requirements.
- **Deliverables:** `output/ticket_tracking_spec.md`, `output/ux_invariants.md`.
- **Handoff:** Consumed by Stage 02 and Stage 03 to govern validation rules and UI layout.

### Stage 02: Security and Audit Policy
- **Path:** `02_security_and_audit/`
- **Primary Input:** Threat model, OS Keychain API constraints, RustSec advisory database (`RUSTSEC-2024-0374`, `RUSTSEC-2024-0429`).
- **Deliverables:** `output/security_baseline.md`, `output/audit_remediation_plan.md`.
- **Handoff:** Consumed by Stage 03 and Stage 04 to enforce encryption, CSP, and audit rules.

### Stage 03: Core Implementation
- **Path:** `03_core_implementation/`
- **Primary Input:** Stage 01 UX/ticket specs and Stage 02 security baseline.
- **Deliverables:** `output/architecture_summary.md`, `output/ipc_command_catalog.md`.
- **Handoff:** Consumed by Stage 04 for automated verification and coverage tests.

### Stage 04: Verification and Testing
- **Path:** `04_verification_and_testing/`
- **Primary Input:** Implementation code, security constraints, and ticket parsing rules.
- **Deliverables:** `output/test_results_summary.md`, `output/coverage_report.md`.
- **Handoff:** Unlocks Stage 05 upon green status across all test suites.

### Stage 05: Release Packaging
- **Path:** `05_release_packaging/`
- **Primary Input:** Clean test run, updated CHANGELOG, and pinned dependencies across manifests.
- **Deliverables:** `output/release_manifest_v2.0.5.md`, `output/version_diff_analysis.md`.
- **Handoff:** Human sign-off triggers tag creation (`git tag v2.0.5`) and binary compilation.

### Stage 06: Code Review
- **Path:** `06_code_review/`
- **Primary Input:** Layer 3 config (architecture, security policy, data schema), Stage 02/03 outputs, and the full source tree.
- **Deliverables:** `output/code_review_report.md`.
- **Handoff:** Accepted Critical/High findings go back to Stage 03 as rework, with regression tests in Stage 04. They block Stage 05 sign-off.
