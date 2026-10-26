/// commands/settings.rs — load_settings, save_settings
///
/// Settings are encrypted at rest with the `enc1:` sentinel format once a
/// keychain key is available, matching `sheets.json` and `timers.json`.
/// Legacy plaintext `settings.json` files from pre-encryption installs are
/// automatically upgraded to encrypted storage on first load.
use tauri::State;
use tracing::{debug, info, warn};

use crate::{
    guard_write,
    state::{AppState, Settings},
};

/// Loads settings from disk, decrypting if necessary.
/// Falls back to `.json.bak` or defaults if the file is missing or corrupt.
/// Populates the in-memory cache on success.
#[tauri::command]
pub async fn load_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    load_settings_impl(&state).await
}

pub async fn load_settings_impl(state: &AppState) -> Result<Settings, String> {
    let path = state.settings_path();
    let bak_path = path.with_extension("json.bak");
    debug!("load_settings: {:?}", path);

    // If already cached, return from cache
    {
        let cache = state.settings.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref s) = *cache {
            debug!("load_settings: returning cached settings");
            return Ok(s.clone());
        }
    }

    async fn try_load_settings_file(
        file_path: &std::path::Path,
        state: &AppState,
    ) -> Result<(Settings, String, bool), String> {
        let raw = tokio::fs::read_to_string(file_path)
            .await
            .map_err(|e| format!("Failed to read {:?}: {e}", file_path))?;
        let res = state
            .decrypt(raw.trim())
            .map_err(|e| format!("Failed to decrypt {:?}: {e}", file_path))?;
        let needs_reencrypt = res.needs_reencrypt();
        let plaintext = res.into_plaintext();
        let parsed = serde_json::from_str::<Settings>(&plaintext)
            .map_err(|e| format!("Failed to parse {:?}: {e}", file_path))?;
        Ok((parsed, plaintext, needs_reencrypt))
    }

    let settings = if path.exists() {
        match try_load_settings_file(&path, state).await {
            Ok((parsed, plaintext, needs_reencrypt)) => {
                if needs_reencrypt && state.keychain_available() && !state.is_read_only() {
                    let _guard = state.write_lock.lock().await;
                    if let Ok(encrypted) = state.encrypt(&plaintext) {
                        let _ = atomic_write(&path, &encrypted).await;
                        info!("Migrated legacy plaintext settings.json to encrypted format");
                    }
                }
                parsed
            }
            Err(err) => {
                warn!("settings.json unreadable ({err}) — quarantining and checking backup");
                let quarantine = state.quarantine_path("settings.json");
                let _ = tokio::fs::rename(&path, &quarantine).await;

                if bak_path.exists() {
                    match try_load_settings_file(&bak_path, state).await {
                        Ok((bak_settings, _, _)) => {
                            let _ = tokio::fs::copy(&bak_path, &path).await;
                            info!("Recovered settings.json from settings.json.bak");
                            bak_settings
                        }
                        Err(_) => Settings::default(),
                    }
                } else {
                    Settings::default()
                }
            }
        }
    } else if bak_path.exists() {
        match try_load_settings_file(&bak_path, state).await {
            Ok((bak_settings, _, _)) => {
                let _ = tokio::fs::copy(&bak_path, &path).await;
                info!("Restored missing settings.json from settings.json.bak");
                bak_settings
            }
            Err(_) => Settings::default(),
        }
    } else {
        info!("settings.json not found — using defaults");
        Settings::default()
    };

    // Populate cache
    *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = Some(settings.clone());
    Ok(settings)
}

/// Saves settings to disk, encrypted.
/// Blocked in emergency or write-protected mode.
#[tauri::command]
pub async fn save_settings(
    window: tauri::WebviewWindow,
    settings: Settings,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Unauthorized window for save_settings".to_string());
    }
    guard_write!(state);
    let _guard = state.write_lock.lock().await;

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialise settings: {e}"))?;

    // Always encrypt with the cached keychain key; refuse to write unencrypted settings.
    let to_write = if state.keychain_available() {
        state
            .encrypt(&json)
            .map_err(|e| format!("Failed to encrypt settings: {e}"))?
    } else {
        return Err(
            "Keychain unavailable during save_settings — refusing to write unencrypted settings"
                .to_string(),
        );
    };

    atomic_write(&state.settings_path(), &to_write).await?;

    // Enable or disable OS autostart based on the setting
    let auto_start = settings.auto_start;

    // Update cache
    *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = Some(settings);
    info!("Settings saved");

    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if auto_start {
        let _ = manager.enable();
    } else {
        let _ = manager.disable();
    }

    Ok(())
}

/// Writes data atomically: write and fsync `.tmp` file, copy existing target
/// to `.json.bak`, then atomically rename `.tmp` over target.
/// Using `copy` rather than `rename` for `.bak` guarantees `path` is never
/// missing on disk between two rename operations.
pub async fn atomic_write(path: &std::path::Path, content: &str) -> Result<(), String> {
    let timestamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
    let tmp_path = path.with_extension(format!("json.tmp.{}", timestamp));

    {
        use tokio::io::AsyncWriteExt;
        let mut file = tokio::fs::File::create(&tmp_path)
            .await
            .map_err(|e| format!("Failed to create temp file {:?}: {e}", tmp_path))?;
        if let Err(e) = file.write_all(content.as_bytes()).await {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return Err(format!("Failed to write temp file {:?}: {e}", tmp_path));
        }
        if let Err(e) = file.sync_all().await {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return Err(format!("Failed to sync temp file {:?}: {e}", tmp_path));
        }
    }

    let bak_path = path.with_extension("json.bak");
    if path.exists() {
        if let Err(e) = tokio::fs::copy(path, &bak_path).await {
            warn!("Failed to update backup file {:?}: {e}", bak_path);
        }
    }

    if let Err(e) = tokio::fs::rename(&tmp_path, path).await {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err(format!("Failed to rename temp file to {:?}: {e}", path));
    }

    #[cfg(target_family = "unix")]
    if let Some(parent) = path.parent() {
        if let Ok(dir) = tokio::fs::File::open(parent).await {
            let _ = dir.sync_all().await;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[tokio::test]
    async fn test_atomic_write_creates_bak_and_target() {
        let temp_dir = std::env::temp_dir().join(format!(
            "chronoward_test_atomic_{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let path = temp_dir.join("test.json");

        // First write (no bak should exist yet)
        atomic_write(&path, "first").await.unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "first");
        assert!(!path.with_extension("json.bak").exists());

        // Second write (should copy first to bak and atomically replace target)
        atomic_write(&path, "second").await.unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
        assert_eq!(
            fs::read_to_string(path.with_extension("json.bak")).unwrap(),
            "first"
        );

        fs::remove_dir_all(&temp_dir).unwrap();
    }
}
