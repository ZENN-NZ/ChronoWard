/// commands/csv.rs — export_csv
///
/// CSV export intentionally writes PLAINTEXT — this is the user's deliberate
/// choice to export their data. The save dialog makes the destination visible.
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri_plugin_dialog::DialogExt;
use tracing::info;

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

/// Presents a save dialog and writes CSV content to the chosen path.
/// The content is passed in from the renderer (already formatted).
#[tauri::command]
pub async fn export_csv(
    window: tauri::WebviewWindow,
    payload: ExportCsvPayload,
    app: tauri::AppHandle,
) -> Result<ExportResult, String> {
    if window.label() != "main" {
        return Err("Unauthorized window for export_csv".to_string());
    }

    let default_name = format!("timesheet_{}.csv", payload.date);

    // Run blocking OS file dialog on a blocking thread pool worker
    let file_path = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Export Timesheet")
            .set_file_name(&default_name)
            .add_filter("CSV Files", &["csv"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("Save dialog task failed: {e}"))?;

    match file_path {
        Some(path) => {
            let path_buf: PathBuf = path
                .into_path()
                .map_err(|_| "Failed to parse file path".to_string())?;
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
