/// scheduler.rs — focus time and hours warning scheduler
///
/// Runs as a Tokio background task spawned once at startup. Fires events to
/// the renderer window rather than manipulating windows directly, keeping the
/// scheduler logic testable and decoupled from window state.
///
/// Events emitted:
///   "focus-time-trigger"   → renderer should surface the window briefly
///   "check-hours-warning"  → renderer should check total hours vs threshold
///
/// The scheduler reads settings from AppState cache (never from disk) so it
/// never adds I/O pressure on the 5-second tick.
use std::time::Duration;

use chrono::{Local, Timelike};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time;
use tracing::{debug, info};

use crate::state::AppState;

const TICK_INTERVAL_SECS: u64 = 5;

/// Spawns the scheduler as a detached Tokio task.
/// Called from lib.rs after the app is set up.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        run(app).await;
    });
    info!("Scheduler spawned");
}

async fn run(app: AppHandle) {
    let mut interval = time::interval(Duration::from_secs(TICK_INTERVAL_SECS));
    // First tick fires immediately — skip it to avoid firing events before
    // the renderer is ready.
    interval.tick().await;

    loop {
        interval.tick().await;
        tick(&app).await;
    }
}

async fn tick(app: &AppHandle) {
    let now = Local::now();
    let current_secs = now.hour() * 3600 + now.minute() * 60 + now.second();

    // Read settings from cache — no disk I/O on hot path
    let settings = {
        let state = app.state::<AppState>();
        let cache = state.settings.lock().unwrap();
        cache.clone()
    };

    let settings = match settings {
        Some(s) => s,
        None => {
            // Settings not yet loaded — skip this tick
            debug!("Scheduler tick: settings not yet loaded, skipping");
            return;
        }
    };

    // ── Focus time reminders ──────────────────────────────────────────────────
    // Fire when current time is within one tick window of a configured focus time.
    // The ±(TICK+1) window prevents missing a trigger if the tick lands just
    // before or after the exact second.
    let window_secs = TICK_INTERVAL_SECS as u32 + 1;

    for focus_time_str in &settings.focus_times {
        if let Some((fh, fm)) = parse_hhmm(focus_time_str) {
            let focus_secs = fh * 3600 + fm * 60;
            let diff = current_secs.abs_diff(focus_secs);
            if diff < window_secs {
                debug!("Focus time trigger: {focus_time_str}");
                if let Some(window) = app.get_webview_window("main") {
                    // Bring window to front temporarily
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.set_always_on_top(true);

                    // Release always-on-top after 5 seconds
                    let window_clone = window.clone();
                    tokio::spawn(async move {
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        let _ = window_clone.set_always_on_top(false);
                    });
                }
                // Notify renderer so it can play a subtle UI indicator
                let _ = app.emit("focus-time-trigger", focus_time_str);
            }
        }
    }

    // ── Hours warning ─────────────────────────────────────────────────────────
    // After the configured warning time, tell the renderer to check its totals.
    // The renderer owns the actual hours data — we just prod it.
    if let Some((wh, wm)) = parse_hhmm(&settings.warning_time) {
        let warning_secs = wh * 3600 + wm * 60;
        if current_secs >= warning_secs {
            let _ = app.emit("check-hours-warning", ());
        }
    }

    // ── Idle detection ────────────────────────────────────────────────────────
    // Idle detection (auto-minimize after 1 min unfocused) is handled entirely
    // on the frontend via mousemove/keydown tracking, as it was in Electron.
    // The scheduler doesn't need to be involved.
}

/// Parses "HH:MM" into (hours, minutes) as u32. Returns None on invalid input.
fn parse_hhmm(s: &str) -> Option<(u32, u32)> {
    let mut parts = s.splitn(2, ':');
    let h: u32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some((h, m))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hhmm_valid() {
        assert_eq!(parse_hhmm("11:00"), Some((11, 0)));
        assert_eq!(parse_hhmm("16:30"), Some((16, 30)));
        assert_eq!(parse_hhmm("00:00"), Some((0, 0)));
        assert_eq!(parse_hhmm("23:59"), Some((23, 59)));
    }

    #[test]
    fn test_parse_hhmm_invalid() {
        assert_eq!(parse_hhmm("25:00"), None); // hour out of range
        assert_eq!(parse_hhmm("11:60"), None); // minute out of range
        assert_eq!(parse_hhmm("notaTime"), None);
        assert_eq!(parse_hhmm(""), None);
        assert_eq!(parse_hhmm("11"), None); // missing minutes
    }

    #[test]
    fn test_parse_hhmm_boundary() {
        assert_eq!(parse_hhmm("00:01"), Some((0, 1)));
        assert_eq!(parse_hhmm("23:00"), Some((23, 0)));
    }
}
