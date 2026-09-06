use crate::system_log::emit_system_log;
use reqwest::Client;
use tauri::AppHandle;
use super::models::{
    GmailHeader,
    GmailMessage,
    GmailMessageListResponse,
    GmailMessageResponse,
};

pub(super) async fn fetch_gmail_messages(
    app: &AppHandle,
    client: &Client,
    access_token: &str,
    account_id: &str,
    account_email: &str,
) -> Result<Vec<GmailMessage>, String> {
    emit_system_log(
        app,
        "SYNC",
        "Requesting latest Gmail inbox messages...",
    );

    let list_response = client
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .bearer_auth(access_token)
        .query(&[
            ("maxResults", "20"),
            ("labelIds", "INBOX"),
        ])
        .send()
        .await
        .map_err(|error| {
            emit_system_log(
                app,
                "ERROR",
                "Unable to request Gmail message list.",
            );

            format!("messages.list network error: {}", error)
        })?;

    let list_status = list_response.status();

    emit_system_log(
        app,
        "SYNC",
        format!("Gmail message list responded: {}", list_status),
    );

    if !list_status.is_success() {
        let body = list_response.text().await.unwrap_or_default();

        emit_system_log(
            app,
            "ERROR",
            format!("Unable to list Gmail messages: {}", list_status),
        );

        eprintln!("[GMAIL] MESSAGE LIST ERROR BODY: {}", body);

        return Err(format!(
            "Unable to list Gmail messages {}: {}",
            list_status,
            body
        ));
    }

    let list = list_response
        .json::<GmailMessageListResponse>()
        .await
        .map_err(|error| {
            format!("Unable to parse Gmail message list: {}", error)
        })?;

    let total_messages = list.messages.len();

    emit_system_log(
        app,
        "GMAIL",
        format!(
            "Gmail returned {} recent message IDs.",
            total_messages
        ),
    );

    let mut messages = Vec::new();

    for (index, message_reference) in
        list.messages.into_iter().enumerate()
    {
        println!(
            "[GMAIL] Reading message {}/{}: {}",
            index + 1,
            total_messages,
            message_reference.id
        );

        match fetch_gmail_message(
            client,
            access_token,
            &message_reference.id,
            account_id,
            account_email,
        )
        .await
        {
            Ok(message) => {
                println!(
                    "[GMAIL] Message loaded: {}",
                    message.subject
                );

                messages.push(message);
            }
            Err(error) => {
                println!(
                    "[GMAIL] Message {} skipped: {}",
                    message_reference.id,
                    error
                );
            }
        }
    }

    emit_system_log(
        app,
        "SYNC",
        format!(
            "Successfully loaded {} Gmail messages.",
            messages.len()
        ),
    );

    Ok(messages)
}

async fn fetch_gmail_message(
    client: &Client,
    access_token: &str,
    message_id: &str,
    account_id: &str,
    account_email: &str,
) -> Result<GmailMessage, String> {
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}",
        message_id
    );

    let response = client
        .get(url)
        .bearer_auth(access_token)
        .query(&[
            ("format", "metadata"),
            ("metadataHeaders", "From"),
            ("metadataHeaders", "Subject"),
            ("metadataHeaders", "Date"),
        ])
        .send()
        .await
        .map_err(|error| {
            format!("Unable to request Gmail message: {}", error)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        return Err(format!(
            "Unable to read Gmail message {}: {}",
            status,
            body
        ));
    }

    let raw = response
        .json::<GmailMessageResponse>()
        .await
        .map_err(|error| {
            format!("Unable to parse Gmail message: {}", error)
        })?;

    let headers = raw
        .payload
        .map(|payload| payload.headers)
        .unwrap_or_default();

    let sender = find_header(&headers, "From");
    let subject = find_header(&headers, "Subject");
    let date = find_header(&headers, "Date");

    let (sender_name, sender_address) = parse_sender(&sender);

    Ok(GmailMessage {
        id: raw.id,
        thread_id: raw.thread_id,
        account_id: account_id.to_string(),
        account_email: account_email.to_string(),
        sender_name,
        sender_address,
        subject: if subject.is_empty() {
            "(No subject)".to_string()
        } else {
            subject
        },
        snippet: raw.snippet,
        received_at: date,
        is_read: !raw
            .label_ids
            .iter()
            .any(|label| label == "UNREAD"),
        is_important: raw
            .label_ids
            .iter()
            .any(|label| label == "IMPORTANT"),
        is_starred: raw
            .label_ids
            .iter()
            .any(|label| label == "STARRED"),
    })
}

fn find_header(
    headers: &[GmailHeader],
    name: &str,
) -> String {
    headers
        .iter()
        .find(|header| {
            header.name.eq_ignore_ascii_case(name)
        })
        .map(|header| header.value.clone())
        .unwrap_or_default()
}

fn parse_sender(sender: &str) -> (String, String) {
    if let Some(start) = sender.rfind('<') {
        if let Some(end) = sender.rfind('>') {
            let name = sender[..start]
                .trim()
                .trim_matches('"')
                .to_string();

            let email = sender[start + 1..end]
                .trim()
                .to_string();

            return (
                if name.is_empty() {
                    email.clone()
                } else {
                    name
                },
                email,
            );
        }
    }

    (
        sender.to_string(),
        sender.to_string(),
    )
}