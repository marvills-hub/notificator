use crate::system_log::emit_system_log;
use tauri::AppHandle;

use super::api::{
    create_http_client,
    load_gmail_connection,
};
use super::models::{
    GmailAccountConnectionResult,
    GmailAccountSummary,
    GmailAccountsResponse,
    GmailConnectionResult,
};
use super::oauth::{
    authorize_gmail,
    cancel_gmail_authorization,
    refresh_access_token,
    refresh_access_token_for_account,
};


const NOTIFICATOR_API_BASE_URL: &str =
    "https://notificator-api.marvills-notificator.workers.dev";

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

    let access_token =
        authorize_gmail(
            &app,
            &firebase_id_token,
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
pub async fn cancel_gmail_connect(
    app: AppHandle,
) -> Result<(), String> {
    emit_system_log(
        &app,
        "AUTH",
        "Cancelling Gmail authorization...",
    );
    cancel_gmail_authorization();
    Ok(())
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

    let access_token = match refresh_access_token(
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
pub async fn list_gmail_accounts(
    app: AppHandle,
    firebase_id_token: String,
) -> Result<Vec<GmailAccountSummary>, String> {
    emit_system_log(
        &app,
        "GMAIL",
        "Loading connected Gmail accounts...",
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

    let client = create_http_client()?;

    let url = format!(
        "{}/api/gmail/accounts",
        NOTIFICATOR_API_BASE_URL
    );

    let response = client
        .get(&url)
        .bearer_auth(&firebase_id_token)
        .send()
        .await
        .map_err(|error| {
            emit_system_log(
                &app,
                "ERROR",
                "Unable to reach Gmail account service.",
            );

            format!(
                "Unable to load connected Gmail accounts: {}",
                error
            )
        })?;

    let status = response.status();

    let body = response
        .text()
        .await
        .map_err(|error| {
            format!(
                "Unable to read Gmail accounts response: {}",
                error
            )
        })?;

    if !status.is_success() {
        emit_system_log(
            &app,
            "ERROR",
            format!(
                "Gmail accounts request failed: {}",
                status
            ),
        );

        eprintln!(
            "[GMAIL] ACCOUNTS ERROR BODY: {}",
            body
        );

        return Err(format!(
            "Notificator Gmail accounts request failed {}: {}",
            status,
            body
        ));
    }

    let response =
        serde_json::from_str::<GmailAccountsResponse>(
            &body,
        )
        .map_err(|error| {
            format!(
                "Unable to parse Gmail accounts response: {}",
                error
            )
        })?;

    let accounts = response
        .accounts
        .into_iter()
        .map(|account| {
            GmailAccountSummary {
                account_id: account.account_id,
                email_address: account.email_address,
                is_primary: account.is_primary,
            }
        })
        .collect::<Vec<_>>();

    emit_system_log(
        &app,
        "GMAIL",
        format!(
            "{} connected Gmail account(s) loaded.",
            accounts.len()
        ),
    );

    Ok(accounts)
}

#[tauri::command]
pub async fn restore_gmail_accounts(
    app: AppHandle,
    firebase_id_token: String,
) -> Result<Vec<GmailAccountConnectionResult>, String> {
    emit_system_log(
        &app,
        "GMAIL",
        "Restoring all connected Gmail accounts...",
    );

    if firebase_id_token.trim().is_empty() {
        return Err(
            "Firebase authentication token is missing."
                .to_string(),
        );
    }

    let client = create_http_client()?;

    let url = format!(
        "{}/api/gmail/accounts",
        NOTIFICATOR_API_BASE_URL
    );

    let response = client
        .get(&url)
        .bearer_auth(&firebase_id_token)
        .send()
        .await
        .map_err(|error| {
            format!(
                "Unable to load connected Gmail accounts: {}",
                error
            )
        })?;

    let status = response.status();

    let body = response
        .text()
        .await
        .map_err(|error| {
            format!(
                "Unable to read Gmail accounts response: {}",
                error
            )
        })?;

    if !status.is_success() {
        return Err(format!(
            "Notificator Gmail accounts request failed {}: {}",
            status,
            body
        ));
    }

    let accounts_response =
        serde_json::from_str::<GmailAccountsResponse>(
            &body,
        )
        .map_err(|error| {
            format!(
                "Unable to parse Gmail accounts response: {}",
                error
            )
        })?;

    if accounts_response.accounts.is_empty() {
        emit_system_log(
            &app,
            "GMAIL",
            "No connected Gmail accounts found.",
        );

        return Ok(Vec::new());
    }

    let mut restored_accounts = Vec::new();

    for account in accounts_response.accounts {
        emit_system_log(
            &app,
            "SYNC",
            format!(
                "Restoring Gmail account: {}",
                account.email_address
            ),
        );

        let access_token =
            match refresh_access_token_for_account(
                &app,
                &firebase_id_token,
                &account.account_id,
            )
            .await
            {
                Ok(token) => token.access_token,
                Err(error) => {
                    emit_system_log(
                        &app,
                        "WARNING",
                        format!(
                            "Unable to restore Gmail account {}: {}",
                            account.email_address,
                            error
                        ),
                    );

                    continue;
                }
            };

        let connection =
            match load_gmail_connection(
                &app,
                &access_token,
            )
            .await
            {
                Ok(connection) => connection,
                Err(error) => {
                    emit_system_log(
                        &app,
                        "WARNING",
                        format!(
                            "Unable to load Gmail account {}: {}",
                            account.email_address,
                            error
                        ),
                    );

                    continue;
                }
            };

        restored_accounts.push(
            GmailAccountConnectionResult {
                account_id: account.account_id,
                email_address: account.email_address,
                is_primary: account.is_primary,
                profile: connection.profile,
                messages: connection.messages,
            },
        );
    }

    if restored_accounts.is_empty() {
        return Err(
            "Connected Gmail accounts were found, but none could be restored."
                .to_string(),
        );
    }

    emit_system_log(
        &app,
        "SYNC",
        format!(
            "{} Gmail account(s) restored successfully.",
            restored_accounts.len()
        ),
    );

    Ok(restored_accounts)
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

    let client = create_http_client()?;

    let url = format!(
        "{}/api/gmail/disconnect",
        NOTIFICATOR_API_BASE_URL
    );

    emit_system_log(
        &app,
        "AUTH",
        "Requesting stored Gmail credential removal...",
    );

    let response = client
        .post(&url)
        .bearer_auth(&firebase_id_token)
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

    let status = response.status();

    emit_system_log(
        &app,
        "GMAIL",
        format!(
            "Disconnect service responded: {}",
            status
        ),
    );

    let body = response
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

        eprintln!("[GMAIL] DISCONNECT ERROR BODY: {}", body);

        return Err(format!(
            "Notificator Gmail disconnect failed {}: {}",
            status,
            body
        ));
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

#[tauri::command]
pub async fn disconnect_gmail_account(
    app: AppHandle,
    firebase_id_token: String,
    account_id: String,
) -> Result<(), String> {
    emit_system_log(
        &app,
        "GMAIL",
        format!(
            "Disconnecting Gmail account: {}",
            account_id
        ),
    );

    if firebase_id_token.trim().is_empty() {
        return Err(
            "Firebase authentication token is missing."
                .to_string(),
        );
    }

    if account_id.trim().is_empty() {
        return Err(
            "Gmail account ID is missing."
                .to_string(),
        );
    }

    let client = create_http_client()?;

    let url = format!(
        "{}/api/gmail/disconnect",
        NOTIFICATOR_API_BASE_URL
    );

    let response = client
        .post(&url)
        .bearer_auth(&firebase_id_token)
        .json(&serde_json::json!({
            "accountId": account_id
        }))
        .send()
        .await
        .map_err(|error| {
            format!(
                "Unable to disconnect Gmail account: {}",
                error
            )
        })?;

    let status = response.status();

    let body = response
        .text()
        .await
        .unwrap_or_default();

    if !status.is_success() {
        emit_system_log(
            &app,
            "ERROR",
            format!(
                "Unable to disconnect Gmail account: {}",
                status
            ),
        );

        return Err(format!(
            "Notificator Gmail disconnect failed {}: {}",
            status,
            body
        ));
    }

    emit_system_log(
        &app,
        "GMAIL",
        "Gmail account disconnected successfully.",
    );

    Ok(())
}

#[tauri::command]
pub async fn set_primary_gmail_account(
    app: AppHandle,
    firebase_id_token: String,
    account_id: String,
) -> Result<(), String> {
    emit_system_log(
        &app,
        "GMAIL",
        format!(
            "Setting primary Gmail account: {}",
            account_id
        ),
    );

    if firebase_id_token.trim().is_empty() {
        return Err(
            "Firebase authentication token is missing."
                .to_string(),
        );
    }

    if account_id.trim().is_empty() {
        return Err(
            "Gmail account ID is missing."
                .to_string(),
        );
    }

    let client = create_http_client()?;

    let url = format!(
        "{}/api/gmail/primary",
        NOTIFICATOR_API_BASE_URL
    );

    let response = client
        .post(&url)
        .bearer_auth(&firebase_id_token)
        .json(&serde_json::json!({
            "accountId": account_id
        }))
        .send()
        .await
        .map_err(|error| {
            format!(
                "Unable to set primary Gmail account: {}",
                error
            )
        })?;

    let status = response.status();

    let body = response
        .text()
        .await
        .unwrap_or_default();

    if !status.is_success() {
        emit_system_log(
            &app,
            "ERROR",
            format!(
                "Unable to set primary Gmail account: {}",
                status
            ),
        );

        return Err(format!(
            "Notificator Gmail primary-account update failed {}: {}",
            status,
            body
        ));
    }

    emit_system_log(
        &app,
        "GMAIL",
        "Primary Gmail account updated successfully.",
    );

    Ok(())
}