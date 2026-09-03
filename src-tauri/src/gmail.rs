use oauth2::{
    basic::BasicClient,
    reqwest,
    AuthUrl,
    AuthorizationCode,
    ClientId,
    CsrfToken,
    PkceCodeChallenge,
    RedirectUrl,
    Scope,
    TokenResponse,
    TokenUrl,
};

use serde::{
    Deserialize,
    Serialize,
};

use std::{
    io::{Read, Write},
    net::TcpListener,
};

use tauri::AppHandle;

use tauri_plugin_opener::OpenerExt;

use url::Url;

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

    #[serde(
        default,
        rename = "labelIds"
    )]
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
) -> Result<GmailConnectionResult, String> {
    /*
     * -------------------------------------------------------
     * 1. CREATE LOCAL CALLBACK SERVER
     * -------------------------------------------------------
     */

    let listener =
        TcpListener::bind("127.0.0.1:0")
            .map_err(
                |error| error.to_string(),
            )?;

    let port =
        listener
            .local_addr()
            .map_err(
                |error| error.to_string(),
            )?
            .port();

    let redirect_url =
        format!(
            "http://127.0.0.1:{}/oauth/callback",
            port,
        );

    /*
     * -------------------------------------------------------
     * 2. CREATE GOOGLE OAUTH CLIENT
     * -------------------------------------------------------
     */

    let client =
        BasicClient::new(
            ClientId::new(client_id),
        )
        .set_auth_uri(
            AuthUrl::new(
                "https://accounts.google.com/o/oauth2/v2/auth"
                    .to_string(),
            )
            .map_err(
                |error| error.to_string(),
            )?,
        )
        .set_token_uri(
            TokenUrl::new(
                "https://oauth2.googleapis.com/token"
                    .to_string(),
            )
            .map_err(
                |error| error.to_string(),
            )?,
        )
        .set_redirect_uri(
            RedirectUrl::new(
                redirect_url.clone(),
            )
            .map_err(
                |error| error.to_string(),
            )?,
        );

    /*
     * -------------------------------------------------------
     * 3. CREATE PKCE SECURITY VALUES
     * -------------------------------------------------------
     */

    let (
        pkce_challenge,
        pkce_verifier,
    ) =
        PkceCodeChallenge::new_random_sha256();

    /*
     * -------------------------------------------------------
     * 4. CREATE GOOGLE AUTHORIZATION URL
     * -------------------------------------------------------
     */

    let (
        authorization_url,
        csrf_state,
    ) =
        client
            .authorize_url(
                CsrfToken::new_random,
            )
            .add_scope(
                Scope::new(
                    "https://www.googleapis.com/auth/gmail.readonly"
                        .to_string(),
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

    /*
     * -------------------------------------------------------
     * 5. OPEN GOOGLE LOGIN IN DEFAULT BROWSER
     * -------------------------------------------------------
     */

    app
        .opener()
        .open_url(
            authorization_url.as_str(),
            None::<&str>,
        )
        .map_err(
            |error| error.to_string(),
        )?;

    /*
     * -------------------------------------------------------
     * 6. WAIT FOR GOOGLE CALLBACK
     * -------------------------------------------------------
     */

    let callback_result =
        tauri::async_runtime::spawn_blocking(
            move || {
                wait_for_oauth_callback(
                    listener,
                )
            },
        )
        .await
        .map_err(
            |error| error.to_string(),
        )??;

    /*
     * -------------------------------------------------------
     * 7. VERIFY OAUTH STATE
     * -------------------------------------------------------
     */

    if callback_result.state
        != *csrf_state.secret()
    {
        return Err(
            "OAuth state verification failed."
                .to_string(),
        );
    }

    /*
     * -------------------------------------------------------
     * 8. CREATE HTTP CLIENT FOR TOKEN EXCHANGE
     * -------------------------------------------------------
     */

    let oauth_http_client =
        reqwest::ClientBuilder::new()
            .redirect(
                reqwest::redirect::Policy::none(),
            )
            .build()
            .map_err(
                |error| error.to_string(),
            )?;

    /*
     * -------------------------------------------------------
     * 9. EXCHANGE AUTHORIZATION CODE FOR ACCESS TOKEN
     * -------------------------------------------------------
     */

    let token_result =
        client
            .exchange_code(
                AuthorizationCode::new(
                    callback_result.code,
                ),
            )
            .set_pkce_verifier(
                pkce_verifier,
            )
            .request_async(
                &oauth_http_client,
            )
            .await
            .map_err(
                |error| {
                    format!(
                        "Token exchange failed: {}",
                        error,
                    )
                },
            )?;

    let access_token =
        token_result
            .access_token()
            .secret();

    /*
     * -------------------------------------------------------
     * 10. CREATE GMAIL HTTP CLIENT
     * -------------------------------------------------------
     */

    let gmail_client =
        reqwest::Client::new();

    /*
     * -------------------------------------------------------
     * 11. FETCH GMAIL PROFILE
     * -------------------------------------------------------
     */

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
                |error| error.to_string(),
            )?;

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

        return Err(
            format!(
                "Gmail API profile error {}: {}",
                status,
                body,
            ),
        );
    }

    let raw_profile =
        profile_response
            .json::<GoogleProfileResponse>()
            .await
            .map_err(
                |error| error.to_string(),
            )?;

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

    /*
     * -------------------------------------------------------
     * 12. FETCH LATEST GMAIL MESSAGES
     * -------------------------------------------------------
     */

    let messages =
        fetch_gmail_messages(
            &gmail_client,
            access_token,
        )
        .await?;

    /*
     * -------------------------------------------------------
     * 13. RETURN PROFILE + MESSAGES TO ANGULAR
     * -------------------------------------------------------
     */

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
    /*
     * Fetch latest 20 messages
     * that currently belong to INBOX.
     */

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
                |error| error.to_string(),
            )?;

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

        return Err(
            format!(
                "Unable to list Gmail messages {}: {}",
                status,
                body,
            ),
        );
    }

    let list =
        list_response
            .json::<GmailMessageListResponse>()
            .await
            .map_err(
                |error| error.to_string(),
            )?;

    let mut messages =
        Vec::new();

    /*
     * Gmail's messages.list endpoint mostly gives us
     * message IDs, so we fetch each message afterward.
     */

    for message_reference
        in list.messages
    {
        let message =
            fetch_gmail_message(
                client,
                access_token,
                &message_reference.id,
            )
            .await?;

        messages.push(
            message,
        );
    }

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
            message_id,
        );

    /*
     * metadata mode is enough for Notificator's
     * inbox preview.
     */

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
                |error| error.to_string(),
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
                body,
            ),
        );
    }

    let raw =
        response
            .json::<GmailMessageResponse>()
            .await
            .map_err(
                |error| error.to_string(),
            )?;

    let headers =
        raw
            .payload
            .map(
                |payload| {
                    payload.headers
                },
            )
            .unwrap_or_default();

    /*
     * Pull useful Gmail headers.
     */

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

    /*
     * Convert Google's response into the
     * simplified format Angular understands.
     */

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
                    "(No subject)"
                        .to_string()
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
                            label
                                == "UNREAD"
                        },
                    ),

            is_important:
                raw
                    .label_ids
                    .iter()
                    .any(
                        |label| {
                            label
                                == "IMPORTANT"
                        },
                    ),

            is_starred:
                raw
                    .label_ids
                    .iter()
                    .any(
                        |label| {
                            label
                                == "STARRED"
                        },
                    ),
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
                header
                    .value
                    .clone()
            },
        )
        .unwrap_or_default()
}

fn parse_sender(
    sender: &str,
) -> (String, String) {
    /*
     * Common Gmail sender format:
     *
     * John Smith <john@example.com>
     */

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

    /*
     * Fallback for senders that don't include
     * a display name.
     */

    (
        sender.to_string(),
        sender.to_string(),
    )
}

fn wait_for_oauth_callback(
    listener: TcpListener,
) -> Result<OAuthCallback, String> {
    /*
     * Wait for Google's redirect to our temporary
     * local HTTP server.
     */

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
                path,
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
    ) in callback_url
        .query_pairs()
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

    /*
     * Show the user a friendly browser page after
     * Google redirects back to Notificator.
     */

    let success_html =
        r#"
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Notificator</title>
        </head>

        <body style="
            background:#05090d;
            color:#edfaff;
            font-family:Arial,sans-serif;
            display:grid;
            place-items:center;
            min-height:100vh;
            margin:0;
        ">
            <div style="
                text-align:center;
            ">
                <h2 style="
                    color:#4de7ff;
                    letter-spacing:2px;
                ">
                    NOTIFICATOR
                </h2>

                <p>
                    Gmail authorization complete.
                </p>

                <p style="
                    color:#73929d;
                    font-size:13px;
                ">
                    Your Gmail inbox is being synchronized.
                </p>

                <p style="
                    color:#526d76;
                    font-size:12px;
                ">
                    You can close this browser window
                    and return to Notificator.
                </p>
            </div>
        </body>
        </html>
        "#;

    let response =
        format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: text/html; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\
             \r\n\
             {}",
            success_html.len(),
            success_html,
        );

    let _ =
        stream.write_all(
            response.as_bytes(),
        );

    /*
     * Google may return ?error=... instead of an
     * authorization code when the user cancels.
     */

    if let Some(error) =
        oauth_error
    {
        return Err(
            format!(
                "Google authorization failed: {}",
                error,
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