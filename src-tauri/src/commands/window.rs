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

        if let Ok(Some(monitor)) = overlay.current_monitor() {
            let work_area = monitor.work_area();
            let scale = monitor.scale_factor();
            let win_size = (64.0 * scale) as i32;
            let margin = (12.0 * scale) as i32;

            let origin_x = work_area.position.x;
            let origin_y = work_area.position.y;
            let work_w = work_area.size.width as i32;
            let work_h = work_area.size.height as i32;

            let (x, y) = match position.as_str() {
                "top-left" => (origin_x + margin, origin_y + margin),
                "center-left" => (origin_x + margin, origin_y + (work_h - win_size) / 2),
                "bottom-left" => (origin_x + margin, origin_y + work_h - win_size - margin),
                "center-right" => (
                    origin_x + work_w - win_size - margin,
                    origin_y + (work_h - win_size) / 2,
                ),
                "bottom-right" => (
                    origin_x + work_w - win_size - margin,
                    origin_y + work_h - win_size - margin,
                ),
                _ => (origin_x + work_w - win_size - margin, origin_y + margin),
            };

            let _ = overlay.set_position(tauri::PhysicalPosition::new(x, y));
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

#[tauri::command]
pub fn toggle_hud_cmd(app: tauri::AppHandle) {
    toggle_hud(&app);
}

#[tauri::command]
pub fn hide_hud_cmd(app: tauri::AppHandle) {
    if let Some(hud) = app.get_webview_window("hud") {
        let _ = hud.hide();
    }
}

pub fn toggle_hud(app: &tauri::AppHandle) {
    if let Some(hud) = app.get_webview_window("hud") {
        let is_visible = hud.is_visible().unwrap_or(false);
        if is_visible {
            let _ = hud.hide();
        } else {
            let _ = hud.center();
            let _ = hud.show();
            let _ = hud.set_focus();
            let _ = app.emit("hud-opened", ());
        }
    } else {
        warn!("HUD window not found");
    }
}



fn get_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}
