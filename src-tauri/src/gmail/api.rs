use crate::system_log::emit_system_log;
use reqwest::Client;
use std::time::Duration;
use tauri::AppHandle;

use super::messages::fetch_gmail_messages;
use super::models::{
    GmailConnectionResult,
    GmailLabelResponse,
    GmailProfile,
    GoogleProfileResponse,
};

pub(super) fn create_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| {
            format!("Unable to create HTTP client: {}", error)
        })
}

pub(super) async fn load_gmail_connection(
    app: &AppHandle,
    access_token: &str,
) -> Result<GmailConnectionResult, String> {
    let gmail_client = create_http_client()?;

    emit_system_log(
        app,
        "GMAIL",
        "Fetching Gmail profile...",
    );

    let profile_response = gmail_client
        .get(
            "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        )
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| {
            emit_system_log(
                app,
                "ERROR",
                "Gmail profile request failed.",
            );

            format!(
                "Gmail profile request failed: {}",
                error
            )
        })?;

    let profile_status = profile_response.status();

    emit_system_log(
        app,
        "GMAIL",
        format!(
            "Gmail profile service responded: {}",
            profile_status
        ),
    );

    if !profile_status.is_success() {
        let body = profile_response
            .text()
            .await
            .unwrap_or_default();

        emit_system_log(
            app,
            "ERROR",
            format!(
                "Unable to load Gmail profile: {}",
                profile_status
            ),
        );

        eprintln!(
            "[GMAIL] PROFILE ERROR BODY: {}",
            body
        );

        return Err(format!(
            "Gmail API profile error {}: {}",
            profile_status,
            body
        ));
    }

    let raw_profile = profile_response
        .json::<GoogleProfileResponse>()
        .await
        .map_err(|error| {
            format!(
                "Unable to parse Gmail profile: {}",
                error
            )
        })?;

    emit_system_log(
        app,
        "GMAIL",
        format!(
            "Gmail profile loaded for: {}",
            raw_profile.email_address
        ),
    );

    emit_system_log(
        app,
        "GMAIL",
        "Fetching real Gmail inbox unread count...",
    );

    let inbox_label_response = gmail_client
        .get(
            "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX",
        )
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| {
            emit_system_log(
                app,
                "ERROR",
                "Unable to read Gmail inbox status.",
            );

            format!(
                "Unable to request Gmail INBOX label: {}",
                error
            )
        })?;

    let inbox_label_status =
        inbox_label_response.status();

    if !inbox_label_status.is_success() {
        let body = inbox_label_response
            .text()
            .await
            .unwrap_or_default();

        emit_system_log(
            app,
            "ERROR",
            format!(
                "Unable to read Gmail inbox label: {}",
                inbox_label_status
            ),
        );

        eprintln!(
            "[GMAIL] INBOX LABEL ERROR BODY: {}",
            body
        );

        return Err(format!(
            "Unable to read Gmail INBOX label {}: {}",
            inbox_label_status,
            body
        ));
    }

    let inbox_label = inbox_label_response
        .json::<GmailLabelResponse>()
        .await
        .map_err(|error| {
            format!(
                "Unable to parse Gmail INBOX label: {}",
                error
            )
        })?;

    emit_system_log(
        app,
        "GMAIL",
        format!(
            "Real unread inbox count: {}",
            inbox_label.messages_unread
        ),
    );

    let account_email =
        raw_profile.email_address.clone();

    let account_id =
        account_email.to_lowercase();

    let profile = GmailProfile {
        email_address:
            raw_profile.email_address,
        messages_total:
            raw_profile.messages_total,
        threads_total:
            raw_profile.threads_total,
        history_id:
            raw_profile.history_id,
        unread_count:
            inbox_label.messages_unread,
    };

    let messages =
        fetch_gmail_messages(
            app,
            &gmail_client,
            access_token,
            &account_id,
            &account_email,
        )
        .await?;

    emit_system_log(
        app,
        "SYNC",
        format!(
            "Gmail synchronization completed. {} messages loaded.",
            messages.len()
        ),
    );

    Ok(
        GmailConnectionResult {
            profile,
            messages,
        },
    )
}