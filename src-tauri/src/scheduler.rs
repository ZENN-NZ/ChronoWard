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
use std::collections::HashSet;
use std::time::Duration;

use chrono::{Datelike, Local, Timelike};
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

    // Track (year, ordinal_day, hour, minute) of focus times already triggered today
    let mut triggered_focus: HashSet<(i32, u32, u32, u32)> = HashSet::new();
    let mut last_warning_minute: Option<(i32, u32, u32, u32)> = None;

    loop {
        interval.tick().await;
        tick(&app, &mut triggered_focus, &mut last_warning_minute).await;
    }
}

async fn tick(
    app: &AppHandle,
    triggered_focus: &mut HashSet<(i32, u32, u32, u32)>,
    last_warning_minute: &mut Option<(i32, u32, u32, u32)>,
) {
    let now = Local::now();
    let year = now.year();
    let day = now.ordinal();
    let hour = now.hour();
    let minute = now.minute();
    let current_secs = hour * 3600 + minute * 60 + now.second();
    let current_time_key = (year, day, hour, minute);

    // Housekeeping: purge old entries from triggered_focus on new day
    triggered_focus.retain(|(y, d, _, _)| *y == year && *d == day);

    // Read settings from cache — no disk I/O on hot path
    let settings = {
        let state = app.state::<AppState>();
        let cache = state.settings.lock().unwrap_or_else(|e| e.into_inner());
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
    // Fire exactly once per configured focus time minute on any given day.
    for focus_time_str in &settings.focus_times {
        if let Some((fh, fm)) = parse_hhmm(focus_time_str) {
            if hour == fh && minute == fm {
                let key = (year, day, fh, fm);
                if !triggered_focus.contains(&key) {
                    triggered_focus.insert(key);
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
    }

    // ── Hours warning ─────────────────────────────────────────────────────────
    // After the configured warning time, check status at most once per minute.
    if let Some((wh, wm)) = parse_hhmm(&settings.warning_time) {
        let warning_secs = wh * 3600 + wm * 60;
        if current_secs >= warning_secs {
            if *last_warning_minute != Some(current_time_key) {
                *last_warning_minute = Some(current_time_key);
                let warning_active = {
                    let state = app.state::<AppState>();
                    let guard = state.warning_active.lock().unwrap_or_else(|e| e.into_inner());
                    *guard
                };
                if warning_active {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                let _ = app.emit("check-hours-warning", ());
            }
        }
    }
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
