import { Injectable, inject } from '@angular/core';
import { GmailMessage } from '../models/gmail-profile.model';
import { DesktopNotificationService } from './desktop-notification.service';
import { SystemLogService } from './system-log.service';
import { NotificationRulesService } from './notification-rules.service';
import { CriticalAlertService } from './critical-alert.service';

type GmailNotificationPriority = 'normal' | 'important' | 'critical';

@Injectable({
  providedIn: 'root',
})
export class GmailNotificationService {
  private readonly desktopNotifications = inject(DesktopNotificationService);
  private readonly systemLogs = inject(SystemLogService);
  private readonly notificationRules = inject(NotificationRulesService);
  private readonly criticalAlerts = inject(CriticalAlertService);

  async handleNewMessages(messages: GmailMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }

    this.systemLogs.add('GMAIL', `${messages.length} new Gmail message(s) detected.`);

    const orderedMessages = [...messages].reverse();

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
    priority: GmailNotificationPriority,
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

  private formatPriority(priority: GmailNotificationPriority): string {
    switch (priority) {
      case 'important':
        return 'Important';
      case 'critical':
        return 'Critical';
      default:
        return 'Normal';
    }
  }
}
