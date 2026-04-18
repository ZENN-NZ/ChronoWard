use tauri::{Manager, WebviewWindow};
use tracing::{debug, warn};

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
        // Position top-right of primary monitor, 12px margin
        if let Ok(Some(monitor)) = overlay.primary_monitor() {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let win_size = 64.0;
            let margin = 12.0;
            let x = (size.width as f64 / scale) - win_size - margin;
            let y = margin;
            let _ = overlay.set_position(tauri::PhysicalPosition::new(
                (x * scale) as i32,
                (y * scale) as i32,
            ));
        }
        let _ = overlay.show();
        let _ = overlay.set_always_on_top(true);
    } else {
        warn!("Overlay window not found");
    }
}

fn get_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}
