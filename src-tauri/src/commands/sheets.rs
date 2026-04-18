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

use crate::{
    commands::settings::atomic_write,
    crypto,
    guard_write,
    state::AppState,
};

/// Loads all timesheet data from disk.
///
/// Return shape: `{ "ok": true, "data": {...} }`
///            or `{ "ok": false, "error": "...", "code": "..." }`
///
/// The renderer pattern-matches on `ok` rather than relying on Tauri's
/// error channel, giving us richer error information (error code + message).
#[tauri::command]
pub async fn load_sheets(state: State<'_, AppState>) -> Result<Value, String> {
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

    // Decrypt if necessary
    let plaintext = if raw.trim_start().starts_with("enc1:") {
        // Should not reach here in emergency mode (guarded above), but be safe.
        if !state.keychain_available() {
            return Ok(serde_json::json!({
                "ok": false,
                "code": "EMERGENCY_MODE",
                "reason": "Sheets are encrypted but the OS keychain is unavailable.",
                "encryptedDataExists": true,
            }));
        }
        match crypto::decrypt(raw.trim()) {
            Ok(result) => {
                if result.needs_reencrypt() {
                    *state.has_legacy_plaintext.lock().unwrap() = true;
                }
                result.into_plaintext()
            }
            Err(e) => {
                error!("Failed to decrypt sheets.json: {e}");
                return Ok(serde_json::json!({
                    "ok": false,
                    "code": "DECRYPT_FAILED",
                    "reason": e.to_string(),
                }));
            }
        }
    } else {
        // Plaintext (legacy migration path)
        warn!("sheets.json is unencrypted — will encrypt on next save");
        *state.has_legacy_plaintext.lock().unwrap() = true;
        raw
    };

    // Parse JSON — quarantine if corrupt
    match serde_json::from_str::<Value>(&plaintext) {
        Ok(data) => {
            info!("sheets.json loaded successfully");
            Ok(serde_json::json!({ "ok": true, "data": data }))
        }
        Err(e) => {
            warn!("sheets.json is corrupt — quarantining: {e}");
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
    guard_write!(state);

    let json = serde_json::to_string_pretty(&sheets)
        .map_err(|e| format!("Failed to serialise sheets: {e}"))?;

    let to_write = if state.keychain_available() {
        crypto::encrypt(&json).map_err(|e| format!("Failed to encrypt sheets: {e}"))?
    } else {
        // Keychain became unavailable mid-session (very rare).
        // We've already blocked writes in emergency mode above;
        // this branch only fires if keychain went down after startup
        // but emergency mode wasn't set (i.e. there was no encrypted data
        // at startup). Store plaintext with a warning.
        warn!("Keychain unavailable during save_sheets — storing plaintext");
        json
    };

    atomic_write(&state.sheets_path(), &to_write).await?;
    Ok(())
}
