import { Injectable, signal } from '@angular/core';

import { GmailMessage } from '../models/gmail-profile.model';

export type NotificationPriority = 'normal' | 'important' | 'critical';

interface NotificationSettings {
  notificationsEnabled: boolean;
  importantOnly: boolean;
  criticalSenders: string[];
}

@Injectable({
  providedIn: 'root',
})
export class NotificationRulesService {
  private readonly storageKey = 'notificator.notification-settings';

  private readonly notificationsEnabledSignal = signal(true);

  private readonly importantOnlySignal = signal(false);

  private readonly criticalSendersSignal = signal<string[]>([]);

  readonly notificationsEnabled = this.notificationsEnabledSignal.asReadonly();

  readonly importantOnly = this.importantOnlySignal.asReadonly();

  readonly criticalSenders = this.criticalSendersSignal.asReadonly();

  constructor() {
    this.loadSettings();
  }

  setNotificationsEnabled(enabled: boolean): void {
    this.notificationsEnabledSignal.set(enabled);

    this.saveSettings();
  }

  setImportantOnly(enabled: boolean): void {
    this.importantOnlySignal.set(enabled);

    this.saveSettings();
  }

  addCriticalSender(emailAddress: string): void {
    const normalized = this.normalizeEmail(emailAddress);

    if (!normalized) {
      return;
    }

    this.criticalSendersSignal.update((senders) => {
      if (senders.includes(normalized)) {
        return senders;
      }

      return [...senders, normalized];
    });

    this.saveSettings();
  }

  removeCriticalSender(emailAddress: string): void {
    const normalized = this.normalizeEmail(emailAddress);

    this.criticalSendersSignal.update((senders) =>
      senders.filter((sender) => sender !== normalized),
    );

    this.saveSettings();
  }

  shouldNotify(message: GmailMessage): boolean {
    if (!this.notificationsEnabledSignal()) {
      return false;
    }

    if (this.importantOnlySignal() && !message.isImportant) {
      return false;
    }

    return true;
  }

  getPriority(message: GmailMessage): NotificationPriority {
    const sender = this.normalizeEmail(message.senderAddress);

    if (sender && this.criticalSendersSignal().includes(sender)) {
      return 'critical';
    }

    if (message.isImportant) {
      return 'important';
    }

    return 'normal';
  }

  private saveSettings(): void {
    try {
      const settings: NotificationSettings = {
        notificationsEnabled: this.notificationsEnabledSignal(),

        importantOnly: this.importantOnlySignal(),

        criticalSenders: this.criticalSendersSignal(),
      };

      localStorage.setItem(this.storageKey, JSON.stringify(settings));
    } catch (error) {
      console.error('[NOTIFICATION RULES] Unable to save notification settings.', error);
    }
  }

  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);

      if (!stored) {
        return;
      }

      const settings = JSON.parse(stored) as Partial<NotificationSettings>;

      if (typeof settings.notificationsEnabled === 'boolean') {
        this.notificationsEnabledSignal.set(settings.notificationsEnabled);
      }

      if (typeof settings.importantOnly === 'boolean') {
        this.importantOnlySignal.set(settings.importantOnly);
      }

      if (Array.isArray(settings.criticalSenders)) {
        const senders = settings.criticalSenders
          .filter((sender): sender is string => typeof sender === 'string')
          .map((sender) => this.normalizeEmail(sender))
          .filter(Boolean);

        this.criticalSendersSignal.set([...new Set(senders)]);
      }
    } catch (error) {
      console.error('[NOTIFICATION RULES] Unable to restore notification settings.', error);
    }
  }

  private normalizeEmail(emailAddress: string): string {
    return emailAddress.trim().toLowerCase();
  }
}
