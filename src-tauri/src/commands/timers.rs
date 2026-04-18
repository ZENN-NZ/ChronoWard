/// commands/timers.rs — load_timers, save_timers
///
/// Timer state is less sensitive than sheet data (no hours/task details,
/// just elapsed milliseconds and running state), but we encrypt it anyway
/// for consistency and to avoid leaking "user was running a timer at 2am"
/// metadata to anyone with filesystem access.
///
/// The load/save pattern is identical to sheets.rs. This intentional
/// repetition (rather than a generic abstraction) means each data type
/// can diverge independently — e.g. timers might get a TTL expiry,
/// or sheets might get per-date encryption keys in future.
use serde_json::Value;
use tauri::State;
use tracing::{info, warn};

use crate::{commands::settings::atomic_write, crypto, guard_write, state::AppState};

/// Loads timer state from disk.
/// Returns an empty object if the file doesn't exist (no running timers
/// on a fresh install is the expected state).
#[tauri::command]
pub async fn load_timers(state: State<'_, AppState>) -> Result<Value, String> {
    // Timers are non-critical — in emergency mode we return empty rather
    // than blocking startup. A lost timer state is inconvenient, not a
    // data loss event (the hours haven't been logged yet anyway).
    if state.is_read_only() {
        warn!("Emergency mode active — returning empty timer state");
        return Ok(serde_json::json!({}));
    }

    let path = state.timers_path();

    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read timers.json: {e}"))?;

    let plaintext = if raw.trim_start().starts_with("enc1:") {
        if !state.keychain_available() {
            warn!("Timers encrypted but keychain unavailable — returning empty");
            return Ok(serde_json::json!({}));
        }
        crypto::decrypt(raw.trim())
            .map_err(|e| format!("Failed to decrypt timers.json: {e}"))?
            .into_plaintext()
    } else {
        raw
    };

    match serde_json::from_str::<Value>(&plaintext) {
        Ok(data) => {
            info!("timers.json loaded");
            Ok(data)
        }
        Err(e) => {
            warn!("timers.json is corrupt ({e}) — returning empty");
            Ok(serde_json::json!({}))
        }
    }
}

/// Saves timer state to disk, encrypted.
/// Blocked in emergency mode.
#[tauri::command]
pub async fn save_timers(timers: Value, state: State<'_, AppState>) -> Result<(), String> {
    guard_write!(state);

    let json = serde_json::to_string_pretty(&timers)
        .map_err(|e| format!("Failed to serialise timers: {e}"))?;

    let to_write = if state.keychain_available() {
        crypto::encrypt(&json).map_err(|e| format!("Failed to encrypt timers: {e}"))?
    } else {
        warn!("Keychain unavailable during save_timers — storing plaintext");
        json
    };

    atomic_write(&state.timers_path(), &to_write).await?;
    Ok(())
}
