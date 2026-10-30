/// commands/timers.rs — load_timers, save_timers
///
/// Timer state is encrypted at rest with the same `enc1:` format as sheets
/// and settings. If `timers.json` is corrupt or undecryptable, it is
/// quarantined to `timers.json.corrupt.<timestamp>` and an empty object is
/// returned so ephemeral timer corruption never blocks timesheet saves.
use serde_json::Value;
use tauri::State;
use tracing::{info, warn};

use crate::{commands::settings::atomic_write, guard_write, state::AppState};

/// Loads timer state from disk.
/// Returns an empty object if the file doesn't exist (no running timers
/// on a fresh install is the expected state).
#[tauri::command]
pub async fn load_timers(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Unauthorized window for load_timers".to_string());
    }
    load_timers_impl(&state).await
}

pub async fn load_timers_impl(state: &AppState) -> Result<Value, String> {
    // Timers are non-critical — in read-only mode we return empty rather
    // than blocking startup.
    if state.is_read_only() {
        warn!("Read-only mode active — returning empty timer state");
        return Ok(serde_json::json!({}));
    }

    let path = state.timers_path();

    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read timers.json: {e}"))?;

    let (plaintext, needs_reencrypt) = match state.decrypt(raw.trim()) {
        Ok(res) => {
            let needs_reencrypt = res.needs_reencrypt();
            (res.into_plaintext(), needs_reencrypt)
        }
        Err(e) => {
            warn!("Failed to decrypt timers.json ({e}) — quarantining and returning empty");
            let quarantine = state.quarantine_path("timers.json");
            let _ = tokio::fs::rename(&path, &quarantine).await;
            return Ok(serde_json::json!({}));
        }
    };

    match serde_json::from_str::<Value>(&plaintext) {
        Ok(data) => {
            if needs_reencrypt && state.keychain_available() && !state.is_read_only() {
                let _guard = state.write_lock.lock().await;
                if let Ok(encrypted) = state.encrypt(&plaintext) {
                    let _ = atomic_write(&path, &encrypted).await;
                    info!("Migrated legacy plaintext timers.json to encrypted format");
                }
            }
            info!("timers.json loaded");
            Ok(data)
        }
        Err(e) => {
            warn!("timers.json is corrupt ({e}) — quarantining and returning empty");
            let quarantine = state.quarantine_path("timers.json");
            let _ = tokio::fs::rename(&path, &quarantine).await;
            Ok(serde_json::json!({}))
        }
    }
}

/// Saves timer state to disk, encrypted.
/// Blocked in emergency or write-protected mode.
#[tauri::command]
pub async fn save_timers(
    window: tauri::WebviewWindow,
    timers: Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Unauthorized window for save_timers".to_string());
    }
    guard_write!(state);
    let _guard = state.write_lock.lock().await;

    let json = serde_json::to_string_pretty(&timers)
        .map_err(|e| format!("Failed to serialise timers: {e}"))?;

    let to_write = if state.keychain_available() {
        state
            .encrypt(&json)
            .map_err(|e| format!("Failed to encrypt timers: {e}"))?
    } else {
        return Err(
            "Keychain unavailable during save_timers — refusing to write unencrypted data"
                .to_string(),
        );
    };

    atomic_write(&state.timers_path(), &to_write).await?;
    Ok(())
}
