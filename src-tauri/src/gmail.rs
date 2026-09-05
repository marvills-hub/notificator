use crate::system_log::emit_system_log;

use oauth2::{
    basic::BasicClient,
    AuthUrl,
    ClientId,
    CsrfToken,
    PkceCodeChallenge,
    RedirectUrl,
    Scope,
    TokenUrl,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    net::TcpListener,
    time::Duration,
};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use url::Url;

const NOTIFICATOR_API_BASE_URL: &str =
    "https://notificator-api.marvills-notificator.workers.dev";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GmailProfile {
    pub email_address: String,
    pub messages_total: u64,
    pub threads_total: u64,
    pub history_id: String,
    pub unread_count: u64,
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
#[serde(rename_all = "camelCase")]
struct GmailLabelResponse {
    #[serde(default)]
    messages_unread: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailOAuthConfigResponse {
    client_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailAccessTokenResponse {
    access_token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GmailExchangeRequest<'a> {
    code: &'a str,
    code_verifier: &'a str,
    redirect_uri: &'a str,
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

fn create_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| {
            format!(
                "Unable to create HTTP client: {}",
                error
            )
        })
}

async fn load_oauth_config(
    app: &AppHandle,
    firebase_id_token: &str,
) -> Result<GmailOAuthConfigResponse, String> {
    emit_system_log(
        app,
        "GMAIL",
        "Loading OAuth configuration from Notificator API...",
    );

    let client = create_http_client()?;

    let url = format!(
        "{}/api/gmail/config",
        NOTIFICATOR_API_BASE_URL
    );

    let response = client
        .get(&url)
        .bearer_auth(firebase_id_token)
        .send()
        .await
        .map_err(|error| {
            emit_system_log(
                app,
                "ERROR",
                "Unable to reach Gmail OAuth configuration service.",
            );

            format!(
                "Unable to load Gmail OAuth configuration from Notificator API: {}",
                error
            )
        })?;

    let status = response.status();

    let body = response
        .text()
        .await
        .map_err(|error| {
            format!(
                "Unable to read OAuth configuration response: {}",
                error
            )
        })?;

    if !status.is_success() {
        emit_system_log(
            app,
            "ERROR",
            format!(
                "Gmail configuration request failed: {}",
                status
            ),
        );

        eprintln!(
            "[GMAIL] CONFIG ERROR BODY: {}",
            body
        );

        return Err(format!(
            "Notificator Gmail configuration request failed {}: {}",
            status,
            body
        ));
    }

    let config =
        serde_json::from_str::<GmailOAuthConfigResponse>(
            &body,
        )
        .map_err(|error| {
            format!(
                "Unable to parse Gmail OAuth configuration: {}",
                error
            )
        })?;

    if config.client_id.trim().is_empty() {
        emit_system_log(
            app,
            "ERROR",
            "Google OAuth Client ID is unavailable.",
        );

        return Err(
            "Notificator API returned an empty Google OAuth Client ID."
                .to_string(),
        );
    }

    emit_system_log(
        app,
        "AUTH",
        "Google OAuth configuration loaded.",
    );

    Ok(config)
}

#[tauri::command]
pub async fn connect_gmail(
    app: AppHandle,
    firebase_id_token: String,
) -> Result<GmailConnectionResult, String> {
    emit_system_log(
        &app,
        "GMAIL",
        "Starting Gmail OAuth connection...",
    );

    if firebase_id_token.trim().is_empty() {
        emit_system_log(
            &app,
            "ERROR",
            "Firebase authentication session is unavailable.",
        );

        return Err(
            "Firebase authentication token is missing."
                .to_string(),
        );
    }

    let oauth_config =
        load_oauth_config(
            &app,
            &firebase_id_token,
        )
        .await?;

    let client_id =
        oauth_config.client_id;

    let listener =
        TcpListener::bind(
            "127.0.0.1:0",
        )
        .map_err(|error| {
            format!(
                "Unable to start OAuth callback server: {}",
                error
            )
        })?;

    let port =
        listener
            .local_addr()
            .map_err(|error| {
                format!(
                    "Unable to determine OAuth callback port: {}",
                    error
                )
            })?
            .port();

    let redirect_url =
        format!(
            "http://127.0.0.1:{}/oauth/callback",
            port
        );

    emit_system_log(
        &app,
        "AUTH",
        "Local OAuth callback channel initialized.",
    );

    let client =
        BasicClient::new(
            ClientId::new(
                client_id,
            ),
        )
        .set_auth_uri(
            AuthUrl::new(
                "https://accounts.google.com/o/oauth2/v2/auth"
                    .to_string(),
            )
            .map_err(|error| {
                error.to_string()
            })?,
        )
        .set_token_uri(
            TokenUrl::new(
                "https://oauth2.googleapis.com/token"
                    .to_string(),
            )
            .map_err(|error| {
                error.to_string()
            })?,
        )
        .set_redirect_uri(
            RedirectUrl::new(
                redirect_url.clone(),
            )
            .map_err(|error| {
                error.to_string()
            })?,
        );

    let (
        pkce_challenge,
        pkce_verifier,
    ) =
        PkceCodeChallenge::new_random_sha256();

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

    emit_system_log(
        &app,
        "AUTH",
        "Opening Google authorization page...",
    );

    app.opener()
        .open_url(
            authorization_url.as_str(),
            None::<&str>,
        )
        .map_err(|error| {
            format!(
                "Unable to open Google authorization page: {}",
                error
            )
        })?;

    emit_system_log(
        &app,
        "AUTH",
        "Waiting for Google authorization response...",
    );

    let callback_result =
        tauri::async_runtime::spawn_blocking(
            move || {
                wait_for_oauth_callback(
                    listener,
                )
            },
        )
        .await
        .map_err(|error| {
            format!(
                "OAuth callback task failed: {}",
                error
            )
        })??;

    if callback_result.state
        != *csrf_state.secret()
    {
        emit_system_log(
            &app,
            "ERROR",
            "OAuth security state verification failed.",
        );

        return Err(
            "OAuth state verification failed."
                .to_string(),
        );
    }

    emit_system_log(
        &app,
        "AUTH",
        "Google OAuth callback verified.",
    );

    emit_system_log(
        &app,
        "AUTH",
        "Exchanging authorization with Notificator API...",
    );

    let access_token =
        exchange_authorization_code(
            &app,
            &firebase_id_token,
            &callback_result.code,
            pkce_verifier.secret(),
            &redirect_url,
        )
        .await?;

    emit_system_log(
        &app,
        "AUTH",
        "Gmail access authorization established.",
    );

    load_gmail_connection(
        &app,
        &access_token,
    )
    .await
}

#[tauri::command]
pub async fn restore_gmail(
    app: AppHandle,
    firebase_id_token: String,
) -> Result<GmailConnectionResult, String> {
    emit_system_log(
        &app,
        "GMAIL",
        "Attempting to restore Gmail connection...",
    );

    if firebase_id_token.trim().is_empty() {
        emit_system_log(
            &app,
            "ERROR",
            "Firebase authentication session is unavailable.",
        );

        return Err(
            "Firebase authentication token is missing."
                .to_string(),
        );
    }

    let access_token =
        match refresh_access_token(
            &app,
            &firebase_id_token,
        )
        .await
        {
            Ok(value) => value,

            Err(error) => {
                emit_system_log(
                    &app,
                    "WARNING",
                    "Stored Gmail connection could not be restored.",
                );

                return Err(error);
            }
        };

    emit_system_log(
        &app,
        "AUTH",
        "Gmail access authorization restored.",
    );

    match load_gmail_connection(
        &app,
        &access_token,
    )
    .await
    {
        Ok(result) => {
            emit_system_log(
                &app,
                "SYNC",
                "Gmail restore completed successfully.",
            );

            Ok(result)
        }

        Err(error) => {
            emit_system_log(
                &app,
                "ERROR",
                "Gmail restore failed while loading mailbox data.",
            );

            Err(error)
        }
    }
}

#[tauri::command]
pub async fn disconnect_gmail(
    app: AppHandle,
    firebase_id_token: String,
) -> Result<(), String> {
    emit_system_log(
        &app,
        "GMAIL",
        "Disconnecting Gmail...",
    );

    if firebase_id_token.trim().is_empty() {
        emit_system_log(
            &app,
            "ERROR",
            "Firebase authentication session is unavailable.",
        );

        return Err(
            "Firebase authentication token is missing."
                .to_string(),
        );
    }

    let client =
        create_http_client()?;

    let url = format!(
        "{}/api/gmail/disconnect",
        NOTIFICATOR_API_BASE_URL
    );

    emit_system_log(
        &app,
        "AUTH",
        "Requesting stored Gmail credential removal...",
    );

    let response =
        client
            .post(&url)
            .bearer_auth(
                &firebase_id_token,
            )
            .header(
                "Content-Type",
                "application/json",
            )
            .body("{}")
            .send()
            .await
            .map_err(|error| {
                format!(
                    "Unable to disconnect Gmail through Notificator API: {}",
                    error
                )
            })?;

    let status =
        response.status();

    emit_system_log(
        &app,
        "GMAIL",
        format!(
            "Disconnect service responded: {}",
            status
        ),
    );

    let body =
        response
            .text()
            .await
            .map_err(|error| {
                format!(
                    "Unable to read Gmail disconnect response: {}",
                    error
                )
            })?;

    if !status.is_success() {
        emit_system_log(
            &app,
            "ERROR",
            format!(
                "Gmail disconnect request failed: {}",
                status
            ),
        );

        eprintln!(
            "[GMAIL] DISCONNECT ERROR BODY: {}",
            body
        );

        return Err(
            format!(
                "Notificator Gmail disconnect failed {}: {}",
                status,
                body
            ),
        );
    }

    emit_system_log(
        &app,
        "AUTH",
        "Stored Gmail authorization removed.",
    );

    emit_system_log(
        &app,
        "SYNC",
        "Gmail disconnected successfully.",
    );

    Ok(())
}

async fn exchange_authorization_code(
    app: &AppHandle,
    firebase_id_token: &str,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<String, String> {
    let client =
        create_http_client()?;

    let url = format!(
        "{}/api/gmail/exchange",
        NOTIFICATOR_API_BASE_URL
    );

    let request =
        GmailExchangeRequest {
            code,
            code_verifier,
            redirect_uri,
        };

    let response =
        client
            .post(&url)
            .bearer_auth(
                firebase_id_token,
            )
            .json(
                &request,
            )
            .send()
            .await
            .map_err(|error| {
                emit_system_log(
                    app,
                    "ERROR",
                    "Unable to reach Gmail authorization exchange service.",
                );

                format!(
                    "Unable to exchange Gmail authorization code through Notificator API: {}",
                    error
                )
            })?;

    let status =
        response.status();

    let body =
        response
            .text()
            .await
            .map_err(|error| {
                format!(
                    "Unable to read Gmail exchange response: {}",
                    error
                )
            })?;

    emit_system_log(
        app,
        "AUTH",
        format!(
            "Authorization exchange service responded: {}",
            status
        ),
    );

    if !status.is_success() {
        emit_system_log(
            app,
            "ERROR",
            format!(
                "Gmail authorization exchange failed: {}",
                status
            ),
        );

        eprintln!(
            "[GMAIL] EXCHANGE ERROR BODY: {}",
            body
        );

        return Err(
            format!(
                "Notificator Gmail token exchange failed {}: {}",
                status,
                body
            ),
        );
    }

    let token =
        serde_json::from_str::<
            GmailAccessTokenResponse,
        >(
            &body,
        )
        .map_err(|error| {
            format!(
                "Unable to parse Gmail exchange response: {}",
                error
            )
        })?;

    if token
        .access_token
        .trim()
        .is_empty()
    {
        emit_system_log(
            app,
            "ERROR",
            "Authorization service returned an invalid Gmail session.",
        );

        return Err(
            "Notificator API returned an empty Gmail access token."
                .to_string(),
        );
    }

    Ok(
        token.access_token,
    )
}

async fn refresh_access_token(
    app: &AppHandle,
    firebase_id_token: &str,
) -> Result<String, String> {
    let client =
        create_http_client()?;

    let url = format!(
        "{}/api/gmail/refresh",
        NOTIFICATOR_API_BASE_URL
    );

    emit_system_log(
        app,
        "AUTH",
        "Requesting refreshed Gmail authorization...",
    );

    let response =
        client
            .post(&url)
            .bearer_auth(
                firebase_id_token,
            )
            .header(
                "Content-Type",
                "application/json",
            )
            .body("{}")
            .send()
            .await
            .map_err(|error| {
                emit_system_log(
                    app,
                    "ERROR",
                    "Unable to reach Gmail authorization refresh service.",
                );

                format!(
                    "Unable to refresh Gmail access token through Notificator API: {}",
                    error
                )
            })?;

    let status =
        response.status();

    emit_system_log(
        app,
        "AUTH",
        format!(
            "Authorization refresh service responded: {}",
            status
        ),
    );

    let body =
        response
            .text()
            .await
            .map_err(|error| {
                format!(
                    "Unable to read Gmail refresh response: {}",
                    error
                )
            })?;

    if !status.is_success() {
        emit_system_log(
            app,
            "WARNING",
            format!(
                "Gmail authorization refresh unavailable: {}",
                status
            ),
        );

        eprintln!(
            "[GMAIL] REFRESH ERROR BODY: {}",
            body
        );

        return Err(
            format!(
                "Notificator Gmail token refresh failed {}: {}",
                status,
                body
            ),
        );
    }

    let token =
        serde_json::from_str::<
            GmailAccessTokenResponse,
        >(
            &body,
        )
        .map_err(|error| {
            format!(
                "Unable to parse Gmail refresh response: {}",
                error
            )
        })?;

    if token
        .access_token
        .trim()
        .is_empty()
    {
        emit_system_log(
            app,
            "ERROR",
            "Authorization refresh returned an invalid Gmail session.",
        );

        return Err(
            "Notificator API returned an empty refreshed Gmail access token."
                .to_string(),
        );
    }

    Ok(
        token.access_token,
    )
}

async fn load_gmail_connection(
    app: &AppHandle,
    access_token: &str,
) -> Result<GmailConnectionResult, String> {
    let gmail_client =
        create_http_client()?;

    emit_system_log(
        app,
        "GMAIL",
        "Fetching Gmail profile...",
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

    let profile_status =
        profile_response.status();

    emit_system_log(
        app,
        "GMAIL",
        format!(
            "Gmail profile service responded: {}",
            profile_status
        ),
    );

    if !profile_status.is_success() {
        let body =
            profile_response
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

        return Err(
            format!(
                "Gmail API profile error {}: {}",
                profile_status,
                body
            ),
        );
    }

    let raw_profile =
        profile_response
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

    let inbox_label_response =
        gmail_client
            .get(
                "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX",
            )
            .bearer_auth(
                access_token,
            )
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
        let body =
            inbox_label_response
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

        return Err(
            format!(
                "Unable to read Gmail INBOX label {}: {}",
                inbox_label_status,
                body
            ),
        );
    }

    let inbox_label =
        inbox_label_response
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

            unread_count:
                inbox_label.messages_unread,
        };

    let messages =
        fetch_gmail_messages(
            app,
            &gmail_client,
            access_token,
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

async fn fetch_gmail_messages(
    app: &AppHandle,
    client: &Client,
    access_token: &str,
) -> Result<Vec<GmailMessage>, String> {
    emit_system_log(
        app,
        "SYNC",
        "Requesting latest Gmail inbox messages...",
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
            .map_err(|error| {
                emit_system_log(
                    app,
                    "ERROR",
                    "Unable to request Gmail message list.",
                );

                format!(
                    "messages.list network error: {}",
                    error
                )
            })?;

    let list_status =
        list_response.status();

    emit_system_log(
        app,
        "SYNC",
        format!(
            "Gmail message list responded: {}",
            list_status
        ),
    );

    if !list_status.is_success() {
        let body =
            list_response
                .text()
                .await
                .unwrap_or_default();

        emit_system_log(
            app,
            "ERROR",
            format!(
                "Unable to list Gmail messages: {}",
                list_status
            ),
        );

        eprintln!(
            "[GMAIL] MESSAGE LIST ERROR BODY: {}",
            body
        );

        return Err(
            format!(
                "Unable to list Gmail messages {}: {}",
                list_status,
                body
            ),
        );
    }

    let list =
        list_response
            .json::<GmailMessageListResponse>()
            .await
            .map_err(|error| {
                format!(
                    "Unable to parse Gmail message list: {}",
                    error
                )
            })?;

    let total_messages =
        list.messages.len();

    emit_system_log(
        app,
        "GMAIL",
        format!(
            "Gmail returned {} recent message IDs.",
            total_messages
        ),
    );

    let mut messages =
        Vec::new();

    for (
        index,
        message_reference,
    ) in list
        .messages
        .into_iter()
        .enumerate()
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

    emit_system_log(
        app,
        "SYNC",
        format!(
            "Successfully loaded {} Gmail messages.",
            messages.len()
        ),
    );

    Ok(
        messages,
    )
}

async fn fetch_gmail_message(
    client: &Client,
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
            .get(
                url,
            )
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
            .map_err(|error| {
                format!(
                    "Unable to request Gmail message: {}",
                    error
                )
            })?;

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
            .map_err(|error| {
                format!(
                    "Unable to parse Gmail message: {}",
                    error
                )
            })?;

    let headers =
        raw.payload
            .map(
                |payload| {
                    payload.headers
                },
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
                !raw.label_ids
                    .iter()
                    .any(
                        |label| {
                            label == "UNREAD"
                        },
                    ),

            is_important:
                raw.label_ids
                    .iter()
                    .any(
                        |label| {
                            label == "IMPORTANT"
                        },
                    ),

            is_starred:
                raw.label_ids
                    .iter()
                    .any(
                        |label| {
                            label == "STARRED"
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
                header.value.clone()
            },
        )
        .unwrap_or_default()
}

fn parse_sender(
    sender: &str,
) -> (
    String,
    String,
) {
    if let Some(start) =
        sender.rfind(
            '<',
        )
    {
        if let Some(end) =
            sender.rfind(
                '>',
            )
        {
            let name =
                sender[..start]
                    .trim()
                    .trim_matches(
                        '"',
                    )
                    .to_string();

            let email =
                sender[start + 1..end]
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
            .map_err(|error| {
                format!(
                    "OAuth callback connection failed: {}",
                    error
                )
            })?;

    let mut buffer =
        [0_u8; 8192];

    let size =
        stream
            .read(
                &mut buffer,
            )
            .map_err(|error| {
                format!(
                    "Unable to read OAuth callback: {}",
                    error
                )
            })?;

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
            .nth(
                1,
            )
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
            |error| {
                error.to_string()
            },
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

    let authorization_succeeded =
        oauth_error.is_none()
            && code.is_some()
            && state.is_some();

    let page_title =
        if authorization_succeeded {
            "Gmail Connected"
        } else {
            "Authorization Failed"
        };

    let page_message =
        if authorization_succeeded {
            "Gmail authorization completed successfully."
        } else {
            "Gmail authorization could not be completed."
        };

    let success_html =
        format!(
            r#"<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
    padding:40px;
    border:1px solid rgba(77,231,255,.18);
    border-radius:18px;
    background:rgba(8,16,22,.96);
    box-shadow:0 20px 80px rgba(0,0,0,.45);
">

<h2 style="
    color:#4de7ff;
    letter-spacing:2px;
    margin:0 0 20px;
">
NOTIFICATOR
</h2>

<h3 style="
    color:#edfaff;
    margin-bottom:12px;
">
{}
</h3>

<p style="
    color:#9bb3bc;
">
{}
</p>

<p style="
    color:#73929d;
    font-size:13px;
    margin-top:20px;
">
You can close this browser window and return to Notificator.
</p>

</div>

</body>
</html>"#,
            page_title,
            page_message
        );

    let response =
        format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: text/html; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\
             \r\n\
             {}",
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