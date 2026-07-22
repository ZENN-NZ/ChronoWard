use tauri::{Emitter, Manager, WebviewWindow};
use tracing::{debug, warn};

use crate::state::AppState;

#[tauri::command]
pub fn set_warning_active(active: bool, app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut flag = state.warning_active.lock().unwrap_or_else(|e| e.into_inner());
    *flag = active;
    let _ = app.emit("warning-state-changed", active);
    debug!("set_warning_active: {active}");
    Ok(())
}

#[tauri::command]
pub fn is_warning_active(app: tauri::AppHandle) -> Result<bool, String> {
    let state = app.state::<AppState>();
    let flag = state.warning_active.lock().unwrap_or_else(|e| e.into_inner());
    Ok(*flag)
}

#[tauri::command]
pub fn set_always_on_top(value: bool, app: tauri::AppHandle) -> Result<(), String> {
    let window = get_main_window(&app)?;
    window
        .set_always_on_top(value)
        .map_err(|e| format!("Failed to set always-on-top: {e}"))?;
    debug!("set_always_on_top: {value}");
    Ok(())
}

#[tauri::command]
pub fn show_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
    let window = get_main_window(&app)?;
    window
        .show()
        .map_err(|e| format!("Failed to show window: {e}"))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus window: {e}"))?;
    debug!("show_window called");
    Ok(())
}

#[tauri::command]
pub fn minimize_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    let window = get_main_window(&app)?;
    window
        .hide()
        .map_err(|e| format!("Failed to hide window: {e}"))?;
    show_overlay(&app);
    debug!("minimize_to_tray called");
    Ok(())
}

#[tauri::command]
pub fn show_overlay_cmd(app: tauri::AppHandle) {
    show_overlay(&app);
}

pub fn show_overlay(app: &tauri::AppHandle) {
    if let Some(overlay) = app.get_webview_window("overlay") {
        let position = {
            let state = app.state::<AppState>();
            let cache = state.settings.lock().unwrap_or_else(|e| e.into_inner());
            cache
                .as_ref()
                .map(|s| s.overlay_position.clone())
                .unwrap_or_else(|| "top-right".to_string())
        };

        if let Ok(Some(monitor)) = overlay.primary_monitor() {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let win_size = 64.0;
            let margin = 12.0;
            let taskbar_margin = 48.0;

            let monitor_w = size.width as f64 / scale;
            let monitor_h = size.height as f64 / scale;

            let (x, y) = match position.as_str() {
                "top-left" => (margin, margin),
                "center-left" => (margin, (monitor_h - win_size) / 2.0),
                "bottom-left" => (margin, monitor_h - win_size - margin - taskbar_margin),
                "center-right" => (monitor_w - win_size - margin, (monitor_h - win_size) / 2.0),
                "bottom-right" => (
                    monitor_w - win_size - margin,
                    monitor_h - win_size - margin - taskbar_margin,
                ),
                _ => (monitor_w - win_size - margin, margin),
            };

            let _ = overlay.set_position(tauri::PhysicalPosition::new(
                (x * scale) as i32,
                (y * scale) as i32,
            ));
        }
        let _ = overlay.set_shadow(false);
        let _ = overlay.show();
        let _ = overlay.set_always_on_top(true);
        let _ = app.emit("overlay-position-changed", position);
        let _ = app.emit("overlay-shown", ());
    } else {
        warn!("Overlay window not found");
    }
}

fn get_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}
