// The desktop shell: one borderless, always-on-top window, its position remembered, system
// notifications, and a tray menu to show, hide, pick a game, choose a team and quit (the window has no title
// bar to close it from).

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};
use tauri_plugin_window_state::StateFlags;

pub fn run() {
    tauri::Builder::default()
        // Size is the tier (dot or bar) and is set by the web view; only the position is kept.
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(StateFlags::POSITION).build())
        .plugin(tauri_plugin_notification::init())
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
                        "toggle" => {
                            if window.is_visible().unwrap_or(true) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
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
        .run(tauri::generate_context!())
        .expect("error while running Courtsmall");
}
