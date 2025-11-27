// src-tauri/src/command.rs
// NOTE: 폰트 관련 커맨드는 fonts.rs에만 존재해야 합니다.
// 여기에는 프리셋 폴더 열기 등 "기타" 커맨드만 둡니다.

#[tauri::command]
pub fn reveal_preset_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn sw_trash_path(path: String) -> Result<(), String> {
    // Move to OS recycle bin (Windows / macOS / Linux)
    trash::delete(path).map_err(|e| e.to_string())
}