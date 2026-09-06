import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { GmailStateService } from '../../core/services/gmail-state.service';

interface ProviderOption {
  id: 'gmail' | 'outlook' | 'whatsapp';
  name: string;
  description: string;
  status: 'available' | 'coming-soon';
}

interface ConnectedAccountView {
  id: string;
  provider: string;
  name: string;
  email: string;
  unread: number;
  important: number;
  syncing: boolean;
  isPrimary: boolean;
}

interface GoogleOAuthSetupForm {
  accountId: string;
  scriptName: string;
  apiToken: string;
  clientId: string;
  clientSecret: string;
}

@Component({
  selector: 'app-accounts',
  standalone: true,
  templateUrl: './accounts.component.html',
  styleUrl: './accounts.component.scss',
})
export class AccountsComponent implements OnInit, OnDestroy {
  private readonly gmailState = inject(GmailStateService);

  readonly connectingProvider = signal<string | null>(null);
  readonly restoringAccounts = this.gmailState.restoring;
  readonly gmailMessages = this.gmailState.messages;
  readonly oauthIssue = this.gmailState.oauthIssue;
  readonly showOAuthHelp = signal(false);
  readonly showGoogleOAuthSetup = signal(false);
  readonly savingGoogleOAuthSetup = signal(false);
  readonly googleOAuthSetupSuccess = signal(false);
  readonly googleOAuthSetupError = signal<string | null>(null);

  readonly googleOAuthSetup = signal<GoogleOAuthSetupForm>({
    accountId: '',
    scriptName: 'notificator-api',
    apiToken: '',
    clientId: '',
    clientSecret: '',
  });

  private oauthHelpTimer: ReturnType<typeof setTimeout> | null = null;

  readonly accounts = computed<ConnectedAccountView[]>(() => {
    return this.gmailState.accounts().map((account) => ({
      id: account.accountId,
      provider: 'Gmail',
      name: account.isPrimary ? 'Primary Gmail' : 'Gmail',
      email: account.emailAddress,
      unread: account.profile.unreadCount,
      important: account.messages.filter((message) => message.isImportant).length,
      syncing: this.gmailState.loading(),
      isPrimary: account.isPrimary,
    }));
  });

  readonly googleOAuthSetupValid = computed(() => {
    const form = this.googleOAuthSetup();

    return (
      form.accountId.trim().length > 0 &&
      form.scriptName.trim().length > 0 &&
      form.apiToken.trim().length > 0 &&
      form.clientId.trim().length > 0 &&
      form.clientSecret.trim().length > 0
    );
  });

  readonly providers: ProviderOption[] = [
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Connect personal or work Gmail accounts.',
      status: 'available',
    },
    {
      id: 'outlook',
      name: 'Outlook',
      description: 'Connect Microsoft Outlook or Microsoft 365.',
      status: 'available',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      description: 'WhatsApp integration will be added later.',
      status: 'coming-soon',
    },
  ];

  async ngOnInit(): Promise<void> {
    await this.gmailState.initialize();
  }

  ngOnDestroy(): void {
    this.clearOAuthHelpTimer();
  }

  async connect(provider: ProviderOption): Promise<void> {
    if (provider.status === 'coming-soon') {
      return;
    }

    if (this.connectingProvider()) {
      return;
    }

    this.gmailState.clearOAuthIssue();
    this.connectingProvider.set(provider.id);

    if (provider.id === 'gmail') {
      this.startOAuthHelpTimer();
    }

    try {
      if (provider.id === 'gmail') {
        await this.connectGmail();
      }

      if (provider.id === 'outlook') {
        await this.connectOutlook();
      }
    } finally {
      this.clearOAuthHelpTimer();
      this.connectingProvider.set(null);
    }
  }

  async retryGmailConnection(): Promise<void> {
    this.gmailState.clearOAuthIssue();

    const gmailProvider = this.providers.find((provider) => provider.id === 'gmail');

    if (!gmailProvider) {
      return;
    }

    await this.connect(gmailProvider);
  }

  closeOAuthIssue(): void {
    this.gmailState.clearOAuthIssue();
  }

  async cancelConnect(provider: ProviderOption): Promise<void> {
    if (provider.id !== 'gmail') {
      return;
    }

    try {
      await this.gmailState.cancelConnect();
    } catch (error) {
      console.error('[ACCOUNTS] Unable to cancel Gmail connection.', error);
    }
  }

  async setPrimary(account: ConnectedAccountView): Promise<void> {
    if (account.provider !== 'Gmail' || account.isPrimary) {
      return;
    }

    try {
      await this.gmailState.setPrimaryAccount(account.id);

      console.log('[ACCOUNTS] Primary Gmail updated.', account.email);
    } catch (error) {
      console.error('[ACCOUNTS] Unable to set primary Gmail account.', error);
    }
  }

  async disconnect(account: ConnectedAccountView): Promise<void> {
    if (account.provider !== 'Gmail') {
      return;
    }

    try {
      await this.gmailState.disconnectAccount(account.id);

      console.log('[ACCOUNTS] Gmail disconnected.', account.email);
    } catch (error) {
      console.error('[ACCOUNTS] Unable to disconnect Gmail.', error);
    }
  }

  async reportBrowserError(provider: ProviderOption): Promise<void> {
    if (provider.id !== 'gmail') {
      return;
    }

    try {
      await this.gmailState.reportBrowserOAuthError();
    } catch (error) {
      console.error('[ACCOUNTS] Unable to report Gmail browser error.', error);
    }
  }

  openOAuthHelp(): void {
    this.gmailState.clearOAuthIssue();

    void this.gmailState.reportBrowserOAuthError();
  }

  openGoogleOAuthSetup(): void {
    this.googleOAuthSetupError.set(null);
    this.googleOAuthSetupSuccess.set(false);
    this.showGoogleOAuthSetup.set(true);
  }

  closeGoogleOAuthSetup(): void {
    if (this.savingGoogleOAuthSetup()) {
      return;
    }

    this.showGoogleOAuthSetup.set(false);
    this.googleOAuthSetupError.set(null);
    this.googleOAuthSetupSuccess.set(false);
    this.clearGoogleOAuthSecrets();
  }

  updateGoogleOAuthField(field: keyof GoogleOAuthSetupForm, value: string): void {
    this.googleOAuthSetup.update((current) => ({
      ...current,
      [field]: value,
    }));

    this.googleOAuthSetupError.set(null);
    this.googleOAuthSetupSuccess.set(false);
  }

  async saveGoogleOAuthSetup(): Promise<void> {
    if (!this.googleOAuthSetupValid() || this.savingGoogleOAuthSetup()) {
      return;
    }

    const form = this.googleOAuthSetup();

    this.savingGoogleOAuthSetup.set(true);
    this.googleOAuthSetupError.set(null);
    this.googleOAuthSetupSuccess.set(false);

    try {
      await invoke<void>('configure_google_oauth', {
        accountId: form.accountId.trim(),
        scriptName: form.scriptName.trim(),
        apiToken: form.apiToken.trim(),
        clientId: form.clientId.trim(),
        clientSecret: form.clientSecret.trim(),
      });

      this.googleOAuthSetupSuccess.set(true);
      this.clearGoogleOAuthSecrets();

      console.log('[ACCOUNTS] Google OAuth configuration saved successfully.');
    } catch (error) {
      const message = this.getErrorMessage(error);

      this.googleOAuthSetupError.set(message);

      console.error('[ACCOUNTS] Unable to save Google OAuth configuration.', error);
    } finally {
      this.savingGoogleOAuthSetup.set(false);
    }
  }

  async saveGoogleOAuthSetupAndConnect(): Promise<void> {
    await this.saveGoogleOAuthSetup();

    if (!this.googleOAuthSetupSuccess()) {
      return;
    }

    this.showGoogleOAuthSetup.set(false);
    this.gmailState.clearOAuthIssue();

    await this.retryGmailConnection();
  }

  async openOAuthLink(url: string): Promise<void> {
    try {
      await openUrl(url);
    } catch (error) {
      console.error('[ACCOUNTS] Unable to open OAuth setup link.', error);
    }
  }

  private async connectGmail(): Promise<void> {
    try {
      console.log('[ACCOUNTS] Starting Gmail connection...');

      await this.gmailState.connect();

      console.log('[ACCOUNTS] Gmail connected successfully.');
    } catch (error) {
      console.error('[ACCOUNTS] Gmail connection failed.', error);
    }
  }

  private async connectOutlook(): Promise<void> {
    console.log('[OUTLOOK] Starting Outlook OAuth...');
  }

  private startOAuthHelpTimer(): void {
    this.clearOAuthHelpTimer();

    this.oauthHelpTimer = setTimeout(() => {
      if (this.connectingProvider() === 'gmail') {
        this.showOAuthHelp.set(true);
      }
    }, 12000);
  }

  private clearOAuthHelpTimer(): void {
    if (this.oauthHelpTimer) {
      clearTimeout(this.oauthHelpTimer);
      this.oauthHelpTimer = null;
    }

    this.showOAuthHelp.set(false);
  }

  private clearGoogleOAuthSecrets(): void {
    this.googleOAuthSetup.update((current) => ({
      ...current,
      apiToken: '',
      clientSecret: '',
    }));
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
