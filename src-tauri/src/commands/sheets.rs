/// commands/sheets.rs — load_sheets, save_sheets
///
/// sheets.json is the primary sensitive data file. It contains the full
/// history of all timesheet entries keyed by date. It is ALWAYS encrypted
/// at rest when the keychain is available.
///
/// Emergency mode behaviour (Decision 1c-ii):
///   - If keychain is unavailable AND sheets.json starts with "enc1:",
///     the app enters read-only emergency mode before this command is even
///     called. load_sheets returns the EmergencyModeInfo to the renderer.
///   - If keychain is unavailable AND sheets.json is plaintext (legacy),
///     reading is allowed but saving is blocked until keychain is restored.
///
/// Corruption handling:
///   - If sheets.json exists but cannot be parsed, it is quarantined to
///     sheets.json.corrupt.<timestamp> and an empty object is returned.
///     The renderer is notified so it can display a recovery warning.
use serde_json::Value;
use tauri::State;
use tracing::{error, info, warn};

use crate::{commands::settings::atomic_write, guard_write, state::AppState};

/// Loads all timesheet data from disk.
///
/// Return shape: `{ "ok": true, "data": {...} }`
///            or `{ "ok": false, "error": "...", "code": "..." }`
///
/// The renderer pattern-matches on `ok` rather than relying on Tauri's
/// error channel, giving us richer error information (error code + message).
#[tauri::command]
pub async fn load_sheets(state: State<'_, AppState>) -> Result<Value, String> {
    load_sheets_impl(&state).await
}

pub async fn load_sheets_impl(state: &AppState) -> Result<Value, String> {
    // If already in emergency mode, return the error immediately.
    // The renderer shows the read-only UI overlay.
    if let Some(ref info) = state.emergency_mode {
        return Ok(serde_json::json!({
            "ok": false,
            "code": "EMERGENCY_MODE",
            "reason": info.reason,
            "encryptedDataExists": info.encrypted_data_exists,
        }));
    }

    let path = state.sheets_path();

    if !path.exists() {
        info!("sheets.json not found — returning empty object");
        return Ok(serde_json::json!({ "ok": true, "data": {} }));
    }

    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read sheets.json: {e}"))?;

    // Decrypt stored payload via crypto layer
    let plaintext = match state.decrypt(raw.trim()) {
        Ok(result) => {
            if result.needs_reencrypt() {
                *state.has_legacy_plaintext.lock().unwrap_or_else(|e| e.into_inner()) = true;
            }
            result.into_plaintext()
        }
        Err(e) => {
            error!("Failed to decrypt sheets.json: {e}");
            state.write_protected.store(true, std::sync::atomic::Ordering::SeqCst);
            return Ok(serde_json::json!({
                "ok": false,
                "code": "DECRYPT_FAILED",
                "reason": e.to_string(),
            }));
        }
    };

    // Parse JSON — quarantine if corrupt
    match serde_json::from_str::<Value>(&plaintext) {
        Ok(data) => {
            info!("sheets.json loaded successfully");
            Ok(serde_json::json!({ "ok": true, "data": data }))
        }
        Err(e) => {
            warn!("sheets.json is corrupt — quarantining: {e}");
            state.write_protected.store(true, std::sync::atomic::Ordering::SeqCst);
            let quarantine = state.quarantine_path("sheets.json");
            if let Err(qe) = tokio::fs::rename(&path, &quarantine).await {
                error!("Failed to quarantine corrupt sheets.json: {qe}");
            } else {
                info!("Quarantined corrupt sheets.json to {:?}", quarantine);
            }
            Ok(serde_json::json!({
                "ok": true,
                "data": {},
                "warning": "CORRUPT_DATA_QUARANTINED",
                "quarantinedTo": quarantine.to_string_lossy(),
            }))
        }
    }
}

/// Saves all timesheet data to disk, encrypted.
/// Blocked in emergency mode.
#[tauri::command]
pub async fn save_sheets(sheets: Value, state: State<'_, AppState>) -> Result<(), String> {
    save_sheets_impl(sheets, &state).await
}

pub async fn save_sheets_impl(sheets: Value, state: &AppState) -> Result<(), String> {
    guard_write!(state);
    let _guard = state.write_lock.lock().await;

    let json = serde_json::to_string_pretty(&sheets)
        .map_err(|e| format!("Failed to serialise sheets: {e}"))?;

    let to_write = if state.keychain_available() {
        state.encrypt(&json).map_err(|e| format!("Failed to encrypt sheets: {e}"))?
    } else {
        return Err(
            "Keychain unavailable during save_sheets — refusing to write unencrypted data"
                .to_string(),
        );
    };

    atomic_write(&state.sheets_path(), &to_write).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::KeychainStatus;
    use secrecy::SecretVec;
    use std::path::PathBuf;

    fn make_state(dir: PathBuf, key: Option<SecretVec<u8>>) -> AppState {
        AppState::new(
            dir,
            if key.is_some() {
                KeychainStatus::Available { is_new_key: false }
            } else {
                KeychainStatus::Unavailable("test".to_string())
            },
            key,
        )
    }

    #[tokio::test]
    async fn test_c1_decrypt_failure_blocks_writes() {
        let temp_dir = std::env::temp_dir().join(format!(
            "chronoward-test-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let key = SecretVec::new(vec![42u8; 32]);
        
        let state = make_state(temp_dir.clone(), Some(key));
        
        // Write undecryptable data to sheets.json
        let sheets_path = state.sheets_path();
        let bad_ciphertext = "enc1:not_valid_ciphertext";
        tokio::fs::write(&sheets_path, bad_ciphertext).await.unwrap();

        // 1. load_sheets must return DECRYPT_FAILED
        let res = load_sheets_impl(&state).await.unwrap();
        let code = res.get("code").and_then(|c| c.as_str());
        assert_eq!(code, Some("DECRYPT_FAILED"));
        assert_eq!(res.get("ok").and_then(|o| o.as_bool()), Some(false));

        // 2. state must now be write-protected
        assert!(state.write_protected.load(std::sync::atomic::Ordering::SeqCst));

        // 3. save_sheets must fail with WRITE_BLOCKED
        let save_err = save_sheets_impl(serde_json::json!({"2026-01-01": []}), &state).await.unwrap_err();
        assert!(save_err.contains("WRITE_BLOCKED_EMERGENCY_MODE"));
        
        // 4. original bytes must still be on disk
        let disk_content = tokio::fs::read_to_string(&sheets_path).await.unwrap();
        assert_eq!(disk_content, bad_ciphertext);
    }
}
