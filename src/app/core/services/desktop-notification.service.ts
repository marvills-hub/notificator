import { Injectable } from '@angular/core';
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

@Injectable({
  providedIn: 'root',
})
export class DesktopNotificationService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;

    try {
      await onAction((notification) => {
        const messageId = notification.extra?.['messageId'];

        if (typeof messageId !== 'string' || !messageId) {
          return;
        }

        console.log('[NOTIFICATION] Gmail notification clicked:', messageId);
      });
    } catch (error) {
      console.error('[NOTIFICATION] Unable to initialize notification listener.', error);
    }
  }

  async ensurePermission(): Promise<boolean> {
    try {
      let granted = await isPermissionGranted();

      if (!granted) {
        const permission = await requestPermission();
        granted = permission === 'granted';
      }

      return granted;
    } catch (error) {
      console.error('[NOTIFICATION] Unable to check notification permission.', error);

      return false;
    }
  }

  async show(title: string, body: string, messageId?: string): Promise<boolean> {
    const granted = await this.ensurePermission();

    if (!granted) {
      console.warn('[NOTIFICATION] Notification permission was not granted.');

      return false;
    }

    try {
      sendNotification({
        title,
        body,
        autoCancel: true,
        extra: messageId
          ? {
              messageId,
              provider: 'gmail',
            }
          : {},
      });

      return true;
    } catch (error) {
      console.error('[NOTIFICATION] Unable to show notification.', error);

      return false;
    }
  }

  async showTestNotification(): Promise<boolean> {
    return this.show('Notificator', 'Desktop notifications are working.');
  }
}
