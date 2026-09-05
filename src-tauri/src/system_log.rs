use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemLogEvent {
    pub log_type: String,
    pub message: String,
}

pub fn emit_system_log(
    app: &AppHandle,
    log_type: &str,
    message: impl Into<String>,
) {
    let message = message.into();

    println!("[{}] {}", log_type, message);

    let payload = SystemLogEvent {
        log_type: log_type.to_string(),
        message,
    };

    if let Err(error) = app.emit("system-log", payload) {
        eprintln!(
            "[SYSTEM LOG] Unable to emit system-log event: {}",
            error
        );
    }
}