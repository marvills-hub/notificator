import { inject, Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { RuntimePlatformService } from './runtime-platform.service';

export interface WindowsNotificationAccessResult {
  allowed: boolean;
  status: string;
}

export interface WindowsNotificationItem {
  id: number;
  appName: string;
  title: string;
  body: string;
  textLines: string[];
}

@Injectable({
  providedIn: 'root',
})
export class WindowsNotificationListenerService {
  private readonly platform = inject(RuntimePlatformService);

  async requestAccess(): Promise<WindowsNotificationAccessResult> {
    if (!this.platform.isTauri) {
      return {
        allowed: false,
        status: 'browser',
      };
    }

    return invoke<WindowsNotificationAccessResult>('request_windows_notification_access');
  }

  async getNotifications(): Promise<WindowsNotificationItem[]> {
    if (!this.platform.isTauri) {
      return [];
    }

    return invoke<WindowsNotificationItem[]>('get_windows_notifications');
  }
}
