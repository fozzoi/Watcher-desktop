#[tauri::command]
fn open_in_browser(url: String) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    let _ = Command::new("cmd").args(["/c", "start", "", &url]).spawn();
  }
  #[cfg(target_os = "macos")]
  {
    use std::process::Command;
    let _ = Command::new("open").arg(&url).spawn();
  }
  #[cfg(target_os = "linux")]
  {
    use std::process::Command;
    let _ = Command::new("xdg-open").arg(&url).spawn();
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![open_in_browser])
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
