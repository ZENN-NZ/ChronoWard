/// commands/csv.rs — export_csv, import_csv, get_data_dir
///
/// CSV export intentionally writes PLAINTEXT — this is the user's deliberate
/// choice to export their data. The save dialog makes the destination visible.
///
/// Import reads from user-selected files — no path traversal risk since
/// the dialog constrains selection to the user's accessible filesystem.
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use tracing::info;

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportCsvPayload {
    pub content: String,
    pub date: String,
}

#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub success: bool,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportedFile {
    pub path: String,
    pub name: String,
    pub content: String,
}

/// Presents a save dialog and writes CSV content to the chosen path.
/// The content is passed in from the renderer (already formatted).
#[tauri::command]
pub async fn export_csv(
    payload: ExportCsvPayload,
    app: tauri::AppHandle,
) -> Result<ExportResult, String> {
    let default_name = format!("timesheet_{}.csv", payload.date);

    // Build the save dialog
    let file_path = app
        .dialog()
        .file()
        .set_title("Export Timesheet")
        .set_file_name(&default_name)
        .add_filter("CSV Files", &["csv"])
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let path_buf: PathBuf = path.into_path().expect("Failed to parse file path");
            tokio::fs::write(&path_buf, &payload.content)
                .await
                .map_err(|e| format!("Failed to write CSV: {e}"))?;
            info!("CSV exported to {:?}", path_buf);
            Ok(ExportResult {
                success: true,
                path: Some(path_buf.to_string_lossy().to_string()),
            })
        }
        None => Ok(ExportResult {
            success: false,
            path: None,
        }),
    }
}

/// Presents an open dialog (multi-select) and reads the selected CSV files.
/// Returns file content to the renderer for parsing — the renderer already
/// has the CSV parsing logic in app.js and we keep it there.
#[tauri::command]
pub async fn import_csv(app: tauri::AppHandle) -> Result<Vec<ImportedFile>, String> {
    let file_paths = app
        .dialog()
        .file()
        .set_title("Import CSV Timesheets")
        .add_filter("CSV Files", &["csv"])
        .blocking_pick_files();

    match file_paths {
        Some(paths) => {
            let mut results = Vec::new();
            for path in paths {
                let path_buf: PathBuf = path.into_path().expect("Failed to parse file path");
                let name = path_buf
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "unknown.csv".to_string());

                let content = tokio::fs::read_to_string(&path_buf)
                    .await
                    .map_err(|e| format!("Failed to read {:?}: {e}", path_buf))?;

                results.push(ImportedFile {
                    path: path_buf.to_string_lossy().to_string(),
                    name,
                    content,
                });
            }
            info!("Imported {} CSV file(s)", results.len());
            Ok(results)
        }
        None => Ok(vec![]),
    }
}

/// Returns the data directory path for display in the UI (e.g. settings page).
/// Never returns a path that could be used for traversal — it's display-only.
#[tauri::command]
pub fn get_data_dir(state: State<'_, AppState>) -> String {
    state.data_dir.to_string_lossy().to_string()
}
