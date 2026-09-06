use serde::{Deserialize, Serialize};

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
    pub account_id: String,
    pub account_email: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GmailAccountSummary {
    pub account_id: String,
    pub email_address: String,
    pub is_primary: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GmailAccountConnectionResult {
    pub account_id: String,
    pub email_address: String,
    pub is_primary: bool,
    pub profile: GmailProfile,
    pub messages: Vec<GmailMessage>,
}

#[derive(Deserialize)]
pub(super) struct GoogleProfileResponse {
    #[serde(rename = "emailAddress")]
    pub email_address: String,
    #[serde(rename = "messagesTotal")]
    pub messages_total: u64,
    #[serde(rename = "threadsTotal")]
    pub threads_total: u64,
    #[serde(rename = "historyId")]
    pub history_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GmailLabelResponse {
    #[serde(default)]
    pub messages_unread: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GmailOAuthConfigResponse {
    pub client_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GmailApiAccount {
    pub account_id: String,
    pub email_address: String,
    pub is_primary: bool,
}

// #[derive(Deserialize)]
// #[serde(rename_all = "camelCase")]
// pub(super) struct GmailAccessTokenResponse {
//     pub access_token: String,
//     #[serde(default)]
//     pub account: Option<GmailApiAccount>,
// }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GmailAccessTokenResponse {
    pub access_token: String,
}

// #[derive(Deserialize)]
// #[serde(rename_all = "camelCase")]
// pub(super) struct GmailAccountsResponse {
//     #[serde(default)]
//     pub accounts: Vec<GmailApiAccount>,
//     #[serde(default)]
//     pub count: usize,
// }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GmailAccountsResponse {
    #[serde(default)]
    pub accounts: Vec<GmailApiAccount>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GmailExchangeRequest<'a> {
    pub code: &'a str,
    pub code_verifier: &'a str,
    pub redirect_uri: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GmailAccountRequest<'a> {
    pub account_id: &'a str,
}

#[derive(Deserialize)]
pub(super) struct GmailMessageListResponse {
    #[serde(default)]
    pub messages: Vec<GmailMessageReference>,
}

#[derive(Deserialize)]
pub(super) struct GmailMessageReference {
    pub id: String,
}

#[derive(Deserialize)]
pub(super) struct GmailMessageResponse {
    pub id: String,
    #[serde(rename = "threadId")]
    pub thread_id: String,
    #[serde(default)]
    pub snippet: String,
    #[serde(default, rename = "labelIds")]
    pub label_ids: Vec<String>,
    pub payload: Option<GmailPayload>,
}

#[derive(Deserialize)]
pub(super) struct GmailPayload {
    #[serde(default)]
    pub headers: Vec<GmailHeader>,
}

#[derive(Deserialize)]
pub(super) struct GmailHeader {
    pub name: String,
    pub value: String,
}

pub(super) struct OAuthCallback {
    pub code: String,
    pub state: String,
}