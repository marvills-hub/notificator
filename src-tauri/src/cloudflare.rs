use reqwest::Client;
use serde::Serialize;

const GOOGLE_CLIENT_ID_SECRET: &str = "GOOGLE_OAUTH_CLIENT_ID";
const GOOGLE_CLIENT_SECRET_SECRET: &str = "GOOGLE_OAUTH_CLIENT_SECRET";

#[derive(Serialize)]
struct CloudflareSecret<'a> {
    name: &'a str,
    text: &'a str,
    r#type: &'static str,
}

#[tauri::command]
pub async fn configure_google_oauth(
    account_id: String,
    script_name: String,
    api_token: String,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let account_id = account_id.trim();
    let script_name = script_name.trim();
    let api_token = api_token.trim();
    let client_id = client_id.trim();
    let client_secret = client_secret.trim();

    if account_id.is_empty() {
        return Err("Cloudflare Account ID is required.".into());
    }

    if script_name.is_empty() {
        return Err("Cloudflare Worker name is required.".into());
    }

    if api_token.is_empty() {
        return Err("Cloudflare API token is required.".into());
    }

    if client_id.is_empty() {
        return Err("Google OAuth Client ID is required.".into());
    }

    if client_secret.is_empty() {
        return Err("Google OAuth Client Secret is required.".into());
    }

    if !client_id.ends_with(".apps.googleusercontent.com") {
        return Err("The Google OAuth Client ID does not look valid.".into());
    }

    validate_path_value(account_id, "Cloudflare Account ID")?;
    validate_path_value(script_name, "Cloudflare Worker name")?;

    let client = Client::new();

    update_secret(
        &client,
        account_id,
        script_name,
        api_token,
        GOOGLE_CLIENT_ID_SECRET,
        client_id,
    )
    .await?;

    update_secret(
        &client,
        account_id,
        script_name,
        api_token,
        GOOGLE_CLIENT_SECRET_SECRET,
        client_secret,
    )
    .await?;

    Ok(())
}

async fn update_secret(
    client: &Client,
    account_id: &str,
    script_name: &str,
    api_token: &str,
    name: &str,
    value: &str,
) -> Result<(), String> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}/secrets"
    );

    let response = client
        .put(url)
        .bearer_auth(api_token)
        .json(&CloudflareSecret {
            name,
            text: value,
            r#type: "secret_text",
        })
        .send()
        .await
        .map_err(|error| format!("Unable to contact Cloudflare: {error}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response
        .text()
        .await
        .unwrap_or_else(|_| "Unknown Cloudflare error".into());

    Err(format!(
        "Cloudflare rejected the configuration ({status}): {body}"
    ))
}

fn validate_path_value(
    value: &str,
    label: &str,
) -> Result<(), String> {
    if value.chars().all(|character| {
        character.is_ascii_alphanumeric()
            || character == '-'
            || character == '_'
    }) {
        return Ok(());
    }

    Err(format!("{label} contains invalid characters."))
}