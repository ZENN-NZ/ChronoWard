# Security & Dependency Audit Report

## Status: Approved & Enforced (Updated 2026-10-31)

### 1. Cryptographic Safeguards & Persistence Hardening
- **AES-256-GCM Across All Stores:** `sheets.json`, `timers.json`, and `settings.json` are all encrypted at rest using 256-bit AES-GCM with cryptographically secure 96-bit CSPRNG nonces (`enc1:` format).
- **Pre-Probe Keychain-Loss Guard:** `lib.rs` checks `crypto::check_encrypted_data_exists(&data_dir)` prior to probing the OS keychain; if `keyring::Error::NoEntry` occurs while `enc1:` files exist on disk, `ensure_key_exists()` refuses to generate a replacement key and enters read-only emergency mode.
- **Downgrade Defense & First-Run Plaintext Migration:** Verified via backend unit tests (`test_state_decrypt_blocks_plaintext_downgrade_when_key_preexists`, `test_rh4_legacy_plaintext_reencrypted_on_load`). On `is_new_key == true`, legacy plaintext files are automatically encrypted and written via `atomic_write` during load.
- **Atomic Copy-Before-Rename & `.json.bak` Recovery:** `atomic_write` fsyncs `.tmp`, copies the existing target to `.json.bak` before renaming `.tmp` over the target (`test_atomic_write_creates_bak_and_target`), and `load_sheets` / `load_settings` automatically recover from `.json.bak` if the primary file is missing or corrupt (`test_rh3_decrypt_failure_recovers_from_valid_backup`).
- **Scoped Write-Protection & Quarantine:** Ephemeral corruption in `timers.json` or `settings.json` quarantines the bad file to `*.corrupt.<timestamp>` without poisoning `sheets.json` saves (`test_c1_decrypt_failure_blocks_writes`).
- **Memory Key Caching:** Zero OS IPC overhead per keystroke/tick; protected in memory using `secrecy::SecretVec<u8>` and `secrecy::SecretString`.

### 2. Window Command ACLs & CSP Hardening
- **Command-Level Window Label Checks:** `load_sheets`, `save_sheets`, `load_timers`, `save_timers`, `save_settings`, and `export_csv` enforce `window.label() == "main"` in Rust alongside granular per-window capabilities in `src-tauri/capabilities/` (`main.json`, `hud.json`, `overlay.json`).
- **Strict CSP (`script-src 'self'`):** Inline scripts were extracted from `hud.html` and `overlay.html` into `src/hud.js` and `src/overlay.js`, eliminating `'unsafe-inline'` from `script-src` while keeping `connect-src 'none'`.

### 3. Dependency Vulnerability Resolution
- **RUSTSEC-2024-0374 (`event-listener`):** Resolved. Crate pinned to `5.4.2` in `src-tauri/Cargo.lock`.
- **RUSTSEC-2024-0429 (`glib 0.18.5`):** Accepted exception for non-distributed Linux GTK dependency. Documented in `.cargo/audit.toml` with `deny = ["unsound"]`.
- **JavaScript Dependencies:** Pinned exact versions in `package.json` (`@tauri-apps/api: 2.11.1`, `@tauri-apps/plugin-dialog: 2.7.0`, `@tauri-apps/cli: 2.11.4`).
