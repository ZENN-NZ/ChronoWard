#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
/// main.rs — ChronoWard entry point
///
/// Intentionally minimal. All app logic lives in lib.rs so it can be
/// tested without a binary context and potentially reused for a CLI mode.
///
// Prevents a console window from appearing on Windows in release builds.
fn main() {
    chronoward_lib::run();
}
