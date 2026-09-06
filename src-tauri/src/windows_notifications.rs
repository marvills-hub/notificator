use serde::Serialize;
use windows::UI::Notifications::{
    KnownNotificationBindings,
    Management::{
        UserNotificationListener,
        UserNotificationListenerAccessStatus,
    },
    NotificationKinds,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAccessResult {
    pub allowed: bool,
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsNotification {
    pub id: u32,
    pub app_name: String,
    pub title: String,
    pub body: String,
    pub text_lines: Vec<String>,
}

#[tauri::command]
pub fn request_windows_notification_access() -> Result<NotificationAccessResult, String> {
    let listener = UserNotificationListener::Current()
        .map_err(|error| format!("Unable to get Windows notification listener: {error}"))?;

    let operation = listener
        .RequestAccessAsync()
        .map_err(|error| format!("Unable to request notification access: {error}"))?;

    let status = operation
        .get()
        .map_err(|error| format!("Windows notification permission request failed: {error}"))?;

    let result = match status {
        UserNotificationListenerAccessStatus::Allowed => NotificationAccessResult {
            allowed: true,
            status: "allowed".to_string(),
        },
        UserNotificationListenerAccessStatus::Denied => NotificationAccessResult {
            allowed: false,
            status: "denied".to_string(),
        },
        UserNotificationListenerAccessStatus::Unspecified => NotificationAccessResult {
            allowed: false,
            status: "unspecified".to_string(),
        },
        _ => NotificationAccessResult {
            allowed: false,
            status: "unknown".to_string(),
        },
    };

    Ok(result)
}

#[tauri::command]
pub fn get_windows_notifications() -> Result<Vec<WindowsNotification>, String> {
    let listener = UserNotificationListener::Current()
        .map_err(|error| format!("Unable to get Windows notification listener: {error}"))?;

    let operation = listener
        .GetNotificationsAsync(NotificationKinds::Toast)
        .map_err(|error| format!("Unable to read Windows notifications: {error}"))?;

    let notifications = operation
        .get()
        .map_err(|error| format!("Unable to load Windows notifications: {error}"))?;

    let size = notifications
        .Size()
        .map_err(|error| format!("Unable to read notification count: {error}"))?;

    let mut results = Vec::new();

    for index in 0..size {
        let notification = notifications
            .GetAt(index)
            .map_err(|error| format!("Unable to read notification: {error}"))?;

        let id = notification
            .Id()
            .map_err(|error| format!("Unable to read notification ID: {error}"))?;

        let app_name = notification
            .AppInfo()
            .and_then(|app| app.DisplayInfo())
            .and_then(|display| display.DisplayName())
            .map(|name| name.to_string())
            .unwrap_or_else(|_| "Unknown".to_string());

        let mut text_lines = Vec::new();

        if let Ok(notification_data) = notification.Notification() {
            if let Ok(visual) = notification_data.Visual() {
                if let Ok(template_name) = KnownNotificationBindings::ToastGeneric() {
                    if let Ok(binding) = visual.GetBinding(&template_name) {
                        if let Ok(text_elements) = binding.GetTextElements() {
                            if let Ok(text_count) = text_elements.Size() {
                                for text_index in 0..text_count {
                                    if let Ok(text_element) = text_elements.GetAt(text_index) {
                                        if let Ok(text) = text_element.Text() {
                                            let value = text.to_string().trim().to_string();

                                            if !value.is_empty() {
                                                text_lines.push(value);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let title = text_lines
            .first()
            .cloned()
            .unwrap_or_default();

        let body = if text_lines.len() > 1 {
            text_lines[1..].join(" | ")
        } else {
            String::new()
        };

        results.push(WindowsNotification {
            id,
            app_name,
            title,
            body,
            text_lines,
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn remove_windows_notification(id: u32) -> Result<(), String> {
    let listener = UserNotificationListener::Current()
        .map_err(|error| format!("Unable to get Windows notification listener: {error}"))?;

    listener
        .RemoveNotification(id)
        .map_err(|error| format!("Unable to remove Windows notification: {error}"))?;

    Ok(())
}