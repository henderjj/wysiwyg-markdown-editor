// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[derive(Clone, serde::Serialize)]
struct SingleInstancePayload {
    args: Vec<String>,
    cwd: String,
}

struct CliState {
    file_path: Mutex<Option<String>>,
}

struct DirtyState {
    has_unsaved: AtomicBool,
    dialog_showing: AtomicBool,
}

#[tauri::command]
fn get_cli_file_path(state: tauri::State<CliState>) -> Option<String> {
    state.file_path.lock().unwrap().take()
}

#[tauri::command]
fn set_unsaved_changes(state: tauri::State<DirtyState>, has_unsaved: bool) {
    state.has_unsaved.store(has_unsaved, Ordering::SeqCst);
}

#[tauri::command]
fn force_exit(window: tauri::Window) {
    let _ = window.destroy();
}

fn main() {
    // Check CLI args for a .md/.markdown file path
    let cli_path = std::env::args().nth(1).and_then(|arg| {
        let lower = arg.to_lowercase();
        if lower.ends_with(".md") || lower.ends_with(".markdown") {
            // Canonicalize to absolute path
            std::path::Path::new(&arg)
                .canonicalize()
                .ok()
                .map(|p| p.to_string_lossy().into_owned())
        } else {
            None
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // Focus existing window
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
            // Forward args to frontend so it can open the file
            let _ = app.emit("single-instance", SingleInstancePayload {
                args: argv,
                cwd,
            });
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(CliState {
            file_path: Mutex::new(cli_path),
        })
        .manage(DirtyState {
            has_unsaved: AtomicBool::new(false),
            dialog_showing: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            get_cli_file_path,
            set_unsaved_changes,
            force_exit
        ])
        .setup(|app| {
            // Window starts hidden (visible: false in tauri.conf.json) so the
            // window-state plugin can restore size/position before the user sees
            // anything.  Show it now that setup is complete.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let dirty = window.state::<DirtyState>();

                if !dirty.has_unsaved.load(Ordering::SeqCst) {
                    // No unsaved changes — let the window close normally
                    return;
                }

                // Prevent the close so we can show a dialog
                api.prevent_close();

                // Guard against duplicate dialogs
                if dirty
                    .dialog_showing
                    .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                    .is_err()
                {
                    return;
                }

                let win = window.clone();
                window
                    .dialog()
                    .message("You have unsaved changes. Close the application anyway?")
                    .title("Unsaved Changes")
                    .kind(MessageDialogKind::Warning)
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Close".to_string(),
                        "Cancel".to_string(),
                    ))
                    .show(move |confirmed| {
                        let dirty = win.state::<DirtyState>();
                        dirty.dialog_showing.store(false, Ordering::SeqCst);
                        if confirmed {
                            let _ = win.destroy();
                        }
                    });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
