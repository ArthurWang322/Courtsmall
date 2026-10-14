// The desktop shell: one borderless, always-on-top window that starts in the screen's corner, system
// notifications, and a tray menu to show, hide, pick a game, choose a team and quit (the window has no title
// bar to close it from).

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager};

/// A window's place and size, in logical pixels.
#[derive(serde::Deserialize)]
struct Placed {
    label: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

/// Places windows together, size then position each, in one call: a glide to the screen's corner
/// sends one a frame (src/ui/main.ts glide), and two calls from the web view would wobble.
#[tauri::command]
fn place(app: tauri::AppHandle, rects: Vec<Placed>) {
    for r in rects {
        if let Some(w) = app.get_webview_window(&r.label) {
            let _ = w.set_size(LogicalSize::new(r.w, r.h));
            let _ = w.set_position(LogicalPosition::new(r.x, r.y));
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        // The keys are taken and handled by the web view (src/ui/shortcuts.ts).
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Update from the settings (src/ui/update.ts): signed releases on GitHub, then a restart.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let toggle = MenuItem::with_id(app, "toggle", "Show / hide", true, None::<&str>)?;
            let games = MenuItem::with_id(app, "games", "Games…", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Team and notices…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Courtsmall", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&toggle, &games, &settings, &separator, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("bundled icon"))
                .tooltip("Courtsmall")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    let Some(window) = app.get_webview_window("main") else { return };
                    match event.id().as_ref() {
                        // The stats beside it hide and show with it.
                        "toggle" => {
                            let visible = window.is_visible().unwrap_or(true);
                            for label in ["players", "linescore", "main"] {
                                if let Some(w) = app.get_webview_window(label) {
                                    let _ = if visible { w.hide() } else { w.show() };
                                }
                            }
                        }
                        // The web view opens its panels (src/ui/main.ts).
                        "games" => {
                            let _ = window.show();
                            let _ = window.emit("open-games", ());
                        }
                        "settings" => {
                            let _ = window.show();
                            let _ = window.emit("open-settings", ());
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![place])
        .run(tauri::generate_context!())
        .expect("error while running Courtsmall");
}
