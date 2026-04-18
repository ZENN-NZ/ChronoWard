/// commands/settings.rs — load_settings, save_settings
///
/// Settings are the only data file that is NOT encrypted by default on first
/// run — they contain no sensitive data (theme, hour increment, times).
/// They ARE encrypted after the first save cycle once a keychain key exists,
/// matching the same enc1: sentinel format as sheets and timers.
///
/// This means: settings.json is readable in an emergency without decryption,
/// which is intentional — the user can see their preferences even if the
/// keychain is locked. Only timesheet data (sheets.json) truly needs
/// encryption from a privacy standpoint.
///
/// If we decide to encrypt settings in future, the sentinel migration path
/// in crypto.rs already handles it transparently.
use tauri::State;
use tracing::{debug, info, warn};

use crate::{
    crypto, guard_write,
    state::{AppState, Settings},
};

/// Loads settings from disk, decrypting if necessary.
/// Falls back to defaults if the file doesn't exist.
/// Populates the in-memory cache on success.
///
/// Returns the settings as a JSON-serialisable value for the renderer.
#[tauri::command]
pub async fn load_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let path = state.settings_path();
    debug!("load_settings: {:?}", path);

    // If already cached, return from cache
    {
        let cache = state.settings.lock().unwrap();
        if let Some(ref s) = *cache {
            debug!("load_settings: returning cached settings");
            return Ok(s.clone());
        }
    }

    // Not cached — read from disk
    let settings = if path.exists() {
        let raw = tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| format!("Failed to read settings.json: {e}"))?;

        // Detect encryption sentinel
        let plaintext = if raw.trim_start().starts_with("enc1:") {
            // Encrypted — requires keychain
            if !state.keychain_available() {
                // Settings are not encrypted by default on new installs,
                // but if we find enc1: and the keychain is down, we must
                // fall back to defaults rather than block startup entirely.
                // Settings loss is recoverable; timesheet data loss is not.
                warn!(
                    "Settings are encrypted but keychain is unavailable — \
                     using defaults. Settings will NOT be saved until keychain \
                     is restored."
                );
                return Ok(Settings::default());
            }
            match crypto::decrypt(raw.trim()) {
                Ok(result) => {
                    if result.needs_reencrypt() {
                        *state.has_legacy_plaintext.lock().unwrap() = true;
                    }
                    result.into_plaintext()
                }
                Err(e) => return Err(format!("Failed to decrypt settings.json: {e}")),
            }
        } else {
            // Plaintext settings (normal case for settings)
            raw
        };

        serde_json::from_str::<Settings>(&plaintext).unwrap_or_else(|e| {
            warn!("settings.json parse error ({e}) — using defaults");
            Settings::default()
        })
    } else {
        info!("settings.json not found — using defaults");
        Settings::default()
    };

    // Populate cache
    *state.settings.lock().unwrap() = Some(settings.clone());
    Ok(settings)
}

/// Saves settings to disk. Encrypts if the keychain is available.
/// Blocked in emergency mode (though settings loss is less critical,
/// consistency matters — if writes are blocked, ALL writes are blocked).
#[tauri::command]
pub async fn save_settings(
    settings: Settings,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    guard_write!(state);

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialise settings: {e}"))?;

    // Encrypt if keychain available, store plaintext if not.
    // (Emergency mode is already guarded above, so if we reach here without
    // keychain, it means keychain became unavailable mid-session — rare but
    // possible. We store plaintext with a warning rather than losing the save.)
    let to_write = if state.keychain_available() {
        crypto::encrypt(&json).map_err(|e| format!("Failed to encrypt settings: {e}"))?
    } else {
        warn!("Keychain unavailable during save_settings — storing plaintext");
        json
    };

    atomic_write(&state.settings_path(), &to_write).await?;

    // Enable or disable OS autostart based on the setting
    let auto_start = settings.auto_start;

    // Update cache
    *state.settings.lock().unwrap() = Some(settings);
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

/// Writes data atomically: write to .tmp file, then rename into place.
/// This guarantees the target file is never in a half-written state.
/// Exported for reuse by sheets.rs and timers.rs.
pub async fn atomic_write(path: &std::path::Path, content: &str) -> Result<(), String> {
    let tmp_path = path.with_extension("json.tmp");

    tokio::fs::write(&tmp_path, content)
        .await
        .map_err(|e| format!("Failed to write temp file {:?}: {e}", tmp_path))?;

    tokio::fs::rename(&tmp_path, path)
        .await
        .map_err(|e| format!("Failed to rename temp file to {:?}: {e}", path))?;

    Ok(())
}
