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
/// Corruption & recovery handling:
///   - If sheets.json fails decryption or JSON parsing, we first check if a
///     valid `sheets.json.bak` exists. If so, the corrupt primary file is
///     quarantined to `sheets.json.corrupt.<timestamp>`, the backup is restored,
///     and the renderer is notified.
///   - If no valid backup exists and decryption failed, `write_protected` is set
///     to block any overwrites while preserving the original ciphertext on disk.
///   - If decryption succeeded but JSON syntax is corrupt (and no valid backup
///     exists), the corrupt file is quarantined to `sheets.json.corrupt.<timestamp>`
///     and an empty sheet is returned so the user is not locked out.
use serde_json::Value;
use tauri::State;
use tracing::{error, info, warn};

use crate::{commands::settings::atomic_write, guard_write, state::AppState};

async fn try_recover_from_bak(bak_path: &std::path::Path, state: &AppState) -> Option<Value> {
    if !bak_path.exists() {
        return None;
    }
    let raw = tokio::fs::read_to_string(bak_path).await.ok()?;
    let res = state.decrypt(raw.trim()).ok()?;
    let plaintext = res.into_plaintext();
    serde_json::from_str::<Value>(&plaintext).ok()
}

/// Loads all timesheet data from disk.
///
/// Return shape: `{ "ok": true, "data": {...} }`
///            or `{ "ok": false, "error": "...", "code": "..." }`
#[tauri::command]
pub async fn load_sheets(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Unauthorized window for load_sheets".to_string());
    }
    load_sheets_impl(&state).await
}

pub async fn load_sheets_impl(state: &AppState) -> Result<Value, String> {
    // If already in emergency mode, return the error immediately.
    if let Some(ref info) = state.emergency_mode {
        return Ok(serde_json::json!({
            "ok": false,
            "code": "EMERGENCY_MODE",
            "reason": info.reason,
            "encryptedDataExists": info.encrypted_data_exists,
        }));
    }

    let path = state.sheets_path();
    let bak_path = path.with_extension("json.bak");

    if !path.exists() {
        if let Some(bak_data) = try_recover_from_bak(&bak_path, state).await {
            let _ = tokio::fs::copy(&bak_path, &path).await;
            warn!("sheets.json missing — restored from sheets.json.bak");
            return Ok(serde_json::json!({
                "ok": true,
                "data": bak_data,
                "warning": "CORRUPT_DATA_QUARANTINED",
                "quarantinedTo": bak_path.to_string_lossy(),
            }));
        }
        info!("sheets.json not found — returning empty object");
        return Ok(serde_json::json!({ "ok": true, "data": {} }));
    }

    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read sheets.json: {e}"))?;

    // Decrypt stored payload via crypto layer
    let (plaintext, needs_reencrypt) = match state.decrypt(raw.trim()) {
        Ok(result) => {
            let needs_reencrypt = result.needs_reencrypt();
            (result.into_plaintext(), needs_reencrypt)
        }
        Err(e) => {
            error!("Failed to decrypt sheets.json: {e}");
            if let Some(bak_data) = try_recover_from_bak(&bak_path, state).await {
                let quarantine = state.quarantine_path("sheets.json");
                if tokio::fs::rename(&path, &quarantine).await.is_ok()
                    && tokio::fs::copy(&bak_path, &path).await.is_ok()
                {
                    warn!(
                        "Quarantined undecryptable sheets.json to {:?} and restored from backup",
                        quarantine
                    );
                    return Ok(serde_json::json!({
                        "ok": true,
                        "data": bak_data,
                        "warning": "CORRUPT_DATA_QUARANTINED",
                        "quarantinedTo": quarantine.to_string_lossy(),
                    }));
                }
            }
            state
                .write_protected
                .store(true, std::sync::atomic::Ordering::SeqCst);
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
            if needs_reencrypt && state.keychain_available() && !state.is_read_only() {
                let _guard = state.write_lock.lock().await;
                if let Ok(encrypted) = state.encrypt(&plaintext) {
                    if let Err(we) = atomic_write(&path, &encrypted).await {
                        warn!("Failed to re-encrypt legacy sheets.json on load: {we}");
                    } else {
                        info!("Migrated legacy plaintext sheets.json to encrypted format");
                    }
                }
            }
            info!("sheets.json loaded successfully");
            Ok(serde_json::json!({ "ok": true, "data": data }))
        }
        Err(e) => {
            warn!("sheets.json is corrupt — quarantining: {e}");
            let quarantine = state.quarantine_path("sheets.json");
            if let Err(qe) = tokio::fs::rename(&path, &quarantine).await {
                error!("Failed to quarantine corrupt sheets.json: {qe}");
                state
                    .write_protected
                    .store(true, std::sync::atomic::Ordering::SeqCst);
                return Ok(serde_json::json!({
                    "ok": false,
                    "code": "DECRYPT_FAILED",
                    "reason": format!("Corrupt JSON and quarantine failed: {qe}"),
                }));
            }
            info!("Quarantined corrupt sheets.json to {:?}", quarantine);

            let recovered_data = if let Some(bak_data) = try_recover_from_bak(&bak_path, state).await {
                let _ = tokio::fs::copy(&bak_path, &path).await;
                info!("Restored sheets.json from sheets.json.bak after quarantine");
                bak_data
            } else {
                serde_json::json!({})
            };

            Ok(serde_json::json!({
                "ok": true,
                "data": recovered_data,
                "warning": "CORRUPT_DATA_QUARANTINED",
                "quarantinedTo": quarantine.to_string_lossy(),
            }))
        }
    }
}

/// Saves all timesheet data to disk, encrypted.
/// Blocked in emergency or write-protected mode.
#[tauri::command]
pub async fn save_sheets(
    window: tauri::WebviewWindow,
    sheets: Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Unauthorized window for save_sheets".to_string());
    }
    save_sheets_impl(sheets, &state).await
}

pub async fn save_sheets_impl(sheets: Value, state: &AppState) -> Result<(), String> {
    guard_write!(state);
    let _guard = state.write_lock.lock().await;

    let json = serde_json::to_string_pretty(&sheets)
        .map_err(|e| format!("Failed to serialise sheets: {e}"))?;

    let to_write = if state.keychain_available() {
        state
            .encrypt(&json)
            .map_err(|e| format!("Failed to encrypt sheets: {e}"))?
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

    fn make_state(dir: PathBuf, key: Option<SecretVec<u8>>, is_new_key: bool) -> AppState {
        AppState::new(
            dir,
            if key.is_some() {
                KeychainStatus::Available { is_new_key }
            } else {
                KeychainStatus::Unavailable("test".to_string())
            },
            key,
        )
    }

    #[tokio::test]
    async fn test_c1_decrypt_failure_blocks_writes() {
        let temp_dir = std::env::temp_dir().join(format!(
            "chronoward-test-c1-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let key = SecretVec::new(vec![42u8; 32]);

        let state = make_state(temp_dir.clone(), Some(key), false);

        // Write undecryptable data to sheets.json (with no backup)
        let sheets_path = state.sheets_path();
        let bad_ciphertext = "enc1:not_valid_ciphertext";
        tokio::fs::write(&sheets_path, bad_ciphertext).await.unwrap();

        // 1. load_sheets must return DECRYPT_FAILED
        let res = load_sheets_impl(&state).await.unwrap();
        let code = res.get("code").and_then(|c| c.as_str());
        assert_eq!(code, Some("DECRYPT_FAILED"));
        assert_eq!(res.get("ok").and_then(|o| o.as_bool()), Some(false));

        // 2. state must now be write-protected
        assert!(state
            .write_protected
            .load(std::sync::atomic::Ordering::SeqCst));

        // 3. save_sheets must fail with WRITE_BLOCKED
        let save_err = save_sheets_impl(serde_json::json!({"2026-01-01": []}), &state)
            .await
            .unwrap_err();
        assert!(save_err.contains("WRITE_BLOCKED_EMERGENCY_MODE"));

        // 4. original bytes must still be on disk
        let disk_content = tokio::fs::read_to_string(&sheets_path).await.unwrap();
        assert_eq!(disk_content, bad_ciphertext);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_rh3_decrypt_failure_recovers_from_valid_backup() {
        let temp_dir = std::env::temp_dir().join(format!(
            "chronoward-test-rh3-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let key = SecretVec::new(vec![42u8; 32]);
        let state = make_state(temp_dir.clone(), Some(key), false);

        // Save two versions so `.bak` holds the first valid encrypted sheet
        save_sheets_impl(
            serde_json::json!({"2026-01-01": [{"task": "Backup task", "hours": 4.0}]}),
            &state,
        )
        .await
        .unwrap();
        save_sheets_impl(
            serde_json::json!({"2026-01-01": [{"task": "Latest task", "hours": 8.0}]}),
            &state,
        )
        .await
        .unwrap();

        // Corrupt primary sheets.json
        tokio::fs::write(state.sheets_path(), "enc1:corrupted_primary")
            .await
            .unwrap();

        let res = load_sheets_impl(&state).await.unwrap();
        assert_eq!(res.get("ok").and_then(|o| o.as_bool()), Some(true));
        assert_eq!(
            res.get("warning").and_then(|w| w.as_str()),
            Some("CORRUPT_DATA_QUARANTINED")
        );
        assert!(!state
            .write_protected
            .load(std::sync::atomic::Ordering::SeqCst));
        assert_eq!(
            res["data"]["2026-01-01"][0]["task"].as_str(),
            Some("Backup task")
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_rh4_legacy_plaintext_reencrypted_on_load() {
        let temp_dir = std::env::temp_dir().join(format!(
            "chronoward-test-rh4-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let key1 = SecretVec::new(vec![7u8; 32]);
        let key2 = SecretVec::new(vec![7u8; 32]);

        // Run 1: new key with legacy plaintext on disk
        let state_run1 = make_state(temp_dir.clone(), Some(key1), true);
        tokio::fs::write(
            state_run1.sheets_path(),
            r#"{"2026-01-01": [{"task": "Legacy", "hours": 2.0}]}"#,
        )
        .await
        .unwrap();

        let res1 = load_sheets_impl(&state_run1).await.unwrap();
        assert_eq!(res1.get("ok").and_then(|o| o.as_bool()), Some(true));

        // Verify file on disk was automatically re-encrypted during load
        let raw_on_disk = tokio::fs::read_to_string(state_run1.sheets_path())
            .await
            .unwrap();
        assert!(raw_on_disk.starts_with("enc1:"));

        // Run 2: existing key (is_new_key = false) must load without downgrade error
        let state_run2 = make_state(temp_dir.clone(), Some(key2), false);
        let res2 = load_sheets_impl(&state_run2).await.unwrap();
        assert_eq!(res2.get("ok").and_then(|o| o.as_bool()), Some(true));
        assert_eq!(res2["data"]["2026-01-01"][0]["task"].as_str(), Some("Legacy"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
