# Security & Dependency Audit Report

## Status: Approved & Enforced

### 1. Cryptographic Safeguards
- **AES-256-GCM:** Initialized with cryptographically secure 96-bit nonces.
- **Downgrade Defense:** Verified via backend unit tests (`test_state_decrypt_blocks_plaintext_downgrade_when_key_preexists`).
- **Memory Key Caching:** Zero OS IPC overhead; protected using `secrecy::SecretVec<u8>`.

### 2. Dependency Vulnerability Resolution
- **RUSTSEC-2024-0374 (`event-listener`):** Resolved. Crate pinned to `5.4.2` in `src-tauri/Cargo.lock`.
- **RUSTSEC-2024-0429 (`glib 0.18.5`):** Accepted exception for non-distributed Linux GTK dependency. Documented in `.cargo/audit.toml` with `deny = ["unsound"]`.
- **JavaScript Dependencies:** Pinned exact versions in `package.json` (`@tauri-apps/api: 2.11.1`, `@tauri-apps/plugin-dialog: 2.7.0`, `@tauri-apps/cli: 2.11.4`).
