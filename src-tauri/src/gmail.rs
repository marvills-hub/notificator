use keyring::Entry;
use oauth2::{
    basic::BasicClient,
    reqwest,
    AuthUrl,
    ClientId,
    CsrfToken,
    PkceCodeChallenge,
    RedirectUrl,
    Scope,
    TokenUrl,
};
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    net::TcpListener,
    time::Duration,
};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use url::Url;

const KEYRING_SERVICE: &str = "com.marvills.notificator.gmail";
const KEYRING_ACCOUNT: &str = "gmail-refresh-token";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GmailProfile {
    pub email_address: String,
    pub messages_total: u64,
    pub threads_total: u64,
    pub history_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GmailMessage {
    pub id: String,
    pub thread_id: String,
    pub sender_name: String,
    pub sender_address: String,
    pub subject: String,
    pub snippet: String,
    pub received_at: String,
    pub is_read: bool,
    pub is_important: bool,
    pub is_starred: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GmailConnectionResult {
    pub profile: GmailProfile,
    pub messages: Vec<GmailMessage>,
}

#[derive(Deserialize)]
struct GoogleProfileResponse {
    #[serde(rename = "emailAddress")]
    email_address: String,
    #[serde(rename = "messagesTotal")]
    messages_total: u64,
    #[serde(rename = "threadsTotal")]
    threads_total: u64,
    #[serde(rename = "historyId")]
    history_id: String,
}

#[derive(Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct GoogleRefreshTokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct GmailMessageListResponse {
    #[serde(default)]
    messages: Vec<GmailMessageReference>,
}

#[derive(Deserialize)]
struct GmailMessageReference {
    id: String,
}

#[derive(Deserialize)]
struct GmailMessageResponse {
    id: String,
    #[serde(rename = "threadId")]
    thread_id: String,
    #[serde(default)]
    snippet: String,
    #[serde(default, rename = "labelIds")]
    label_ids: Vec<String>,
    payload: Option<GmailPayload>,
}

#[derive(Deserialize)]
struct GmailPayload {
    #[serde(default)]
    headers: Vec<GmailHeader>,
}

#[derive(Deserialize)]
struct GmailHeader {
    name: String,
    value: String,
}

struct OAuthCallback {
    code: String,
    state: String,
}

#[tauri::command]
pub async fn connect_gmail(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<GmailConnectionResult, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let redirect_url = format!(
        "http://127.0.0.1:{}/oauth/callback",
        port
    );
    let client_id_for_token = client_id.clone();
    let client = BasicClient::new(
        ClientId::new(client_id),
    )
    .set_auth_uri(
        AuthUrl::new(
            "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
        )
        .map_err(|error| error.to_string())?,
    )
    .set_token_uri(
        TokenUrl::new(
            "https://oauth2.googleapis.com/token".to_string(),
        )
        .map_err(|error| error.to_string())?,
    )
    .set_redirect_uri(
        RedirectUrl::new(
            redirect_url.clone(),
        )
        .map_err(|error| error.to_string())?,
    );
    let (
        pkce_challenge,
        pkce_verifier,
    ) = PkceCodeChallenge::new_random_sha256();
    let (
        authorization_url,
        csrf_state,
    ) = client
        .authorize_url(
            CsrfToken::new_random,
        )
        .add_scope(
            Scope::new(
                "https://www.googleapis.com/auth/gmail.readonly".to_string(),
            ),
        )
        .add_extra_param(
            "access_type",
            "offline",
        )
        .add_extra_param(
            "prompt",
            "consent",
        )
        .set_pkce_challenge(
            pkce_challenge,
        )
        .url();
    app
        .opener()
        .open_url(
            authorization_url.as_str(),
            None::<&str>,
        )
        .map_err(|error| error.to_string())?;
    let callback_result =
        tauri::async_runtime::spawn_blocking(
            move || wait_for_oauth_callback(listener),
        )
        .await
        .map_err(|error| error.to_string())??;
    if callback_result.state != *csrf_state.secret() {
        return Err(
            "OAuth state verification failed.".to_string(),
        );
    }
    println!(
        "[GMAIL] OAuth callback received successfully."
    );
    println!(
        "[GMAIL] Exchanging authorization code for token..."
    );
    let token_http_client =
        reqwest::ClientBuilder::new()
            .timeout(
                Duration::from_secs(20),
            )
            .build()
            .map_err(
                |error| {
                    format!(
                        "Unable to create token HTTP client: {}",
                        error
                    )
                },
            )?;
    let token_response =
        token_http_client
            .post(
                "https://oauth2.googleapis.com/token",
            )
            .form(
                &[
                    (
                        "client_id",
                        client_id_for_token.as_str(),
                    ),
                    (
                        "client_secret",
                        client_secret.as_str(),
                    ),
                    (
                        "code",
                        callback_result.code.as_str(),
                    ),
                    (
                        "code_verifier",
                        pkce_verifier.secret(),
                    ),
                    (
                        "grant_type",
                        "authorization_code",
                    ),
                    (
                        "redirect_uri",
                        redirect_url.as_str(),
                    ),
                ],
            )
            .send()
            .await
            .map_err(
                |error| {
                    format!(
                        "Google token request failed: {}",
                        error
                    )
                },
            )?;
    println!(
        "[GMAIL] Google token endpoint responded: {}",
        token_response.status()
    );
    let token_status =
        token_response.status();
    let token_body =
        token_response
            .text()
            .await
            .map_err(
                |error| {
                    format!(
                        "Unable to read token response: {}",
                        error
                    )
                },
            )?;
    if !token_status.is_success() {
        println!(
            "[GMAIL] TOKEN ERROR: {}",
            token_body
        );
        return Err(
            format!(
                "Google token exchange failed {}: {}",
                token_status,
                token_body
            ),
        );
    }
    let token_data =
        serde_json::from_str::<GoogleTokenResponse>(
            &token_body,
        )
        .map_err(
            |error| {
                format!(
                    "Unable to parse token response: {}",
                    error
                )
            },
        )?;
    if let Some(
        refresh_token,
    ) = token_data
        .refresh_token
        .as_deref()
    {
        save_refresh_token(
            refresh_token,
        )?;
        println!(
            "[GMAIL] Refresh token stored securely."
        );
    } else {
        println!(
            "[GMAIL] Google did not return a refresh token."
        );
    }
    println!(
        "[GMAIL] Access token received successfully."
    );
    let access_token =
        token_data.access_token.as_str();
    load_gmail_connection(
        access_token,
    )
    .await
}

#[tauri::command]
pub async fn restore_gmail(
    client_id: String,
    client_secret: String,
) -> Result<GmailConnectionResult, String> {
    println!(
        "[GMAIL] Attempting to restore Gmail connection..."
    );
    let refresh_token =
        load_refresh_token()?;
    println!(
        "[GMAIL] Stored refresh token found."
    );
    let access_token =
        refresh_access_token(
            &client_id,
            &client_secret,
            &refresh_token,
        )
        .await?;
    println!(
        "[GMAIL] Gmail access token refreshed successfully."
    );
    load_gmail_connection(
        &access_token,
    )
    .await
}

async fn refresh_access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<String, String> {
    let client =
        reqwest::ClientBuilder::new()
            .timeout(
                Duration::from_secs(20),
            )
            .build()
            .map_err(
                |error| {
                    format!(
                        "Unable to create refresh HTTP client: {}",
                        error
                    )
                },
            )?;
    println!(
        "[GMAIL] Requesting new access token..."
    );
    let response =
        client
            .post(
                "https://oauth2.googleapis.com/token",
            )
            .form(
                &[
                    (
                        "client_id",
                        client_id,
                    ),
                    (
                        "client_secret",
                        client_secret,
                    ),
                    (
                        "refresh_token",
                        refresh_token,
                    ),
                    (
                        "grant_type",
                        "refresh_token",
                    ),
                ],
            )
            .send()
            .await
            .map_err(
                |error| {
                    format!(
                        "Unable to refresh Gmail access token: {}",
                        error
                    )
                },
            )?;
    println!(
        "[GMAIL] Refresh endpoint responded: {}",
        response.status()
    );
    let status =
        response.status();
    let body =
        response
            .text()
            .await
            .map_err(
                |error| {
                    format!(
                        "Unable to read refresh response: {}",
                        error
                    )
                },
            )?;
    if !status.is_success() {
        println!(
            "[GMAIL] REFRESH ERROR: {}",
            body
        );
        return Err(
            format!(
                "Google token refresh failed {}: {}",
                status,
                body
            ),
        );
    }
    let token =
        serde_json::from_str::<GoogleRefreshTokenResponse>(
            &body,
        )
        .map_err(
            |error| {
                format!(
                    "Unable to parse refresh token response: {}",
                    error
                )
            },
        )?;
    Ok(
        token.access_token,
    )
}

async fn load_gmail_connection(
    access_token: &str,
) -> Result<GmailConnectionResult, String> {
    let gmail_client =
        reqwest::ClientBuilder::new()
            .timeout(
                Duration::from_secs(20),
            )
            .build()
            .map_err(
                |error| {
                    format!(
                        "Unable to create Gmail HTTP client: {}",
                        error
                    )
                },
            )?;
    println!(
        "[GMAIL] Fetching Gmail profile..."
    );
    let profile_response =
        gmail_client
            .get(
                "https://gmail.googleapis.com/gmail/v1/users/me/profile",
            )
            .bearer_auth(
                access_token,
            )
            .send()
            .await
            .map_err(
                |error| {
                    format!(
                        "Gmail profile request failed: {}",
                        error
                    )
                },
            )?;
    println!(
        "[GMAIL] Gmail profile response: {}",
        profile_response.status()
    );
    if !profile_response
        .status()
        .is_success()
    {
        let status =
            profile_response.status();
        let body =
            profile_response
                .text()
                .await
                .unwrap_or_default();
        println!(
            "[GMAIL] PROFILE ERROR BODY: {}",
            body
        );
        return Err(
            format!(
                "Gmail API profile error {}: {}",
                status,
                body
            ),
        );
    }
    let raw_profile =
        profile_response
            .json::<GoogleProfileResponse>()
            .await
            .map_err(
                |error| {
                    format!(
                        "Unable to parse Gmail profile: {}",
                        error
                    )
                },
            )?;
    println!(
        "[GMAIL] Gmail profile loaded for: {}",
        raw_profile.email_address
    );
    let profile =
        GmailProfile {
            email_address:
                raw_profile.email_address,
            messages_total:
                raw_profile.messages_total,
            threads_total:
                raw_profile.threads_total,
            history_id:
                raw_profile.history_id,
        };
    let messages =
        fetch_gmail_messages(
            &gmail_client,
            access_token,
        )
        .await?;
    println!(
        "[GMAIL] Gmail connection completed successfully."
    );
    Ok(
        GmailConnectionResult {
            profile,
            messages,
        },
    )
}

async fn fetch_gmail_messages(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<Vec<GmailMessage>, String> {
    println!(
        "[GMAIL] Starting messages.list..."
    );
    let list_response =
        client
            .get(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            )
            .bearer_auth(
                access_token,
            )
            .query(
                &[
                    (
                        "maxResults",
                        "20",
                    ),
                    (
                        "labelIds",
                        "INBOX",
                    ),
                ],
            )
            .send()
            .await
            .map_err(
                |error| {
                    format!(
                        "messages.list network error: {}",
                        error
                    )
                },
            )?;
    println!(
        "[GMAIL] messages.list status: {}",
        list_response.status()
    );
    if !list_response
        .status()
        .is_success()
    {
        let status =
            list_response.status();
        let body =
            list_response
                .text()
                .await
                .unwrap_or_default();
        println!(
            "[GMAIL] messages.list failed: {} {}",
            status,
            body
        );
        return Err(
            format!(
                "Unable to list Gmail messages {}: {}",
                status,
                body
            ),
        );
    }
    let list =
        list_response
            .json::<GmailMessageListResponse>()
            .await
            .map_err(
                |error| {
                    format!(
                        "Unable to parse Gmail message list: {}",
                        error
                    )
                },
            )?;
    println!(
        "[GMAIL] Gmail returned {} message IDs",
        list.messages.len()
    );
    let mut messages =
        Vec::new();
    for message_reference in list.messages {
        println!(
            "[GMAIL] Reading message: {}",
            message_reference.id
        );
        match fetch_gmail_message(
            client,
            access_token,
            &message_reference.id,
        )
        .await
        {
            Ok(message) => {
                println!(
                    "[GMAIL] Message loaded: {}",
                    message.subject
                );
                messages.push(
                    message,
                );
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
    println!(
        "[GMAIL] Successfully loaded {} messages",
        messages.len()
    );
    Ok(messages)
}

async fn fetch_gmail_message(
    client: &reqwest::Client,
    access_token: &str,
    message_id: &str,
) -> Result<GmailMessage, String> {
    let url =
        format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}",
            message_id
        );
    let response =
        client
            .get(url)
            .bearer_auth(
                access_token,
            )
            .query(
                &[
                    (
                        "format",
                        "metadata",
                    ),
                    (
                        "metadataHeaders",
                        "From",
                    ),
                    (
                        "metadataHeaders",
                        "Subject",
                    ),
                    (
                        "metadataHeaders",
                        "Date",
                    ),
                ],
            )
            .send()
            .await
            .map_err(
                |error| {
                    format!(
                        "Unable to request Gmail message: {}",
                        error
                    )
                },
            )?;
    if !response
        .status()
        .is_success()
    {
        let status =
            response.status();
        let body =
            response
                .text()
                .await
                .unwrap_or_default();
        return Err(
            format!(
                "Unable to read Gmail message {}: {}",
                status,
                body
            ),
        );
    }
    let raw =
        response
            .json::<GmailMessageResponse>()
            .await
            .map_err(
                |error| {
                    format!(
                        "Unable to parse Gmail message: {}",
                        error
                    )
                },
            )?;
    let headers =
        raw
            .payload
            .map(
                |payload| payload.headers,
            )
            .unwrap_or_default();
    let sender =
        find_header(
            &headers,
            "From",
        );
    let subject =
        find_header(
            &headers,
            "Subject",
        );
    let date =
        find_header(
            &headers,
            "Date",
        );
    let (
        sender_name,
        sender_address,
    ) =
        parse_sender(
            &sender,
        );
    Ok(
        GmailMessage {
            id:
                raw.id,
            thread_id:
                raw.thread_id,
            sender_name,
            sender_address,
            subject:
                if subject.is_empty() {
                    "(No subject)".to_string()
                } else {
                    subject
                },
            snippet:
                raw.snippet,
            received_at:
                date,
            is_read:
                !raw
                    .label_ids
                    .iter()
                    .any(
                        |label| {
                            label == "UNREAD"
                        },
                    ),
            is_important:
                raw
                    .label_ids
                    .iter()
                    .any(
                        |label| {
                            label == "IMPORTANT"
                        },
                    ),
            is_starred:
                raw
                    .label_ids
                    .iter()
                    .any(
                        |label| {
                            label == "STARRED"
                        },
                    ),
        },
    )
}

fn save_refresh_token(
    refresh_token: &str,
) -> Result<(), String> {
    let entry =
        Entry::new(
            KEYRING_SERVICE,
            KEYRING_ACCOUNT,
        )
        .map_err(
            |error| {
                format!(
                    "Unable to open credential store: {}",
                    error
                )
            },
        )?;
    entry
        .set_password(
            refresh_token,
        )
        .map_err(
            |error| {
                format!(
                    "Unable to store Gmail refresh token: {}",
                    error
                )
            },
        )?;
    Ok(())
}

fn load_refresh_token() -> Result<String, String> {
    let entry =
        Entry::new(
            KEYRING_SERVICE,
            KEYRING_ACCOUNT,
        )
        .map_err(
            |error| {
                format!(
                    "Unable to open credential store: {}",
                    error
                )
            },
        )?;
    entry
        .get_password()
        .map_err(
            |error| {
                format!(
                    "No stored Gmail authorization: {}",
                    error
                )
            },
        )
}

fn find_header(
    headers: &[GmailHeader],
    name: &str,
) -> String {
    headers
        .iter()
        .find(
            |header| {
                header
                    .name
                    .eq_ignore_ascii_case(
                        name,
                    )
            },
        )
        .map(
            |header| {
                header.value.clone()
            },
        )
        .unwrap_or_default()
}

fn parse_sender(
    sender: &str,
) -> (String, String) {
    if let Some(start) =
        sender.rfind('<')
    {
        if let Some(end) =
            sender.rfind('>')
        {
            let name =
                sender[..start]
                    .trim()
                    .trim_matches('"')
                    .to_string();
            let email =
                sender[
                    start + 1..end
                ]
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

fn wait_for_oauth_callback(
    listener: TcpListener,
) -> Result<OAuthCallback, String> {
    let (
        mut stream,
        _,
    ) =
        listener
            .accept()
            .map_err(
                |error| error.to_string(),
            )?;
    let mut buffer =
        [0_u8; 8192];
    let size =
        stream
            .read(
                &mut buffer,
            )
            .map_err(
                |error| error.to_string(),
            )?;
    let request =
        String::from_utf8_lossy(
            &buffer[..size],
        );
    let request_line =
        request
            .lines()
            .next()
            .ok_or(
                "Invalid OAuth callback request",
            )?;
    let path =
        request_line
            .split_whitespace()
            .nth(1)
            .ok_or(
                "OAuth callback path missing",
            )?;
    let callback_url =
        Url::parse(
            &format!(
                "http://127.0.0.1{}",
                path
            ),
        )
        .map_err(
            |error| error.to_string(),
        )?;
    let mut code =
        None;
    let mut state =
        None;
    let mut oauth_error =
        None;
    for (
        key,
        value,
    ) in callback_url.query_pairs()
    {
        match key.as_ref() {
            "code" => {
                code =
                    Some(
                        value.to_string(),
                    );
            }
            "state" => {
                state =
                    Some(
                        value.to_string(),
                    );
            }
            "error" => {
                oauth_error =
                    Some(
                        value.to_string(),
                    );
            }
            _ => {}
        }
    }
    let success_html =
        r#"<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Notificator</title>
</head>
<body style="background:#05090d;color:#edfaff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;">
<div style="text-align:center;">
<h2 style="color:#4de7ff;letter-spacing:2px;">NOTIFICATOR</h2>
<p>Gmail authorization complete.</p>
<p style="color:#73929d;font-size:13px;">You can close this browser window and return to Notificator.</p>
</div>
</body>
</html>"#;
    let response =
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            success_html.len(),
            success_html
        );
    let _ =
        stream.write_all(
            response.as_bytes(),
        );
    if let Some(error) =
        oauth_error
    {
        return Err(
            format!(
                "Google authorization failed: {}",
                error
            ),
        );
    }
    Ok(
        OAuthCallback {
            code:
                code.ok_or(
                    "Authorization code missing",
                )?,
            state:
                state.ok_or(
                    "OAuth state missing",
                )?,
        },
    )
}