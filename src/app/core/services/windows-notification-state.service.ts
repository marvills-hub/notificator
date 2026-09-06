import { Injectable, computed, inject, signal } from '@angular/core';
import { WindowsNotificationItem } from './windows-notification-listener.service';
import { GmailUnreadSyncService } from './gmail-unread-sync.service';

export interface StoredWindowsNotification extends WindowsNotificationItem {
  receivedAt: string;
  isRead: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class WindowsNotificationStateService {
  private readonly unreadSync = inject(GmailUnreadSyncService);
  private readonly notificationsSignal = signal<StoredWindowsNotification[]>([]);
  private readonly knownIds = new Set<number>();

  readonly notifications = this.notificationsSignal.asReadonly();

  readonly unreadCount = computed(
    () => this.notificationsSignal().filter((notification) => !notification.isRead).length,
  );

  initialize(notifications: WindowsNotificationItem[]): void {
    this.knownIds.clear();

    const storedNotifications = notifications.map((notification) => {
      this.knownIds.add(notification.id);

      return {
        ...notification,
        receivedAt: new Date().toISOString(),
        isRead: false,
      };
    });

    this.notificationsSignal.set(storedNotifications);

    void this.syncUnreadCount();
  }

  add(notification: WindowsNotificationItem): boolean {
    if (this.knownIds.has(notification.id)) {
      return false;
    }

    this.knownIds.add(notification.id);

    const storedNotification: StoredWindowsNotification = {
      ...notification,
      receivedAt: new Date().toISOString(),
      isRead: false,
    };

    this.notificationsSignal.update((notifications) => [storedNotification, ...notifications]);

    void this.syncUnreadCount();

    return true;
  }

  replace(notifications: WindowsNotificationItem[]): void {
    const existingNotifications = new Map(
      this.notificationsSignal().map((notification) => [notification.id, notification]),
    );

    this.knownIds.clear();

    const storedNotifications = notifications.map((notification) => {
      this.knownIds.add(notification.id);

      const existing = existingNotifications.get(notification.id);

      return {
        ...notification,
        receivedAt: existing?.receivedAt ?? new Date().toISOString(),
        isRead: existing?.isRead ?? false,
      };
    });

    this.notificationsSignal.set(storedNotifications);

    void this.syncUnreadCount();
  }

  markRead(id: number): void {
    this.notificationsSignal.update((notifications) =>
      notifications.map((notification) =>
        notification.id === id
          ? {
              ...notification,
              isRead: true,
            }
          : notification,
      ),
    );

    void this.syncUnreadCount();
  }

  markUnread(id: number): void {
    this.notificationsSignal.update((notifications) =>
      notifications.map((notification) =>
        notification.id === id
          ? {
              ...notification,
              isRead: false,
            }
          : notification,
      ),
    );

    void this.syncUnreadCount();
  }

  remove(id: number): void {
    this.knownIds.delete(id);

    this.notificationsSignal.update((notifications) =>
      notifications.filter((notification) => notification.id !== id),
    );

    void this.syncUnreadCount();
  }

  clear(): void {
    this.knownIds.clear();
    this.notificationsSignal.set([]);

    void this.syncUnreadCount();
  }

  has(id: number): boolean {
    return this.knownIds.has(id);
  }

  private async syncUnreadCount(): Promise<void> {
    await this.unreadSync.syncWindows(this.unreadCount());
  }
}
