/// commands/csv.rs — export_csv, import_csv, get_data_dir
///
/// CSV export intentionally writes PLAINTEXT — this is the user's deliberate
/// choice to export their data. The save dialog makes the destination visible.
///
/// Import reads from user-selected files — no path traversal risk since
/// the dialog constrains selection to the user's accessible filesystem.
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
            let path_buf: PathBuf = path.into_path().map_err(|_| "Failed to parse file path".to_string())?;
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
