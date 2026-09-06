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
use std::{
    io::{ErrorKind, Read, Write},
    net::TcpListener,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, Instant},
};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use url::Url;

use super::api::create_http_client;
use super::models::{
    GmailAccessTokenResponse,
    GmailAccountRequest,
    GmailExchangeRequest,
    GmailOAuthConfigResponse,
    OAuthCallback,
};

const NOTIFICATOR_API_BASE_URL: &str =
    "https://notificator-api.marvills-notificator.workers.dev";

static GMAIL_OAUTH_CANCELLED: AtomicBool = AtomicBool::new(false);

pub(super) async fn authorize_gmail(
    app: &AppHandle,
    firebase_id_token: &str,
) -> Result<String, String> {
    GMAIL_OAUTH_CANCELLED.store(false, Ordering::SeqCst);
    let oauth_config =
        load_oauth_config(app, firebase_id_token).await?;

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| {
            format!(
                "Unable to start OAuth callback server: {}",
                error
            )
        })?;

    let port = listener
        .local_addr()
        .map_err(|error| {
            format!(
                "Unable to determine OAuth callback port: {}",
                error
            )
        })?
        .port();

    let redirect_url = format!(
        "http://127.0.0.1:{}/oauth/callback",
        port
    );

    emit_system_log(
        app,
        "AUTH",
        "Local OAuth callback channel initialized.",
    );

    let client = BasicClient::new(
        ClientId::new(oauth_config.client_id),
    )
    .set_auth_uri(
        AuthUrl::new(
            "https://accounts.google.com/o/oauth2/v2/auth"
                .to_string(),
        )
        .map_err(|error| error.to_string())?,
    )
    .set_token_uri(
        TokenUrl::new(
            "https://oauth2.googleapis.com/token"
                .to_string(),
        )
        .map_err(|error| error.to_string())?,
    )
    .set_redirect_uri(
        RedirectUrl::new(redirect_url.clone())
            .map_err(|error| error.to_string())?,
    );

    let (pkce_challenge, pkce_verifier) =
        PkceCodeChallenge::new_random_sha256();

    let (authorization_url, csrf_state) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(
            Scope::new(
                "https://www.googleapis.com/auth/gmail.readonly"
                    .to_string(),
            ),
        )
        .add_extra_param("access_type", "offline")
        .add_extra_param( "prompt", "select_account consent")
        .set_pkce_challenge(pkce_challenge)
        .url();

    emit_system_log(
        app,
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
        app,
        "AUTH",
        "Waiting for Google authorization response...",
    );

    let callback_result =
        tauri::async_runtime::spawn_blocking(move || {
            wait_for_oauth_callback(listener)
        })
        .await
        .map_err(|error| {
            format!(
                "OAuth callback task failed: {}",
                error
            )
        })??;

    if callback_result.state != *csrf_state.secret() {
        emit_system_log(
            app,
            "ERROR",
            "OAuth security state verification failed.",
        );

        return Err(
            "OAuth state verification failed.".to_string(),
        );
    }

    emit_system_log(
        app,
        "AUTH",
        "Google OAuth callback verified.",
    );

    emit_system_log(
        app,
        "AUTH",
        "Exchanging authorization with Notificator API...",
    );

    exchange_authorization_code(
        app,
        firebase_id_token,
        &callback_result.code,
        pkce_verifier.secret(),
        &redirect_url,
    )
    .await
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

        eprintln!("[GMAIL] CONFIG ERROR BODY: {}", body);

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

async fn exchange_authorization_code(
    app: &AppHandle,
    firebase_id_token: &str,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<String, String> {
    let client = create_http_client()?;

    let url = format!(
        "{}/api/gmail/exchange",
        NOTIFICATOR_API_BASE_URL
    );

    let request = GmailExchangeRequest {
        code,
        code_verifier,
        redirect_uri,
    };

    let response = client
        .post(&url)
        .bearer_auth(firebase_id_token)
        .json(&request)
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

    let status = response.status();

    let body = response
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

        eprintln!("[GMAIL] EXCHANGE ERROR BODY: {}", body);

        return Err(format!(
            "Notificator Gmail token exchange failed {}: {}",
            status,
            body
        ));
    }

    let token =
        serde_json::from_str::<GmailAccessTokenResponse>(
            &body,
        )
        .map_err(|error| {
            format!(
                "Unable to parse Gmail exchange response: {}",
                error
            )
        })?;

    if token.access_token.trim().is_empty() {
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

    Ok(token.access_token)
}

pub(super) async fn refresh_access_token(
    app: &AppHandle,
    firebase_id_token: &str,
) -> Result<String, String> {
    let client = create_http_client()?;

    let url = format!(
        "{}/api/gmail/refresh",
        NOTIFICATOR_API_BASE_URL
    );

    emit_system_log(
        app,
        "AUTH",
        "Requesting refreshed Gmail authorization...",
    );

    let response = client
        .post(&url)
        .bearer_auth(firebase_id_token)
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

    let status = response.status();

    emit_system_log(
        app,
        "AUTH",
        format!(
            "Authorization refresh service responded: {}",
            status
        ),
    );

    let body = response
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

        eprintln!("[GMAIL] REFRESH ERROR BODY: {}", body);

        return Err(format!(
            "Notificator Gmail token refresh failed {}: {}",
            status,
            body
        ));
    }

    let token =
        serde_json::from_str::<GmailAccessTokenResponse>(
            &body,
        )
        .map_err(|error| {
            format!(
                "Unable to parse Gmail refresh response: {}",
                error
            )
        })?;

    if token.access_token.trim().is_empty() {
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

    Ok(token.access_token)
}

fn wait_for_oauth_callback(
    listener: TcpListener,
) -> Result<OAuthCallback, String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| {
            format!(
                "Unable to configure OAuth callback listener: {}",
                error
            )
        })?;

    let timeout = Duration::from_secs(120);
    let started_at = Instant::now();

    let (mut stream, _) = loop {
        if GMAIL_OAUTH_CANCELLED.load(Ordering::SeqCst) {
            return Err(
                "GMAIL_OAUTH_CANCELLED".to_string(),
            );
        }

        match listener.accept() {
            Ok(connection) => break connection,
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                if started_at.elapsed() >= timeout {
                    return Err(
                        "GMAIL_OAUTH_TIMEOUT".to_string(),
                    );
                }

                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => {
                return Err(format!(
                    "OAuth callback connection failed: {}",
                    error
                ));
            }
        }
    };

    stream
        .set_nonblocking(false)
        .map_err(|error| {
            format!(
                "Unable to configure OAuth callback connection: {}",
                error
            )
        })?;

    let mut buffer = [0_u8; 8192];

    let size = stream
        .read(&mut buffer)
        .map_err(|error| {
            format!(
                "Unable to read OAuth callback: {}",
                error
            )
        })?;

    let request = String::from_utf8_lossy(&buffer[..size]);

    let request_line = request
        .lines()
        .next()
        .ok_or("Invalid OAuth callback request")?;

    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or("OAuth callback path missing")?;

    let callback_url = Url::parse(
        &format!("http://127.0.0.1{}", path),
    )
    .map_err(|error| error.to_string())?;

    let mut code = None;
    let mut state = None;
    let mut oauth_error = None;
    let mut oauth_error_description = None;

    for (key, value) in callback_url.query_pairs() {
        match key.as_ref() {
            "code" => {
                code = Some(value.to_string());
            }
            "state" => {
                state = Some(value.to_string());
            }
            "error" => {
                oauth_error = Some(value.to_string());
            }
            "error_description" => {
                oauth_error_description =
                    Some(value.to_string());
            }
            _ => {}
        }
    }

    let authorization_succeeded =
        oauth_error.is_none()
            && code.is_some()
            && state.is_some();

    let page_title = if authorization_succeeded {
        "Gmail Connected"
    } else {
        "Authorization Failed"
    };

    let page_message = if authorization_succeeded {
        "Gmail authorization completed successfully."
    } else {
        "Google could not authorize this Gmail account."
    };

    let success_html = format!(
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

    let response = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {}",
        success_html.len(),
        success_html
    );

    let _ = stream.write_all(response.as_bytes());

    if let Some(error) = oauth_error {
        let description =
            oauth_error_description.unwrap_or_default();

        return Err(format!(
            "GMAIL_OAUTH_ERROR:{}:{}",
            error,
            description
        ));
    }

    Ok(OAuthCallback {
        code: code.ok_or("Authorization code missing")?,
        state: state.ok_or("OAuth state missing")?,
    })
}

pub(super) async fn refresh_access_token_for_account(
    app: &AppHandle,
    firebase_id_token: &str,
    account_id: &str,
) -> Result<GmailAccessTokenResponse, String> {
    let client = create_http_client()?;

    let url = format!(
        "{}/api/gmail/refresh",
        NOTIFICATOR_API_BASE_URL
    );

    emit_system_log(
        app,
        "AUTH",
        format!(
            "Refreshing Gmail authorization for account: {}",
            account_id
        ),
    );

    let request = GmailAccountRequest {
        account_id,
    };

    let response = client
        .post(&url)
        .bearer_auth(firebase_id_token)
        .json(&request)
        .send()
        .await
        .map_err(|error| {
            emit_system_log(
                app,
                "ERROR",
                format!(
                    "Unable to refresh Gmail account authorization: {}",
                    account_id
                ),
            );

            format!(
                "Unable to refresh Gmail access token through Notificator API: {}",
                error
            )
        })?;

    let status = response.status();

    let body = response
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
                "Gmail authorization refresh failed for {}: {}",
                account_id,
                status
            ),
        );

        eprintln!(
            "[GMAIL] ACCOUNT REFRESH ERROR BODY: {}",
            body
        );

        return Err(format!(
            "Notificator Gmail token refresh failed {}: {}",
            status,
            body
        ));
    }

    let token =
        serde_json::from_str::<GmailAccessTokenResponse>(
            &body,
        )
        .map_err(|error| {
            format!(
                "Unable to parse Gmail account refresh response: {}",
                error
            )
        })?;

    if token.access_token.trim().is_empty() {
        return Err(
            "Notificator API returned an empty refreshed Gmail access token."
                .to_string(),
        );
    }

    emit_system_log(
        app,
        "AUTH",
        format!(
            "Gmail authorization restored for account: {}",
            account_id
        ),
    );

    Ok(token)
}

pub(super) fn cancel_gmail_authorization() {
    GMAIL_OAUTH_CANCELLED.store(true, Ordering::SeqCst);
}