import { Injectable, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

import { GmailService } from './gmail.service';
import { DesktopNotificationService } from './desktop-notification.service';
import { SystemLogService } from './system-log.service';
import { NotificationRulesService } from './notification-rules.service';

import { GmailConnectionResult, GmailMessage, GmailProfile } from '../models/gmail-profile.model';
import { CriticalAlertService } from './critical-alert.service';

@Injectable({
  providedIn: 'root',
})
export class GmailStateService {
  private readonly gmail = inject(GmailService);

  private readonly desktopNotifications = inject(DesktopNotificationService);

  private readonly systemLogs = inject(SystemLogService);

  private readonly notificationRules = inject(NotificationRulesService);

  private readonly profileSignal = signal<GmailProfile | null>(null);

  private readonly messagesSignal = signal<GmailMessage[]>([]);

  private readonly criticalAlerts = inject(CriticalAlertService);

  private readonly loadingSignal = signal(false);

  private readonly restoringSignal = signal(false);

  private readonly connectingSignal = signal(false);

  private readonly disconnectingSignal = signal(false);

  private readonly initializedSignal = signal(false);

  private readonly errorSignal = signal<string | null>(null);

  private readonly knownMessageIds = new Set<string>();

  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly profile = this.profileSignal.asReadonly();

  readonly messages = this.messagesSignal.asReadonly();

  readonly loading = this.loadingSignal.asReadonly();

  readonly restoring = this.restoringSignal.asReadonly();

  readonly connecting = this.connectingSignal.asReadonly();

  readonly disconnecting = this.disconnectingSignal.asReadonly();

  readonly initialized = this.initializedSignal.asReadonly();

  readonly error = this.errorSignal.asReadonly();

  readonly connected = computed(() => this.profileSignal() !== null);

  readonly emailAddress = computed(() => this.profileSignal()?.emailAddress ?? null);

  readonly messageCount = computed(() => this.messagesSignal().length);

  readonly unreadCount = computed(() => this.profileSignal()?.unreadCount ?? 0);

  readonly importantCount = computed(
    () => this.messagesSignal().filter((message) => message.isImportant).length,
  );

  readonly starredCount = computed(
    () => this.messagesSignal().filter((message) => message.isStarred).length,
  );

  async initialize(): Promise<void> {
    if (this.initializedSignal() || this.restoringSignal()) {
      return;
    }

    this.restoringSignal.set(true);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.systemLogs.add('GMAIL', 'Restoring Gmail connection...');

    try {
      const result = await this.gmail.restore();

      await this.setConnection(result, false);

      this.systemLogs.add('GMAIL', `Gmail restored: ${result.profile.emailAddress}`);
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

    this.systemLogs.add('GMAIL', 'Connecting Gmail account...');

    try {
      const result = await this.gmail.connect();

      await this.setConnection(result, false);

      this.systemLogs.add('GMAIL', `Gmail connected: ${result.profile.emailAddress}`);
    } catch (error) {
      const message = this.getErrorMessage(error);

      this.errorSignal.set(message);

      this.systemLogs.add('ERROR', `Gmail connection failed: ${message}`);

      throw error;
    } finally {
      this.connectingSignal.set(false);
      this.loadingSignal.set(false);
    }
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

    this.systemLogs.add('SYNC', 'Refreshing Gmail...');

    try {
      const result = await this.gmail.restore();

      await this.setConnection(result, true);

      this.systemLogs.add(
        'SYNC',
        `Gmail synchronized. ${result.messages.length} recent messages loaded.`,
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
    if (this.disconnectingSignal() || this.connectingSignal()) {
      return;
    }

    this.disconnectingSignal.set(true);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.systemLogs.add('GMAIL', 'Disconnecting Gmail account...');

    try {
      await this.gmail.disconnect();

      await this.resetConnection();

      this.systemLogs.add('GMAIL', 'Gmail disconnected.');
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

  private async setConnection(
    result: GmailConnectionResult,
    detectNewMessages: boolean,
  ): Promise<void> {
    if (detectNewMessages) {
      await this.handleNewMessages(result.messages);
    }

    this.profileSignal.set(result.profile);

    this.messagesSignal.set(result.messages);

    this.rememberMessages(result.messages);

    this.errorSignal.set(null);

    await this.syncUnreadCountToRust(result.profile.unreadCount);
  }

  private async handleNewMessages(messages: GmailMessage[]): Promise<void> {
    const newMessages = messages.filter((message) => !this.knownMessageIds.has(message.id));

    if (newMessages.length === 0) {
      return;
    }

    this.systemLogs.add('GMAIL', `${newMessages.length} new Gmail message(s) detected.`);

    const orderedMessages = [...newMessages].reverse();

    for (const message of orderedMessages) {
      if (!this.notificationRules.shouldNotify(message)) {
        this.systemLogs.add(
          'SYNC',
          `Notification skipped by rules: ${message.subject || 'Untitled message'}`,
        );

        continue;
      }

      const priority = this.notificationRules.getPriority(message);

      await this.notifyMessage(message, priority);
    }
  }

  private async notifyMessage(
    message: GmailMessage,
    priority: 'normal' | 'important' | 'critical',
  ): Promise<void> {
    const sender = message.senderName || message.senderAddress || 'New Gmail message';

    const subject = message.subject || message.snippet || 'You received a new email.';

    let title = sender;

    if (priority === 'important') {
      title = `Important • ${sender}`;
    }

    if (priority === 'critical') {
      title = `CRITICAL • ${sender}`;
    }

    const success = await this.desktopNotifications.show(title, subject);

    if (priority === 'critical') {
      await this.criticalAlerts.show(message);

      this.systemLogs.add(
        'WARNING',
        `Critical alert triggered for: ${message.senderAddress || sender}`,
      );
    }

    if (success) {
      this.systemLogs.add(
        priority === 'critical' ? 'WARNING' : 'CORE',
        `${this.formatPriority(priority)} notification sent: ${message.subject || 'New Gmail message'}`,
      );

      return;
    }

    this.systemLogs.add(
      'WARNING',
      `Desktop notification could not be displayed: ${message.subject || 'New Gmail message'}`,
    );
  }

  private formatPriority(priority: 'normal' | 'important' | 'critical'): string {
    switch (priority) {
      case 'important':
        return 'Important';

      case 'critical':
        return 'Critical';

      default:
        return 'Normal';
    }
  }

  private rememberMessages(messages: GmailMessage[]): void {
    for (const message of messages) {
      this.knownMessageIds.add(message.id);
    }

    const maxKnownMessages = 500;

    if (this.knownMessageIds.size > maxKnownMessages) {
      const ids = Array.from(this.knownMessageIds);

      const recentIds = ids.slice(ids.length - maxKnownMessages);

      this.knownMessageIds.clear();

      for (const id of recentIds) {
        this.knownMessageIds.add(id);
      }
    }
  }

  private async resetConnection(): Promise<void> {
    this.profileSignal.set(null);
    this.messagesSignal.set([]);
    this.errorSignal.set(null);

    this.knownMessageIds.clear();

    await this.syncUnreadCountToRust(0);
  }

  private async syncUnreadCountToRust(count: number): Promise<void> {
    try {
      await invoke('set_unread_count', {
        count,
      });

      this.systemLogs.add('SYNC', `Unread count updated: ${count}`);
    } catch {
      this.systemLogs.add('WARNING', 'Unable to update floating widget unread count.');
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
