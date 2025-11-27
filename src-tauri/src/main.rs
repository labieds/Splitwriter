#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod fonts;
mod command;

use fonts::list_fonts;
use command::{reveal_preset_folder, sw_trash_path};

use tauri::{
  CustomMenuItem, Manager, Menu, Submenu, WindowUrl
};

// (선택) 이미 쓰고 있는 command. 필요하면 generate_handler에 포함
#[tauri::command]
fn cmd_open_image_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_window("open_image") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    tauri::WindowBuilder::new(
        &app,
        "open_image",
        WindowUrl::App("index.html#/open-image".into()),
    )
    .title("Open_Image")
    .inner_size(900.0, 700.0)
    .resizable(true)
    .visible(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn main() {
    // 1) File 메뉴 구성: 가속기는 CmdOrCtrl로(Win=Ctrl, macOS=Cmd)
    let m_new     = CustomMenuItem::new("sw-new",  "New").accelerator("CmdOrCtrl+N");
    let m_open    = CustomMenuItem::new("sw-open", "Open…").accelerator("CmdOrCtrl+O");
    let m_save    = CustomMenuItem::new("sw-save", "Save").accelerator("CmdOrCtrl+S");
    let m_save_as = CustomMenuItem::new("sw-saveas", "Save As…").accelerator("CmdOrCtrl+Shift+S");

    let file_menu = Submenu::new("File", Menu::new()
        .add_item(m_new)
        .add_item(m_open)
        .add_native_item(tauri::MenuItem::Separator)
        .add_item(m_save)
        .add_item(m_save_as)
    );

    let menu = Menu::new().add_submenu(file_menu);

    tauri::Builder::default()
        // 2) 메뉴를 앱에 장착
        .menu(menu)
        // 3) 메뉴 선택 → 현재 윈도우로 이벤트 emit (프런트에서 listen)
        .on_menu_event(|event| {
            match event.menu_item_id() {
                "sw-new"    => { let _ = event.window().emit("sw:new", ()); }
                "sw-open"   => { let _ = event.window().emit("sw:open", ()); }
                "sw-save"   => { let _ = event.window().emit("sw:save", ()); }
                "sw-saveas" => { let _ = event.window().emit("sw:saveas", ()); }
                _ => {}
            }
        })
        // 4) 프런트에서 쓰는 커맨드들 노출
        .invoke_handler(tauri::generate_handler![
            sw_trash_path,
            list_fonts,
            reveal_preset_folder,
            cmd_open_image_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
