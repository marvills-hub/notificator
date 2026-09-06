import { OAuthIssue, OAuthIssueStep } from '../models/oauth-assistance.model';

export const GOOGLE_CLOUD_LINKS = {
  console: 'https://console.cloud.google.com/',
  gmailApi: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
  authOverview: 'https://console.cloud.google.com/auth/overview',
  audience: 'https://console.cloud.google.com/auth/audience',
  dataAccess: 'https://console.cloud.google.com/auth/scopes',
  clients: 'https://console.cloud.google.com/auth/clients',
};

export const GOOGLE_CLOUD_SETUP_STEPS: OAuthIssueStep[] = [
  {
    text: 'Open Google Cloud Console and sign in with the Google account that will manage Notificator.',
    linkLabel: 'OPEN GOOGLE CLOUD',
    link: GOOGLE_CLOUD_LINKS.console,
  },
  {
    text: 'If you already have a Google Cloud project for Notificator, select it. Otherwise create a new project and name it Notificator.',
  },
  {
    text: 'Enable the Gmail API for the selected project.',
    linkLabel: 'OPEN GMAIL API',
    link: GOOGLE_CLOUD_LINKS.gmailApi,
  },
  {
    text: 'Open Google Auth Platform. If Google says the platform is not configured yet, click Get Started.',
    linkLabel: 'OPEN GOOGLE AUTH',
    link: GOOGLE_CLOUD_LINKS.authOverview,
  },
  {
    text: 'Under App Information, set the app name to Notificator and choose a user support email.',
  },
  {
    text: 'Set the Audience to External if Notificator needs to connect regular Gmail accounts outside your own Google Workspace organization.',
    linkLabel: 'OPEN AUDIENCE',
    link: GOOGLE_CLOUD_LINKS.audience,
  },
  {
    text: 'Enter a developer contact email, review the Google API Services User Data Policy, and finish creating the Google Auth configuration.',
  },
  {
    text: 'Open Data Access and add the Gmail read-only scope: https://www.googleapis.com/auth/gmail.readonly.',
    linkLabel: 'OPEN DATA ACCESS',
    link: GOOGLE_CLOUD_LINKS.dataAccess,
  },
  {
    text: 'While Notificator is still in Testing, open Audience and find the Test users section.',
    linkLabel: 'OPEN TEST USERS',
    link: GOOGLE_CLOUD_LINKS.audience,
  },
  {
    text: 'Click Add users, enter every Gmail account that you want to test with Notificator, and save the changes.',
  },
  {
    text: 'Open Google Auth Platform → Clients.',
    linkLabel: 'OPEN CLIENTS',
    link: GOOGLE_CLOUD_LINKS.clients,
  },
  {
    text: 'Click Create Client and choose Application type → Desktop app.',
  },
  {
    text: 'Give the OAuth client a recognizable name such as Notificator Desktop and click Create.',
  },
  {
    text: 'After Google creates the Desktop OAuth client, copy the value labeled Client ID. It normally ends with .apps.googleusercontent.com.',
  },
  {
    text: 'Do not enter your Gmail password into Notificator. The OAuth Client ID identifies the Notificator app and is shared by all Gmail accounts that authorize it.',
  },
  {
    text: 'Configure the Notificator backend API with this OAuth Client ID. The desktop app obtains the Client ID from the Notificator API instead of asking every Gmail user to enter it manually.',
  },
  {
    text: 'Do not put an OAuth client secret directly inside Angular, Rust source code, GitHub, or the compiled desktop application. Desktop applications cannot safely keep client secrets.',
  },
  {
    text: 'Return to Notificator and click Try Again. Notificator should now open Google authorization using the configured OAuth Client ID.',
  },
];

export const OAUTH_ISSUES = {
  cancelled: {
    type: 'cancelled',
    title: 'Gmail connection cancelled',
    message: 'The Google authorization process was cancelled.',
    steps: [
      {
        text: 'Click Connect when you are ready to try again.',
      },
      {
        text: 'Choose the Gmail account in the Google browser window and complete the authorization steps.',
      },
    ],
    canRetry: true,
  } satisfies OAuthIssue,

  accessBlocked: {
    type: 'access-blocked',
    title: 'Google blocked Gmail access',
    message:
      'Google denied this Gmail account access to Notificator. If Notificator is still in development or testing, the Gmail account normally needs to be added as an approved OAuth test user.',
    steps: GOOGLE_CLOUD_SETUP_STEPS,
    canRetry: true,
  } satisfies OAuthIssue,

  browserError: {
    type: 'browser-error',
    title: 'Google blocked Gmail access',
    message:
      'If Google shows Error 403: access_denied or says Notificator has not completed the verification process, the Gmail account may not yet be approved to use the development version of Notificator.',
    steps: GOOGLE_CLOUD_SETUP_STEPS,
    canRetry: true,
  } satisfies OAuthIssue,

  googleAuthorizationFailed: {
    type: 'browser-error',
    title: 'Google authorization failed',
    message: 'Google could not complete the Gmail authorization request.',
    steps: [
      {
        text: 'Check the Google authorization window for the exact error message.',
      },
      {
        text: 'Make sure Google Cloud and Google Auth Platform have been configured correctly.',
        linkLabel: 'OPEN GOOGLE AUTH',
        link: GOOGLE_CLOUD_LINKS.authOverview,
      },
      {
        text: 'Close the failed Google authorization page.',
      },
      {
        text: 'Return to Notificator and try connecting again.',
      },
    ],
    canRetry: true,
  } satisfies OAuthIssue,

  testUser: {
    type: 'test-user',
    title: 'Gmail account needs test access',
    message:
      'Notificator is currently using Google OAuth in testing mode. Gmail accounts must be approved under Google Auth Platform → Audience → Test users before they can connect.',
    steps: [
      {
        text: 'Open Google Cloud Console and sign in with the Google account that manages Notificator.',
        linkLabel: 'OPEN GOOGLE CLOUD',
        link: GOOGLE_CLOUD_LINKS.console,
      },
      {
        text: 'Select the Google Cloud project used by Notificator.',
      },
      {
        text: 'Open Google Auth Platform → Audience.',
        linkLabel: 'OPEN AUDIENCE',
        link: GOOGLE_CLOUD_LINKS.audience,
      },
      {
        text: 'Under Test users, click Add users.',
      },
      {
        text: 'Enter the Gmail account you want to connect and save the changes.',
      },
      {
        text: 'Return to Notificator and click Try Again.',
      },
    ],
    canRetry: true,
  } satisfies OAuthIssue,

  timeout: {
    type: 'timeout',
    title: 'Google did not return to Notificator',
    message:
      'Notificator waited for Google to finish authorization, but Google never returned to the app. If the browser shows Access blocked or Error 403: access_denied, the Gmail account may not be approved as a Google OAuth test user.',
    steps: [
      {
        text: 'Check the Google browser window opened by Notificator.',
      },
      {
        text: 'If Google shows Access blocked or Error 403: access_denied, note which Gmail account was blocked.',
      },
      {
        text: 'Open Google Auth Platform → Audience.',
        linkLabel: 'OPEN AUDIENCE',
        link: GOOGLE_CLOUD_LINKS.audience,
      },
      {
        text: 'Under Test users, click Add users.',
      },
      {
        text: 'Add the blocked Gmail account and save the changes.',
      },
      {
        text: 'If Google Cloud has never been configured for Notificator, complete the full Google Cloud setup including creating a Desktop OAuth Client ID.',
        linkLabel: 'OPEN GOOGLE CLOUD',
        link: GOOGLE_CLOUD_LINKS.console,
      },
      {
        text: 'Return to Notificator and click Try Again.',
      },
    ],
    canRetry: true,
  } satisfies OAuthIssue,

  network: {
    type: 'network',
    title: 'Connection problem',
    message: 'Notificator could not complete communication with Google or the Notificator API.',
    steps: [
      {
        text: 'Check your internet connection.',
      },
      {
        text: 'Make sure Google services are reachable.',
      },
      {
        text: 'Try the connection again.',
      },
    ],
    canRetry: true,
  } satisfies OAuthIssue,

  tokenExchange: {
    type: 'token-exchange',
    title: 'Authorization could not be completed',
    message:
      'Google authorization started successfully, but Notificator could not complete the secure token exchange.',
    steps: [
      {
        text: 'Try connecting the Gmail account again.',
      },
      {
        text: 'If the problem continues, verify the Notificator API and Google OAuth configuration.',
        linkLabel: 'OPEN GOOGLE AUTH',
        link: GOOGLE_CLOUD_LINKS.authOverview,
      },
      {
        text: 'Make sure the OAuth Client ID configured in the Notificator backend matches the Desktop OAuth client created in Google Cloud.',
        linkLabel: 'OPEN CLIENTS',
        link: GOOGLE_CLOUD_LINKS.clients,
      },
    ],
    canRetry: true,
  } satisfies OAuthIssue,

  unknown: {
    type: 'unknown',
    title: 'Gmail connection problem',
    message: 'Notificator could not complete the Gmail authorization process.',
    steps: [
      {
        text: 'Check the message displayed in the Google browser window.',
      },
      {
        text: 'Make sure the Gmail account is allowed to authorize Notificator.',
      },
      {
        text: 'If Notificator is still in testing mode, verify that the Gmail account is listed under Test users.',
        linkLabel: 'OPEN TEST USERS',
        link: GOOGLE_CLOUD_LINKS.audience,
      },
      {
        text: 'Verify that a Desktop OAuth client exists and that its Client ID has been configured in the Notificator backend.',
        linkLabel: 'OPEN CLIENTS',
        link: GOOGLE_CLOUD_LINKS.clients,
      },
      {
        text: 'Try connecting again.',
      },
    ],
    canRetry: true,
  } satisfies OAuthIssue,
};
