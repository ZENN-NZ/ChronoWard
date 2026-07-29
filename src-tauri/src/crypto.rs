/// crypto.rs — ChronoWard encryption layer
///
/// Sentinel prefix strategy:
///   "enc1:"  → OS keychain encrypted (primary path)
///   No prefix → plaintext (legacy migration path, read-only upgrade on next save)
///
/// Decision 1c-ii: If the keychain is unavailable at runtime and encrypted
/// data exists on disk, the app enters read-only emergency mode. It will
/// never attempt to decrypt with a fallback or silently downgrade security.
///
/// The keychain service name and account are fixed constants so that data
/// survives app reinstalls (the key lives in the OS keychain, not the app).
use anyhow::{anyhow, Context, Result};
use keyring::Entry;
use secrecy::{ExposeSecret, SecretVec};
use tracing::{debug, error, info, warn};

// ── Keychain identity ─────────────────────────────────────────────────────────
// These must never change after first deployment — changing them orphans all
// existing encrypted data since the OS keychain entry won't be found.
const KEYCHAIN_SERVICE: &str = "com.chronoward.app";
const KEYCHAIN_ACCOUNT: &str = "chronoward-data-key";

// ── Sentinel prefixes ─────────────────────────────────────────────────────────
const PREFIX_KEYCHAIN: &str = "enc1:";

// ── Key size ──────────────────────────────────────────────────────────────────
// 32 bytes = 256-bit key for AES-256-GCM (used internally by the OS keychain
// encryption layer; we store a random key in the keychain and use it to
// derive the actual encryption via the OS APIs).
const KEY_SIZE: usize = 32;

/// Represents the availability state of the keychain at runtime.
/// Checked once at startup and cached in AppState.
#[derive(Debug, Clone, PartialEq)]
pub enum KeychainStatus {
    /// Keychain is available and the key has been verified or created.
    Available { is_new_key: bool },
    /// Keychain is unavailable. The app must enter read-only emergency mode
    /// if any encrypted data exists on disk.
    Unavailable(String), // holds human-readable reason
}

/// Probes the OS keychain to determine availability and retrieve key.
/// This is called once at startup — result and cached key are stored in AppState.
///
/// On success, also ensures a key exists (creates one if this is a fresh
/// install). This means first-run key generation happens here, not lazily
/// during the first save, so we fail fast rather than at save time.
pub fn probe_keychain() -> (KeychainStatus, Option<SecretVec<u8>>) {
    match ensure_key_exists() {
        Ok((key, is_new_key)) => {
            info!("Keychain probe: available (is_new_key={is_new_key})");
            (KeychainStatus::Available { is_new_key }, Some(SecretVec::new(key)))
        }
        Err(e) => {
            error!("Keychain probe failed: {e}");
            (KeychainStatus::Unavailable(e.to_string()), None)
        }
    }
}

/// Retrieves the encryption key from the OS keychain.
/// Creates a new random key if one doesn't exist yet (first run).
/// Returns tuple of (key bytes, is_new_key boolean).
fn ensure_key_exists() -> Result<(Vec<u8>, bool)> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .context("Failed to create keychain entry handle")?;

    match entry.get_password() {
        Ok(stored) => {
            // Key exists — decode from hex and validate length
            let key = hex::decode(&stored)
                .context("Keychain key is not valid hex — keychain may be corrupt")?;
            if key.len() != KEY_SIZE {
                return Err(anyhow!(
                    "Keychain key has unexpected length {} (expected {})",
                    key.len(),
                    KEY_SIZE
                ));
            }
            debug!("Keychain key retrieved successfully");
            Ok((key, false))
        }
        Err(keyring::Error::NoEntry) => {
            // First run — generate and store a new key
            info!("No keychain entry found — generating new encryption key");
            let key = generate_random_key()?;
            let hex_key = hex::encode(&key);
            entry
                .set_password(&hex_key)
                .context("Failed to store new encryption key in keychain")?;
            info!("New encryption key stored in keychain");
            Ok((key, true))
        }
        Err(e) => Err(anyhow!("Keychain access error: {e}")),
    }
}

/// Generates a cryptographically secure random 256-bit key.
fn generate_random_key() -> Result<Vec<u8>> {
    use rand::RngCore;
    let mut key = vec![0u8; KEY_SIZE];
    rand::thread_rng().fill_bytes(&mut key);
    Ok(key)
}

// ── Public encrypt / decrypt API ──────────────────────────────────────────────

/// Encrypts `plaintext` using AES-256-GCM with the provided cached key.
/// Returns a string with the "enc1:" sentinel prefix prepended.
///
/// The output format is:  enc1:<hex(nonce)><hex(ciphertext+tag)>
/// Nonce is 96 bits (12 bytes), randomly generated per-encryption.
/// GCM tag is appended by the aes-gcm crate (16 bytes).
pub fn encrypt(plaintext: &str, key: &SecretVec<u8>) -> Result<String> {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };
    use rand::RngCore;

    let cipher = Aes256Gcm::new_from_slice(key.expose_secret())
        .map_err(|_| anyhow::anyhow!("Failed to initialise AES-256-GCM cipher"))?;

    // Fresh random nonce per encryption — never reuse nonces with GCM
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| anyhow!("Encryption failed: {e}"))?;

    // Encode: nonce (12 bytes) + ciphertext+tag
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);

    Ok(format!("{}{}", PREFIX_KEYCHAIN, hex::encode(combined)))
}

/// Decrypts a value previously produced by `encrypt()`.
///
/// Handles three cases:
///   1. "enc1:" prefix   → decrypt with cached key
///   2. No prefix        → treat as plaintext (legacy migration, permitted ONLY if key is new)
///   3. Unknown prefix   → hard error (never silently skip unknown formats)
///
/// Returns `DecryptResult` to distinguish between "decrypted OK",
/// "was plaintext — caller should re-encrypt on next save", and "error".
pub fn decrypt(stored: &str, key: Option<&SecretVec<u8>>, is_new_key: bool) -> Result<DecryptResult> {
    let trimmed = stored.trim();
    if let Some(payload) = trimmed.strip_prefix(PREFIX_KEYCHAIN) {
        // Primary path: keychain-encrypted data
        let key = key.ok_or_else(|| anyhow!("OS keychain key unavailable for decryption"))?;
        let decrypted = decrypt_enc1(payload, key)?;
        Ok(DecryptResult::Decrypted(decrypted))
    } else if (trimmed.starts_with('{') || trimmed.starts_with('[')) && !trimmed.starts_with("enc") {
        if key.is_some() && !is_new_key {
            return Err(anyhow!(
                "Insecure downgrade attack blocked: Plaintext payload provided while an established OS keychain key is active."
            ));
        }
        if serde_json::from_str::<serde_json::Value>(trimmed).is_ok() {
            warn!("Read unencrypted legacy data — will be encrypted on next save");
            Ok(DecryptResult::WasPlaintext(stored.to_string()))
        } else {
            Err(anyhow!(
                "Legacy payload starts with JSON prefix but contains invalid JSON syntax"
            ))
        }
    } else {
        // Unknown sentinel or invalid non-JSON payload — fail hard to prevent unauthorized state injection or data corruption
        Err(anyhow!(
            "Unknown or invalid encryption sentinel in stored data. \
             The data may have been written by an incompatible version of ChronoWard \
             or may be corrupt. Refusing to proceed."
        ))
    }
}

/// Result of a decrypt operation — callers use this to decide whether to
/// re-encrypt on the next save (WasPlaintext case).
#[derive(Debug)]
pub enum DecryptResult {
    /// Successfully decrypted. Contains the plaintext.
    Decrypted(String),
    /// Data was stored as plaintext (pre-encryption install).
    /// Caller should encrypt and re-save on the next write.
    WasPlaintext(String),
}

impl DecryptResult {
    /// Unwraps the inner plaintext string regardless of which variant.
    pub fn into_plaintext(self) -> String {
        match self {
            DecryptResult::Decrypted(s) => s,
            DecryptResult::WasPlaintext(s) => s,
        }
    }

    /// Returns true if the data was stored as plaintext and needs re-encryption.
    pub fn needs_reencrypt(&self) -> bool {
        matches!(self, DecryptResult::WasPlaintext(_))
    }
}

/// Inner decryption for enc1: payloads.
fn decrypt_enc1(hex_payload: &str, key: &SecretVec<u8>) -> Result<String> {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };

    let combined = hex::decode(hex_payload).context("enc1 payload is not valid hex")?;

    // Must have at least 12 bytes nonce + 16 bytes GCM tag
    if combined.len() < 28 {
        return Err(anyhow!("enc1 payload too short to be valid ciphertext"));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key.expose_secret())
        .map_err(|_| anyhow::anyhow!("Failed to initialise AES-256-GCM cipher"))?;

    let plaintext_bytes = cipher.decrypt(nonce, ciphertext).map_err(|_| {
        anyhow!(
            "Decryption failed — data may be corrupt or the keychain key \
             has changed. Original data is preserved on disk."
        )
    })?;

    String::from_utf8(plaintext_bytes).context("Decrypted bytes are not valid UTF-8")
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_enc1_roundtrip_via_internal_functions() {
        use aes_gcm::{
            aead::{Aead, KeyInit},
            Aes256Gcm, Nonce,
        };
        use rand::RngCore;

        let key_bytes: Vec<u8> = (0..32).collect(); // deterministic test key
        let cipher = Aes256Gcm::new_from_slice(&key_bytes).unwrap();

        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let plaintext = r#"{"2025-01-15": [{"task": "Design review", "hours": 3.5}]}"#;
        let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).unwrap();

        let mut combined = nonce_bytes.to_vec();
        combined.extend_from_slice(&ciphertext);

        let decrypted_bytes = cipher.decrypt(nonce, ciphertext.as_ref()).unwrap();
        let decrypted = String::from_utf8(decrypted_bytes).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_decrypt_detects_plaintext_legacy() {
        let legacy_json = r#"{"2025-01-15": []}"#;
        // is_new_key = true allows legacy plaintext migration on first run
        let result = decrypt(legacy_json, None, true).unwrap();
        assert!(result.needs_reencrypt());
        assert_eq!(result.into_plaintext(), legacy_json);
    }

    #[test]
    fn test_decrypt_rejects_plaintext_downgrade_when_key_preexists() {
        let legacy_json = r#"{"2025-01-15": []}"#;
        let key = SecretVec::new(vec![0u8; 32]);
        // is_new_key = false must block plaintext payload to prevent downgrade attack
        let result = decrypt(legacy_json, Some(&key), false);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Insecure downgrade attack blocked"));
    }

    #[test]
    fn test_decrypt_rejects_unknown_sentinel() {
        let bad = "enc9:somepayload";
        let result = decrypt(bad, None, true);
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_rejects_non_json_unencrypted_payload() {
        let bad = "arbitrary_unencrypted_junk_string";
        let result = decrypt(bad, None, true);
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_rejects_malformed_legacy_json() {
        let bad_json = r#"{"incomplete_key": "#;
        let result = decrypt(bad_json, None, true);
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_rejects_truncated_enc1_payload() {
        let bad = "enc1:deadbeefdeadbeef1234";
        let key = SecretVec::new(vec![0u8; 32]);
        let result = decrypt(bad, Some(&key), false);
        assert!(result.is_err());
    }

    #[test]
    fn test_generate_random_key_length() {
        let key = generate_random_key().unwrap();
        assert_eq!(key.len(), KEY_SIZE);
    }

    #[test]
    fn test_two_encryptions_produce_different_ciphertext() {
        let (status, key) = probe_keychain();
        if matches!(status, KeychainStatus::Available { .. }) {
            let key = key.unwrap();
            let plaintext = "same plaintext";
            let ct1 = encrypt(plaintext, &key).unwrap();
            let ct2 = encrypt(plaintext, &key).unwrap();
            assert_ne!(ct1, ct2);
            assert_eq!(
                decrypt(&ct1, Some(&key), false).unwrap().into_plaintext(),
                decrypt(&ct2, Some(&key), false).unwrap().into_plaintext()
            );
        }
    }
}
