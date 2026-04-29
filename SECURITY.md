# Security Policy

## Overview

ChronoWard is a fully offline desktop application. No data is transmitted to any server — all timesheet data lives exclusively on your local machine.

---

## Data Protection

| File | Storage |
|------|---------|
| `sheets.json` | AES-256-GCM encrypted (always) |
| `timers.json` | AES-256-GCM encrypted (always) |
| `settings.json` | Plaintext (no sensitive data) |

**Encryption details:**
- Algorithm: AES-256-GCM with a random 96-bit nonce per write
- Key storage: OS native keychain (Windows DPAPI / macOS Keychain / Linux libsecret)
- Key never touches disk — stored exclusively in the OS keychain under `com.chronoward.app`
- Sentinel prefix `enc1:` identifies encrypted files; unknown sentinels are hard-rejected
- Legacy plaintext files (pre-encryption installs) are transparently re-encrypted on next save

**Data directory permissions:** On Unix systems, the data directory is created with `700` permissions (owner-only).

---

## Emergency / Read-Only Mode

If the OS keychain becomes unavailable at startup and encrypted data exists on disk:
- The app enters **read-only mode** — no writes are permitted
- No fallback decryption is attempted
- No data is silently downgraded to plaintext
- The user is shown an explicit banner and instructed to contact IT

---

## Threat Model

**In scope (mitigated):**
- Local filesystem access by other users/processes — mitigated by AES-256-GCM encryption at rest
- Partial/interrupted writes — mitigated by atomic write (`.tmp` → rename)
- Corrupt data — quarantined to `<filename>.corrupt.<timestamp>`, app continues with empty state
- Key loss — the keychain key survives app reinstalls; data is recoverable as long as the OS keychain entry exists

**Out of scope (by design):**
- Network attacks — the app has no network access (`connect-src 'none'` in CSP)
- Physical access attacks — OS-level disk encryption (BitLocker/FileVault) is recommended
- Keychain compromise — if the OS keychain is compromised, all keychain-protected secrets on that system are at risk regardless of this app

---

## Content Security Policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data:;
connect-src 'none';
frame-src 'none';
object-src 'none'
```

No external resources are loaded. No telemetry. No analytics.

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x (current) | ✅ |
| < 1.x (current) | ❌ |

---

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately via GitHub's [Security Advisories](../../security/advisories/new) feature, or email the maintainer directly if listed in the repository.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

Expected response time: **5 business days**.

---

## Dependencies

Key security-relevant crates:

| Crate | Purpose |
|-------|---------|
| `aes-gcm 0.10` | AES-256-GCM encryption |
| `keyring 3` | OS native keychain access |
| `rand 0.8` | Cryptographically secure key/nonce generation |
| `tauri 2` | Application framework + IPC boundary |

Dependencies should be audited periodically with `cargo audit`.
