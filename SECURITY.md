# Security Policy & Architecture Guide — ChronoWard 2.0

## Overview

ChronoWard is engineered as a **local-first, fully offline computational prosthesis**. Data sovereignty, zero remote telemetry, and hardware-backed encryption at rest are core design requirements. No data is ever transmitted to any external server — all records exist exclusively on your local workstation.

---

## Security Model & Data Protection

| File | Storage Model | Security Control |
| :--- | :--- | :--- |
| `sheets.json` | AES-256-GCM Encrypted | Hardware-backed OS Keychain key (`com.chronoward.app`) |
| `timers.json` | AES-256-GCM Encrypted | Hardware-backed OS Keychain key (`com.chronoward.app`) |
| `settings.json` | Plaintext / Encrypted | Stores local user preferences & visual configurations |

### Encryption Architecture
- **Algorithm**: AES-256-GCM with a cryptographically secure random 96-bit nonce generated per write (`rand 0.8`).
- **Key Storage**: OS Native Keychains (Windows DPAPI, macOS Keychain, Linux `libsecret` via `keyring v3`).
- **Key Isolation**: Master 256-bit encryption keys never touch local disk files. They reside strictly in the OS keychain.
- **Sentinel Guard**: `enc1:` prefix identifies encrypted file payloads; unrecognized or malformed sentinels are hard-rejected.
- **Data Directory Access**: On Unix platforms, the data directory (`~/.local/share/ChronoWard/timesheet-data/`) is locked with `0700` permissions (owner-only access).
- **Atomic Disk Writes**: All saves write to a temporary file (`.tmp`) before atomic rename, preventing partial file corruption.

---

## Executive & Enterprise Safety Features (v2.0.0 Updates)

### 🔒 1. Emergency Read-Only Mode & Lock-Poisoning Prevention
- **Keychain Unavailability**: If the OS Keychain is unreachable on boot and encrypted files exist, ChronoWard automatically enters **Emergency Read-Only Mode**.
- **Mid-Session Guardrail**: If Keychain connectivity fails during active usage, `save_sheets` blocks raw plaintext writes to prevent accidental data exposure on disk (`WRITE_BLOCKED_EMERGENCY_MODE`).
- **Mutex Lock Resilience**: Backend state Mutexes utilize `unwrap_or_else(|e| e.into_inner())` to prevent thread-lock poisoning cascades.

### 🪟 2. Window & IPC Isolation Boundary
- **Multi-Window Isolation**: The Main Window (`index.html`), Quick Capture HUD (`hud.html`), and Desktop Overlay (`overlay.html`) run in isolated WebView contexts.
- **Native Shortcut Processing**: System-wide global shortcuts (`Ctrl+Shift+Space`) are registered and handled directly in Rust backend space via `tauri-plugin-global-shortcut`, avoiding webview key-logging risks.

---

## Content Security Policy (CSP)

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

> **Network Isolation**: `connect-src 'none'` guarantees at the webview level that zero outbound HTTP/WebSocket requests can be initiated.

---

## Threat Model & Security Boundaries

### In Scope (Mitigated)
- **Local Filesystem Access**: Mitigated by AES-256-GCM encryption at rest.
- **Interrupted / Partial Saves**: Mitigated by atomic write-and-rename mechanics.
- **Corrupt File Data**: Corrupt files are automatically quarantined to `<filename>.corrupt.<timestamp>`, and empty state recovers safely.
- **CLI Password Leakage**: Mitigated by automated secret redaction in shell hooks.

### Out of Scope (By Design)
- **Network Attacks**: Non-existent attack surface (`connect-src 'none'`).
- **Physical Device Theft**: OS-level full disk encryption (BitLocker / FileVault / LUKS) is recommended.
- **OS Keychain Compromise**: If the host OS keychain is compromised, all applications storing credentials on that system are compromised.

---

## Supported Versions

| Version | Status | Security Updates |
| :--- | :--- | :--- |
| **2.x (Current)** | ✅ Active | Fully Supported |
| **1.x** | ⚡ Maintenance | Security Patches Only |
| **< 1.3** | ❌ Deprecated | EOL |

---

## Reporting Vulnerabilities

To report a security vulnerability, please submit a report via GitHub's [Security Advisories](../../security/advisories/new) feature or contact the maintainer directly.

Expected initial response time: **48 hours**.
