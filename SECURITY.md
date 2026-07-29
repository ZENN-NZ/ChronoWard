# Security Architecture & Data Protection Policy — ChronoWard 2.0

## High-Level Overview

ChronoWard is engineered as a **local-first, fully offline computational prosthesis**. Data sovereignty, zero telemetry, and hardware-backed encryption at rest are fundamental architectural requirements. No data is ever transmitted to remote servers — all records exist strictly on your local workstation.

---

## Security Model & Data Protection

| Storage File | Protection Model | Encryption Control |
| :--- | :--- | :--- |
| `sheets.json` | AES-256-GCM Encrypted | Hardware-backed OS Keychain key (`com.chronoward.app`) |
| `timers.json` | AES-256-GCM Encrypted | Hardware-backed OS Keychain key (`com.chronoward.app`) |
| `settings.json` | Plaintext / Encrypted | Stores local user preferences & visual configurations |

### Encryption Architecture
- **Authenticated Encryption**: AES-256-GCM with cryptographically secure 96-bit random nonces generated per write transaction.
- **Hardware Key Storage**: Master 256-bit keys reside in OS keychains (Windows DPAPI, macOS Keychain, Linux `libsecret` via `keyring v3`) and never touch unencrypted disk storage.
- **Zero-IPC Memory Caching**: Master key is safely cached in application state memory using `secrecy::SecretVec<u8>`, preventing OS IPC overhead during rapid timer ticks and typing.
- **Payload Sentinel & Guard**: Files use an `enc1:` header sentinel; corrupted or invalid sentinels trigger safe rejection and quarantine.
- **Unix Permissions**: On Unix systems, data directories (`~/.local/share/ChronoWard/timesheet-data/`) are restricted to `0700` (owner-only access).

---

## Core Security & Concurrency Controls

### 🔒 1. Command-Level Downgrade Attack Prevention
- **Keychain Initialization Guard**: The Rust backend (`crypto.rs` & `state.rs`) tracks keychain creation state (`is_new_key`).
- **Strict Downgrade Enforcement**: If an established OS Keychain key exists on the system, loading unencrypted plaintext files is strictly blocked across all storage commands (`load_sheets`, `load_timers`, `load_settings`), neutralizing unauthorized downgrade attacks.

### 🛡️ 2. File Concurrency & Atomic Writes
- **Thread-Safe Serialization**: File persistence is governed by an asynchronous write lock (`tokio::sync::Mutex<()>`) in `AppState`, preventing race conditions during simultaneous manual and automatic saves.
- **Atomic Disk Writes**: Save transactions write to temporary `.tmp` files prior to atomic renaming, preventing partial file corruption.
- **Orphaned File Purging**: Automatic startup routines clean up leftover temporary files (`.tmp.*`) older than 1 hour.
- **Corrupt File Quarantine**: Damaged data files are automatically isolated to `<filename>.corrupt.<timestamp>` while preserving safe application recovery.

### 📊 3. CSV Formula Injection Neutralization
- **Export Cell Sanitization**: `sanitizeCsvCell()` inspects export fields for formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) and prepends a single quote `'` to neutralize formula execution in spreadsheet software.
- **Type Preservation**: Uses nullish coalescing logic to preserve legitimate numeric `0` and boolean `false` values without data loss.

### 🪟 4. Process Isolation & Network Isolation Boundary
- **Isolated WebViews**: Main Window (`index.html`), Quick Capture HUD (`hud.html`), and Overlay Widget (`overlay.html`) execute in isolated window capability contexts.
- **Global Shortcuts**: System-wide keybindings (`Ctrl+Shift+Space`) are registered and handled directly in native Rust space via `tauri-plugin-global-shortcut`, avoiding webview key-logging vulnerabilities.
- **Strict Content Security Policy (CSP)**: `connect-src 'none'` enforces hardware-level webview network isolation, preventing any outbound HTTP or WebSocket transmission.

```http
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data:;
connect-src 'none';
frame-src 'none';
object-src 'none'
```

---

## Emergency Protections & Error Resiliency

- **Emergency Read-Only Mode**: If the OS Keychain becomes unreachable on boot while encrypted files exist, ChronoWard defaults to **Emergency Read-Only Mode** to protect data.
- **Mid-Session Protection**: If keychain access fails mid-session, write operations are blocked (`WRITE_BLOCKED_EMERGENCY_MODE`) to prevent unencrypted disk leaks.
- **Mutex Panic Protection**: State locks utilize safe unwrapping handlers (`unwrap_or_else`) to eliminate thread lock poisoning cascades.

---

## Threat Model Summary

| Threat Vector | Mitigation Strategy | Status |
| :--- | :--- | :--- |
| **Local Disk Inspection** | AES-256-GCM hardware key encryption at rest | Protected |
| **Plaintext Downgrade** | Hardware key state checking (`is_new_key`) & command routing | Protected |
| **Formula Injection** | Automatic CSV field sanitization with formula trigger escaping | Protected |
| **Save Race Conditions** | Asynchronous mutex serialization write lock | Protected |
| **Network Data Leaks** | Webview CSP network block (`connect-src 'none'`) | Protected |
| **Interrupted Disk Writes** | Atomic `.tmp` file write-and-rename pipeline | Protected |

---

## Supported Versions

| Version | Status | Security Maintenance |
| :--- | :--- | :--- |
| **2.x (Current)** | ✅ Active | Fully Supported |
| **1.x** | ⚡ Maintenance | Critical Security Patches Only |
| **< 1.3** | ❌ Deprecated | End of Life |

---

## Reporting Vulnerabilities

To report a security vulnerability, please open a report via GitHub [Security Advisories](../../security/advisories/new) or contact the project maintainers directly.

Initial response SLA: **48 hours**.
