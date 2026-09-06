import { Injectable, computed, inject, signal } from '@angular/core';
import { GmailService } from './gmail.service';
import { SystemLogService } from './system-log.service';
import { GmailMessageTrackerService } from './gmail-message-tracker.service';
import { GmailNotificationService } from './gmail-notification.service';
import { GmailUnreadSyncService } from './gmail-unread-sync.service';
import { GmailAccountConnectionResult, GmailProfile } from '../models/gmail-profile.model';
import { OAuthAssistanceService } from './oauth-assistance.service';
import { OAuthIssue } from '../models/oauth-assistance.model';

@Injectable({
  providedIn: 'root',
})
export class GmailStateService {
  private readonly gmail = inject(GmailService);
  private readonly systemLogs = inject(SystemLogService);
  private readonly messageTracker = inject(GmailMessageTrackerService);
  private readonly notifications = inject(GmailNotificationService);
  private readonly unreadSync = inject(GmailUnreadSyncService);
  private readonly accountsSignal = signal<GmailAccountConnectionResult[]>([]);
  private readonly oauthAssistance = inject(OAuthAssistanceService);

  private readonly loadingSignal = signal(false);
  private readonly restoringSignal = signal(false);
  private readonly connectingSignal = signal(false);
  private readonly disconnectingSignal = signal(false);
  private readonly initializedSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly oauthIssueSignal = signal<OAuthIssue | null>(null);

  private browserOAuthErrorReported = false;

  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly accounts = this.accountsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly restoring = this.restoringSignal.asReadonly();
  readonly connecting = this.connectingSignal.asReadonly();
  readonly disconnecting = this.disconnectingSignal.asReadonly();
  readonly initialized = this.initializedSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly oauthIssue = this.oauthIssueSignal.asReadonly();

  readonly connected = computed(() => this.accountsSignal().length > 0);

  readonly primaryAccount = computed(() => {
    const accounts = this.accountsSignal();

    return accounts.find((account) => account.isPrimary) ?? accounts[0] ?? null;
  });

  readonly profile = computed<GmailProfile | null>(() => this.primaryAccount()?.profile ?? null);

  readonly emailAddress = computed(() => this.primaryAccount()?.emailAddress ?? null);

  readonly messages = computed(() => {
    return this.accountsSignal()
      .flatMap((account) => account.messages)
      .sort((a, b) => {
        const aTime = new Date(a.receivedAt).getTime();
        const bTime = new Date(b.receivedAt).getTime();

        return bTime - aTime;
      });
  });

  readonly messageCount = computed(() => this.messages().length);

  readonly unreadCount = computed(() =>
    this.accountsSignal().reduce((total, account) => total + account.profile.unreadCount, 0),
  );

  readonly importantCount = computed(
    () => this.messages().filter((message) => message.isImportant).length,
  );

  readonly starredCount = computed(
    () => this.messages().filter((message) => message.isStarred).length,
  );

  async initialize(): Promise<void> {
    if (this.initializedSignal() || this.restoringSignal()) {
      return;
    }

    this.restoringSignal.set(true);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.systemLogs.add('GMAIL', 'Restoring connected Gmail accounts...');

    try {
      const accounts = await this.gmail.restoreAccounts();

      if (accounts.length === 0) {
        this.systemLogs.add('WARNING', 'No stored Gmail connection found.');

        await this.resetConnection();

        return;
      }

      await this.setAccounts(accounts, false);

      this.systemLogs.add('GMAIL', `${accounts.length} Gmail account(s) restored.`);
    } catch {
      this.systemLogs.add('WARNING', 'No stored Gmail connection found.');

      await this.resetConnection();
    } finally {
      this.restoringSignal.set(false);
      this.loadingSignal.set(false);
      this.initializedSignal.set(true);
    }
  }

  async connect(): Promise<void> {
    if (this.connectingSignal() || this.disconnectingSignal()) {
      return;
    }

    this.connectingSignal.set(true);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.oauthIssueSignal.set(null);

    this.systemLogs.add('GMAIL', 'Connecting Gmail account...');

    try {
      const result = await this.gmail.connect();

      this.systemLogs.add('GMAIL', `Gmail authorized: ${result.profile.emailAddress}`);

      const accounts = await this.gmail.restoreAccounts();

      await this.setAccounts(accounts, false);

      this.systemLogs.add('GMAIL', `Gmail connected: ${result.profile.emailAddress}`);
    } catch (error) {
      const message = this.getErrorMessage(error);

      this.errorSignal.set(message);

      if (!this.browserOAuthErrorReported) {
        this.oauthIssueSignal.set(this.oauthAssistance.resolve(error));
      }

      this.systemLogs.add(
        this.browserOAuthErrorReported ? 'WARNING' : 'ERROR',
        this.browserOAuthErrorReported
          ? 'Gmail browser authorization problem reported by user.'
          : `Gmail connection failed: ${message}`,
      );

      throw error;
    } finally {
      this.connectingSignal.set(false);
      this.loadingSignal.set(false);
      this.browserOAuthErrorReported = false;
    }
  }

  async cancelConnect(): Promise<void> {
    await this.gmail.cancelConnect();
  }

  clearOAuthIssue(): void {
    this.oauthIssueSignal.set(null);
  }

  async refresh(): Promise<void> {
    if (!this.connected()) {
      return;
    }

    if (this.loadingSignal() || this.connectingSignal() || this.disconnectingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.systemLogs.add('SYNC', 'Refreshing Gmail accounts...');

    try {
      const accounts = await this.gmail.restoreAccounts();

      await this.setAccounts(accounts, true);

      this.systemLogs.add(
        'SYNC',
        `${accounts.length} Gmail account(s) synchronized. ${this.messages().length} recent messages loaded.`,
      );
    } catch (error) {
      const message = this.getErrorMessage(error);

      this.errorSignal.set(message);

      this.systemLogs.add('ERROR', `Gmail refresh failed: ${message}`);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  startAutoRefresh(intervalMs = 60_000): void {
    if (this.autoRefreshTimer) {
      return;
    }

    this.systemLogs.add('SYNC', 'Automatic Gmail refresh started.');

    this.autoRefreshTimer = setInterval(() => {
      if (!this.connected()) {
        return;
      }

      void this.refresh();
    }, intervalMs);
  }

  stopAutoRefresh(): void {
    if (!this.autoRefreshTimer) {
      return;
    }

    clearInterval(this.autoRefreshTimer);

    this.autoRefreshTimer = null;

    this.systemLogs.add('SYNC', 'Automatic Gmail refresh stopped.');
  }

  async disconnect(): Promise<void> {
    const primaryAccount = this.primaryAccount();

    if (!primaryAccount) {
      return;
    }

    await this.disconnectAccount(primaryAccount.accountId);
  }

  async disconnectAccount(accountId: string): Promise<void> {
    if (this.disconnectingSignal() || this.connectingSignal()) {
      return;
    }

    this.disconnectingSignal.set(true);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    const account = this.accountsSignal().find((item) => item.accountId === accountId);

    const label = account?.emailAddress ?? accountId;

    this.systemLogs.add('GMAIL', `Disconnecting Gmail account: ${label}`);

    try {
      await this.gmail.disconnectAccount(accountId);

      const accounts = await this.gmail.restoreAccounts();

      if (accounts.length === 0) {
        await this.resetConnection();
      } else {
        await this.setAccounts(accounts, false);
      }

      this.systemLogs.add('GMAIL', `Gmail disconnected: ${label}`);
    } catch (error) {
      const message = this.getErrorMessage(error);

      this.errorSignal.set(message);

      this.systemLogs.add('ERROR', `Gmail disconnect failed: ${message}`);

      throw error;
    } finally {
      this.disconnectingSignal.set(false);
      this.loadingSignal.set(false);
    }
  }

  async setPrimaryAccount(accountId: string): Promise<void> {
    if (this.loadingSignal() || this.disconnectingSignal()) {
      return;
    }

    const account = this.accountsSignal().find((item) => item.accountId === accountId);

    if (!account || account.isPrimary) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.systemLogs.add('GMAIL', `Setting primary Gmail account: ${account.emailAddress}`);

    try {
      await this.gmail.setPrimaryAccount(accountId);

      this.accountsSignal.update((accounts) =>
        accounts.map((item) => ({
          ...item,
          isPrimary: item.accountId === accountId,
        })),
      );

      this.systemLogs.add('GMAIL', `Primary Gmail account updated: ${account.emailAddress}`);
    } catch (error) {
      const message = this.getErrorMessage(error);

      this.errorSignal.set(message);

      this.systemLogs.add('ERROR', `Unable to update primary Gmail account: ${message}`);

      throw error;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  private async setAccounts(
    accounts: GmailAccountConnectionResult[],
    detectNewMessages: boolean,
  ): Promise<void> {
    const messages = accounts.flatMap((account) => account.messages);

    if (detectNewMessages) {
      const newMessages = this.messageTracker.getNewMessages(messages);

      await this.notifications.handleNewMessages(newMessages);
    }

    this.accountsSignal.set(accounts);

    this.messageTracker.remember(messages);

    this.errorSignal.set(null);

    await this.unreadSync.sync(this.unreadCount());
  }

  private async resetConnection(): Promise<void> {
    this.accountsSignal.set([]);
    this.errorSignal.set(null);
    this.oauthIssueSignal.set(null);
    this.messageTracker.clear();

    await this.unreadSync.sync(0);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  async reportBrowserOAuthError(): Promise<void> {
    this.browserOAuthErrorReported = true;

    this.oauthIssueSignal.set(this.oauthAssistance.browserError());

    if (this.connectingSignal()) {
      await this.gmail.cancelConnect();
    }
  }
}
