use std::path::PathBuf;

use tauri::{Emitter, Listener, Manager};
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, EnvFilter};

mod commands;
mod crypto;
mod scheduler;
mod state;
mod tray;

use crypto::{probe_keychain, KeychainStatus};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("chronoward=info,warn")),
        )
        .init();

    info!("ChronoWard starting up");

    let data_dir = resolve_data_dir();
    ensure_data_dir(&data_dir);

    let keychain_status = probe_keychain();

    let emergency = match &keychain_status {
        KeychainStatus::Unavailable(reason) => {
            let encrypted_exists = check_encrypted_data_exists(&data_dir);
            warn!("Keychain unavailable: {reason}. Encrypted data exists: {encrypted_exists}");
            Some((reason.clone(), encrypted_exists))
        }
        KeychainStatus::Available => None,
    };

    let mut app_state = AppState::new(data_dir.clone(), keychain_status);
    if let Some((reason, encrypted_exists)) = emergency {
        app_state.set_emergency_mode(reason, encrypted_exists);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::sheets::load_sheets,
            commands::sheets::save_sheets,
            commands::timers::load_timers,
            commands::timers::save_timers,
            commands::csv::export_csv,
            commands::csv::import_csv,
            commands::csv::get_data_dir,
            commands::window::show_overlay_cmd,
            commands::window::set_always_on_top,
            commands::window::show_window,
            commands::window::minimize_to_tray,
        ])
        .setup(|app| {
            // Set up tray — store the handle so it isn't dropped and disappears
            match tray::setup(app.handle()) {
                Ok(tray_icon) => {
                    app.manage(tray_icon);
                    info!("Tray icon registered");
                }
                Err(e) => error!("Failed to create system tray: {e}"),
            }

            // Show main window on startup — it starts hidden in conf so it can
            // also be used as the minimised-to-tray state. Show it explicitly here.
            if let Some(main) = app.get_webview_window("main") {
                // Small delay to ensure webview content is loaded before showing
            let main_clone = main.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                    let _ = main_clone.show();
                    let _ = main_clone.set_focus();
                });
            }

            // Sync autostart state with the OS on startup, relying on settings defaults
            // if it's the first time running.
            let auto_start = {
                let state = app.state::<AppState>();
                let default_settings = crate::state::Settings::default();
                // Attempt to read settings briefly to govern startup state (or just fallback to default)
                // Actually, settings are async loaded. The plugin persists via OS.
                // We'll let `load_settings` handle this shortly after, but just to be safe:
                let s_path = state.settings_path();
                if let Ok(raw) = std::fs::read_to_string(&s_path) {
                    serde_json::from_str::<crate::state::Settings>(&raw)
                        .unwrap_or(default_settings)
                        .auto_start
                } else {
                    default_settings.auto_start
                }
            };

            use tauri_plugin_autostart::ManagerExt;
            let manager = app.autolaunch();
            if auto_start {
                let _ = manager.enable();
            } else {
                let _ = manager.disable();
            }

            // overlay-clicked → hide overlay, restore main
            let app_handle = app.handle().clone();
            app.listen("overlay-clicked", move |_| {
                if let Some(overlay) = app_handle.get_webview_window("overlay") {
                    let _ = overlay.hide();
                }
                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            });

            // warning-active → restore main if hidden
            let app_handle2 = app.handle().clone();
            app.listen("warning-active", move |_| {
                if let Some(main) = app_handle2.get_webview_window("main") {
                    if !main.is_visible().unwrap_or(true) {
                        let _ = main.show();
                        let _ = main.set_focus();
                    }
                }
            });

            // renderer-ready → emit emergency-mode if needed
            let app_handle3 = app.handle().clone();
            app.listen("renderer-ready", move |_| {
                let state = app_handle3.state::<AppState>();
                if let Some(ref info) = state.emergency_mode {
                    let _ = app_handle3.emit("emergency-mode", info);
                    info!("Emitted emergency-mode event to renderer");
                }
            });

            scheduler::spawn(app.handle().clone());
            info!("App setup complete");
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                    commands::window::show_overlay(window.app_handle());
                }
            }
            tauri::WindowEvent::Resized(size) => {
                if window.label() == "main" && size.width == 0 && size.height == 0 {
                    let _ = window.unminimize();
                    let _ = window.hide();
                    commands::window::show_overlay(window.app_handle());
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("Error running ChronoWard");
}

fn resolve_data_dir() -> PathBuf {
    let base = dirs::data_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".local").join("share")))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("ChronoWard").join("timesheet-data")
}

fn ensure_data_dir(dir: &PathBuf) {
    if !dir.exists() {
        if let Err(e) = std::fs::create_dir_all(dir) {
            error!("Failed to create data directory {:?}: {e}", dir);
            return;
        }
        info!("Created data directory: {:?}", dir);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::Permissions::from_mode(0o700);
            if let Err(e) = std::fs::set_permissions(dir, perms) {
                warn!("Failed to set data directory permissions: {e}");
            }
        }
    }
}

fn check_encrypted_data_exists(data_dir: &std::path::Path) -> bool {
    for filename in &["sheets.json", "timers.json", "settings.json"] {
        let path = data_dir.join(filename);
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if content.trim_start().starts_with("enc1:") {
                    return true;
                }
            }
        }
    }
    false
}
