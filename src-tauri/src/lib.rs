mod gmail;
mod system_log;
mod windows_notifications;
mod cloudflare;

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{
        MouseButton,
        MouseButtonState,
        TrayIconBuilder,
        TrayIconEvent,
    },
    Manager,
    State,
};

struct AppState {
    unread_count: Mutex<u32>,
}

#[tauri::command]
fn get_unread_count(
    state: State<AppState>,
) -> u32 {
    *state
        .unread_count
        .lock()
        .unwrap()
}

#[tauri::command]
fn set_unread_count(
    count: u32,
    state: State<AppState>,
) {
    let mut unread_count = state
        .unread_count
        .lock()
        .unwrap();

    *unread_count = count;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            unread_count: Mutex::new(0),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            cloudflare::configure_google_oauth,
            gmail::commands::connect_gmail,
            gmail::commands::cancel_gmail_connect,
            gmail::commands::restore_gmail,
            gmail::commands::disconnect_gmail,
            gmail::commands::list_gmail_accounts,
            gmail::commands::restore_gmail_accounts,
            gmail::commands::disconnect_gmail_account,
            gmail::commands::set_primary_gmail_account,
            get_unread_count,
            set_unread_count,
            windows_notifications::request_windows_notification_access,
            windows_notifications::get_windows_notifications,
            windows_notifications::remove_windows_notification,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle().plugin(
                    tauri_plugin_autostart::init(
                        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                        None,
                    ),
                )?;
            }

            let open = MenuItem::with_id(
                app,
                "open",
                "Open Notificator",
                true,
                None::<&str>,
            )?;

            let hide = MenuItem::with_id(
                app,
                "hide",
                "Hide Notificator",
                true,
                None::<&str>,
            )?;

            let quit = MenuItem::with_id(
                app,
                "quit",
                "Exit Notificator",
                true,
                None::<&str>,
            )?;

            let menu = Menu::with_items(
                app,
                &[&open, &hide, &quit],
            )?;

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("Notificator")
                .menu(&menu)
                .show_menu_on_left_click(false);

            if let Some(icon) = app.default_window_icon() {
                tray_builder =
                    tray_builder.icon(icon.clone());
            }

            tray_builder
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "open" => {
                            show_main_window(app);
                        }

                        "hide" => {
                            hide_main_window(app);
                        }

                        "quit" => {
                            app.exit(0);
                        }

                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state:
                            MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app =
                            tray.app_handle();

                        show_main_window(app);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Notificator");
}

fn show_main_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) {
    if let Some(window) =
        app.get_webview_window("main")
    {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) {
    if let Some(window) =
        app.get_webview_window("main")
    {
        let _ = window.hide();
    }
}