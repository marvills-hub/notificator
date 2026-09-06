import { inject, Injectable } from '@angular/core';
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { RuntimePlatformService } from './runtime-platform.service';

@Injectable({
  providedIn: 'root',
})
export class DesktopNotificationService {
  private readonly platform = inject(RuntimePlatformService);

  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;

    if (!this.platform.isTauri) {
      return;
    }

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
    if (!this.platform.isTauri) {
      if (!('Notification' in window)) {
        return false;
      }

      if (Notification.permission === 'granted') {
        return true;
      }

      if (Notification.permission === 'denied') {
        return false;
      }

      const permission = await Notification.requestPermission();

      return permission === 'granted';
    }

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

    if (!this.platform.isTauri) {
      try {
        const notification = new Notification(title, {
          body,
        });

        if (messageId) {
          notification.onclick = () => {
            console.log('[NOTIFICATION] Gmail browser notification clicked:', messageId);

            window.focus();
          };
        }

        return true;
      } catch (error) {
        console.error('[NOTIFICATION] Unable to show browser notification.', error);

        return false;
      }
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
      console.error('[NOTIFICATION] Unable to show desktop notification.', error);

      return false;
    }
  }

  async showTestNotification(): Promise<boolean> {
    return this.show('Notificator', 'Desktop notifications are working.');
  }
}
