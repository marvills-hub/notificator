import { Injectable, signal } from '@angular/core';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

@Injectable({
  providedIn: 'root',
})
export class DesktopService {
  autostartEnabled = signal(false);

  async initialize(): Promise<void> {
    await this.loadAutostartStatus();
  }

  async loadAutostartStatus(): Promise<void> {
    try {
      this.autostartEnabled.set(await isEnabled());
    } catch {
      this.autostartEnabled.set(false);
    }
  }

  async setAutostart(enabledValue: boolean): Promise<void> {
    try {
      if (enabledValue) {
        await enable();
      } else {
        await disable();
      }

      this.autostartEnabled.set(await isEnabled());
    } catch (error) {
      console.error('Unable to update autostart:', error);
    }
  }

  async requestNotifications(): Promise<boolean> {
    let granted = await isPermissionGranted();

    if (!granted) {
      const permission = await requestPermission();

      granted = permission === 'granted';
    }

    return granted;
  }

  async notify(title: string, body: string): Promise<void> {
    try {
      const granted = await this.requestNotifications();

      if (!granted) {
        return;
      }

      sendNotification({
        title,
        body,
      });
    } catch (error) {
      console.error('Unable to send notification:', error);
    }
  }

  async simulateIncomingCall(): Promise<void> {
    try {
      const window = await WebviewWindow.getByLabel('critical-call');

      if (!window) {
        return;
      }

      await window.show();

      await window.unminimize();

      await window.setFocus();
    } catch (error) {
      console.error('Unable to show critical alert:', error);
    }
  }
}
