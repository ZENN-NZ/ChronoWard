/// tray.rs — system tray setup and management
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tracing::{error, info, warn};

pub fn setup(app: &AppHandle) -> Result<TrayIcon, tauri::Error> {
    let open = MenuItem::with_id(app, "open", "Open ChronoWard", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &separator, &quit])?;

    let icon = load_tray_icon(app);

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("ChronoWard — click to open")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => restore_main_window(app),
            "quit" => {
                info!("Quit requested from tray menu");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                restore_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    info!("System tray created");
    Ok(tray)
}

pub fn restore_main_window(app: &AppHandle) {
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.show() {
            error!("Failed to show main window: {e}");
        }
        if let Err(e) = window.set_focus() {
            error!("Failed to focus main window: {e}");
        }
    }
}

/// Loads the tray icon. Primary path: resolve at runtime via the resource
/// directory. Fallback: include_bytes! baked into the binary at compile time.
/// Both return Image<'static> so there are no lifetime issues.
fn load_tray_icon(app: &AppHandle) -> Image<'static> {
    let icon_path = app
        .path()
        .resolve("icons/icon.png", tauri::path::BaseDirectory::Resource);

    match icon_path {
        Ok(path) => match Image::from_path(&path) {
            Ok(img) => {
                info!("Tray icon loaded from {:?}", path);
                img
            }
            Err(e) => {
                warn!("Failed to load tray icon from path: {e} — using compiled fallback");
                bundled_icon()
            }
        },
        Err(e) => {
            warn!("Could not resolve icon resource path: {e} — using compiled fallback");
            bundled_icon()
        }
    }
}

/// Fallback: the icon PNG bytes are baked into the binary at compile time
/// via include_bytes!, making this unconditionally 'static.
fn bundled_icon() -> Image<'static> {
    Image::from_bytes(include_bytes!("../icons/icon.png")).unwrap_or_else(|e| {
        error!("Failed to decode bundled icon bytes: {e}");
        Image::new(&[], 0, 0)
    })
}
