import { computed, inject, Injectable } from '@angular/core';
import { GmailStateService } from './gmail-state.service';
import { WindowsNotificationStateService } from './windows-notification-state.service';

export type UnifiedInboxItem =
  | {
      type: 'gmail';
      id: string;
      sourceId: string;
      provider: 'gmail';
      sourceName: string;
      senderName: string;
      senderAddress: string;
      title: string;
      preview: string;
      receivedAt: string;
      isRead: boolean;
      isImportant: boolean;
      isStarred: boolean;
    }
  | {
      type: 'windows';
      id: string;
      sourceId: number;
      provider: 'windows';
      sourceName: string;
      senderName: string;
      senderAddress: string;
      title: string;
      preview: string;
      receivedAt: string;
      isRead: boolean;
      isImportant: boolean;
      isStarred: boolean;
    };

@Injectable({
  providedIn: 'root',
})
export class UnifiedInboxService {
  private readonly gmailState = inject(GmailStateService);
  private readonly windowsState = inject(WindowsNotificationStateService);

  readonly items = computed<UnifiedInboxItem[]>(() => {
    const gmailItems: UnifiedInboxItem[] = this.gmailState.messages().map((message) => ({
      type: 'gmail',
      id: `gmail:${message.accountId}:${message.id}`,
      sourceId: message.id,
      provider: 'gmail',
      sourceName: message.accountEmail,
      senderName: message.senderName,
      senderAddress: message.senderAddress,
      title: message.subject,
      preview: message.snippet,
      receivedAt: message.receivedAt,
      isRead: message.isRead,
      isImportant: message.isImportant,
      isStarred: message.isStarred,
    }));

    const windowsItems: UnifiedInboxItem[] = this.windowsState
      .notifications()
      .map((notification) => ({
        type: 'windows',
        id: `windows:${notification.id}`,
        sourceId: notification.id,
        provider: 'windows',
        sourceName: notification.appName,
        senderName: notification.appName,
        senderAddress: '',
        title: notification.title,
        preview: notification.body,
        receivedAt: notification.receivedAt,
        isRead: notification.isRead,
        isImportant: false,
        isStarred: false,
      }));

    return [...gmailItems, ...windowsItems].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );
  });

  readonly unreadCount = computed(() => this.items().filter((item) => !item.isRead).length);
}
