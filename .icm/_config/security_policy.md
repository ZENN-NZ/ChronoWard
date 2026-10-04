# Security Policy & Cryptographic Standard — ChronoWard (Layer 3)

## 1. Threat Model & Guarantees
ChronoWard is an offline, local-first computational prosthesis. Data sovereignty is an absolute invariant.
- **Zero Remote Telemetry:** The app makes zero external network connections. Enforced by CSP: `connect-src 'none'`.
- **Local Disk Protection:** Sensitive user timesheet records and active timers must be encrypted at rest using AES-256-GCM.
- **Hardware-Backed Keying:** The 256-bit AES master key is generated via OS-native CSPRNG and stored exclusively in the OS Keychain:
  - Windows: DPAPI / Credential Manager (`keyring` crate)
  - macOS: Keychain Services
  - Linux: Secret Service API (`libsecret`)
- **Key In-Memory Caching:** To avoid high-latency OS IPC calls on every timer tick or keystroke, the master key is cached in `AppState` using `secrecy::SecretVec<u8>`.

---

## 2. Command-Level Downgrade Protection
- **Vulnerability Addressed:** Malicious or accidental removal of the `enc1:` header from stored files causing fallback to unencrypted plaintext parsing.
- **Enforcement Rule:**
  - On application startup, `crypto::probe_keychain()` inspects the keychain state and sets `is_new_key: bool`.
  - When loading data (`load_sheets`, `load_timers`, `load_settings`), if `is_new_key == false` (meaning a previously established hardware key exists), any unencrypted plaintext payload is **strictly rejected**.
  - Emergency Read-Only Mode is engaged if decryption fails, preventing data corruption or plaintext overwriting.

---

## 3. Concurrency & Persistence Protection
- **Thread Serialization:** All write operations (`save_sheets`, `save_timers`, `save_settings`) acquire an asynchronous mutex lock: `write_lock: tokio::sync::Mutex<()>`.
- **Atomic File Replacement:** Files are staged to `<filename>.tmp.<random>` and atomically renamed to destination. Leftover temporary files older than 1 hour are purged on application launch.
- **Corrupt File Quarantine:** Files failing decryption or JSON parsing are isolated to `<filename>.corrupt.<timestamp>` to allow forensic recovery without locking the user out.

---

## 4. Input Sanitization & Formula Injection
- **CSV Sanitization:** When exporting timesheet records to CSV via `export_csv_dialog`, `sanitizeCsvCell()` in `src/utils.js` inspects leading-whitespace-trimmed values.
- If a value begins with formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`), it is prepended with a single quote (`'`).
- Numeric `0` and boolean `false` values must be preserved using nullish coalescing (`val ?? ''`).
- Single quotes and HTML entities rendered to DOM must be escaped using `escHtml()` to prevent XSS.

---

## 5. Dependency Audit & Security Exceptions
- **Policy:** `cargo audit` must be executed with `--deny unsound`.
- **Accepted Advisory Exception:** `RUSTSEC-2024-0429` (glib 0.18.5 via Tauri GTK on Linux).
  - Scope: Linux-only Tauri GTK dependency. ChronoWard is currently distributed for Windows.
  - Review Trigger: Re-evaluated prior to any Linux binary distribution or when upstream Tauri publishes updated GTK crates.
  - Documented in: `.cargo/audit.toml` and `SECURITY.md`.
