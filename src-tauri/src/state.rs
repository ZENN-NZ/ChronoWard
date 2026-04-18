/// state.rs — ChronoWard shared application state
///
/// AppState is initialised once at startup and injected into every Tauri
/// command via `tauri::State<'_, AppState>`. All mutable fields are wrapped
/// in `Mutex` so commands running concurrently (Tauri dispatches commands on
/// a thread pool) never race each other.
///
/// Design rules:
///   - No field is ever `unwrap()`-ed by callers without checking first.
///   - `Option<T>` fields are None until explicitly loaded — this forces
///     callers to handle "not yet initialised" rather than getting a silent
///     default that masks a load failure.
///   - AppState never touches disk directly — that's the crypto + commands
///     layers. AppState is pure in-memory cache + metadata.
use std::{path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tracing::debug;

use crate::crypto::KeychainStatus;

// ── Settings schema ───────────────────────────────────────────────────────────

/// Mirrors the settings object the renderer already expects.
/// All fields have serde defaults so partial JSON (e.g. missing new fields
/// after an upgrade) deserialises cleanly without error.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_theme")]
    pub theme: String,

    #[serde(default = "default_hour_increment")]
    pub hour_increment: f64,

    #[serde(default)]
    pub project_mode: bool,

    #[serde(default)]
    pub detailed_mode: bool,

    #[serde(default = "default_focus_times")]
    pub focus_times: Vec<String>,

    #[serde(default = "default_warning_time")]
    pub warning_time: String,

    #[serde(default = "default_min_hours_warning")]
    pub min_hours_warning: f64,
}

fn default_theme() -> String {
    "midnight".to_string()
}
fn default_hour_increment() -> f64 {
    0.5
}
fn default_focus_times() -> Vec<String> {
    vec![
        "11:00".to_string(),
        "14:00".to_string(),
        "16:00".to_string(),
    ]
}
fn default_warning_time() -> String {
    "16:30".to_string()
}
fn default_min_hours_warning() -> f64 {
    7.5
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            hour_increment: default_hour_increment(),
            project_mode: false,
            detailed_mode: false,
            focus_times: default_focus_times(),
            warning_time: default_warning_time(),
            min_hours_warning: default_min_hours_warning(),
        }
    }
}

// ── Emergency mode ────────────────────────────────────────────────────────────

/// Describes why the app is in emergency mode and what the user/IT should do.
#[derive(Debug, Clone, Serialize)]
pub struct EmergencyModeInfo {
    /// Human-readable reason shown in the UI.
    pub reason: String,
    /// Whether any encrypted data files were found on disk.
    /// If false, the keychain failed but there's nothing to decrypt — the app
    /// can still start fresh (but won't save until the keychain is restored).
    pub encrypted_data_exists: bool,
}

// ── App-wide state ────────────────────────────────────────────────────────────

/// Central state container. Managed by Tauri and injected into commands.
pub struct AppState {
    /// Where all data files live. Set once at startup, never changes.
    pub data_dir: PathBuf,

    /// Keychain availability — checked once at startup.
    pub keychain_status: KeychainStatus,

    /// If Some, the app is in read-only emergency mode (Decision 1c-ii).
    /// Commands that would write data must check this first.
    pub emergency_mode: Option<EmergencyModeInfo>,

    /// Cached settings. None = not yet loaded from disk.
    /// Always populated by the time the main window is shown.
    pub settings: Mutex<Option<Settings>>,

    /// Tracks whether any data file was found in plaintext (legacy) format
    /// on last load, so the next save will re-encrypt it.
    pub has_legacy_plaintext: Mutex<bool>,
}

impl AppState {
    /// Constructs the initial state. Called from `lib.rs` during app setup
    /// before any windows open, so keychain probe happens before any UI.
    pub fn new(data_dir: PathBuf, keychain_status: KeychainStatus) -> Self {
        debug!("AppState::new — data_dir: {:?}", data_dir);
        Self {
            data_dir,
            keychain_status,
            emergency_mode: None,
            settings: Mutex::new(None),
            has_legacy_plaintext: Mutex::new(false),
        }
    }

    /// Marks the app as being in emergency mode.
    /// This is called from `lib.rs` after determining the keychain is
    /// unavailable AND encrypted data exists on disk.
    pub fn set_emergency_mode(&mut self, reason: String, encrypted_data_exists: bool) {
        self.emergency_mode = Some(EmergencyModeInfo {
            reason,
            encrypted_data_exists,
        });
    }

    /// Returns true if the app should refuse all write operations.
    pub fn is_read_only(&self) -> bool {
        self.emergency_mode.is_some()
    }

    /// Returns true if the keychain is available for encryption operations.
    pub fn keychain_available(&self) -> bool {
        self.keychain_status == KeychainStatus::Available
    }

    /// Path helpers — all data files are always resolved through here so
    /// there's one canonical place to change paths if needed.
    pub fn settings_path(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }

    pub fn sheets_path(&self) -> PathBuf {
        self.data_dir.join("sheets.json")
    }

    pub fn timers_path(&self) -> PathBuf {
        self.data_dir.join("timers.json")
    }

    /// Returns a path for quarantining a corrupt file.
    /// Format: `sheets.json.corrupt.1705123456`
    pub fn quarantine_path(&self, filename: &str) -> PathBuf {
        let timestamp = chrono::Utc::now().timestamp();
        self.data_dir
            .join(format!("{}.corrupt.{}", filename, timestamp))
    }
}

// ── Write guard helper ────────────────────────────────────────────────────────

/// Returned by commands that attempt writes in emergency mode.
/// Serialises to a consistent error shape the renderer can pattern-match on.
#[derive(Debug, Serialize)]
pub struct WriteBlockedError {
    pub code: &'static str,
    pub message: String,
}

impl WriteBlockedError {
    pub fn new(reason: &str) -> Self {
        Self {
            code: "WRITE_BLOCKED_EMERGENCY_MODE",
            message: format!(
                "ChronoWard is in read-only emergency mode and cannot save data. \
                 Reason: {}. Please contact your IT administrator.",
                reason
            ),
        }
    }
}

/// Convenience macro used in command handlers to bail early if in emergency mode.
/// Usage:  `guard_write!(state)?;`
#[macro_export]
macro_rules! guard_write {
    ($state:expr) => {
        if let Some(ref info) = $state.emergency_mode {
            return Err(
                serde_json::to_string(&$crate::state::WriteBlockedError::new(&info.reason))
                    .unwrap_or_else(|_| "WRITE_BLOCKED_EMERGENCY_MODE".to_string()),
            );
        }
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::KeychainStatus;
    use std::path::PathBuf;

    fn make_state(keychain: KeychainStatus) -> AppState {
        AppState::new(PathBuf::from("/tmp/chronoward-test"), keychain)
    }

    #[test]
    fn test_default_settings_are_valid() {
        let s = Settings::default();
        assert_eq!(s.theme, "midnight");
        assert_eq!(s.hour_increment, 0.5);
        assert_eq!(s.min_hours_warning, 7.5);
        assert_eq!(s.focus_times.len(), 3);
    }

    #[test]
    fn test_settings_deserialise_with_missing_fields() {
        // Simulates loading a settings.json that predates a new field.
        let partial = r#"{"theme": "aurora"}"#;
        let s: Settings = serde_json::from_str(partial).unwrap();
        assert_eq!(s.theme, "aurora");
        // Missing fields fall back to defaults
        assert_eq!(s.hour_increment, 0.5);
        assert_eq!(s.warning_time, "16:30");
    }

    #[test]
    fn test_is_read_only_when_emergency_mode_set() {
        let mut state = make_state(KeychainStatus::Unavailable("test".to_string()));
        assert!(!state.is_read_only()); // not yet set
        state.set_emergency_mode("Keychain unavailable".to_string(), true);
        assert!(state.is_read_only());
    }

    #[test]
    fn test_keychain_available_reflects_status() {
        let avail = make_state(KeychainStatus::Available);
        assert!(avail.keychain_available());

        let unavail = make_state(KeychainStatus::Unavailable("locked".to_string()));
        assert!(!unavail.keychain_available());
    }

    #[test]
    fn test_path_helpers_are_correct() {
        let state = make_state(KeychainStatus::Available);
        assert_eq!(
            state.sheets_path(),
            PathBuf::from("/tmp/chronoward-test/sheets.json")
        );
        assert!(state
            .quarantine_path("sheets.json")
            .to_string_lossy()
            .contains("sheets.json.corrupt."));
    }

    #[test]
    fn test_write_blocked_error_serialises() {
        let err = WriteBlockedError::new("keychain locked");
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("WRITE_BLOCKED_EMERGENCY_MODE"));
        assert!(json.contains("keychain locked"));
    }
}
