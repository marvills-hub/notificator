import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { FooterComponent } from '../footer/footer.component';

import { GmailStateService } from '../../core/services/gmail-state.service';
import { SystemLogService } from '../../core/services/system-log.service';
import { InboxNavigationService } from '../../core/services/inbox-navigation.service';
import { DesktopNotificationService } from '../../core/services/desktop-notification.service';
import { WindowsNotificationListenerService } from '../../core/services/windows-notification-listener.service';
import { WindowsNotificationStateService } from '../../core/services/windows-notification-state.service';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, FooterComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit, OnDestroy {
  private readonly gmailState = inject(GmailStateService);
  private readonly systemLogs = inject(SystemLogService);
  private readonly inboxNavigation = inject(InboxNavigationService);
  private readonly desktopNotifications = inject(DesktopNotificationService);
  private readonly windowsNotifications = inject(WindowsNotificationListenerService);
  private readonly windowsNotificationState = inject(WindowsNotificationStateService);

  private unlistenClose?: () => void;
  private windowsNotificationTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    await this.systemLogs.initialize();
    await this.inboxNavigation.initialize();
    await this.desktopNotifications.initialize();

    this.systemLogs.add('CORE', 'Notificator main runtime initialized.');

    await this.gmailState.initialize();
    this.gmailState.startAutoRefresh();

    await this.initializeWindowsNotificationWatcher();

    try {
      const currentWindow = getCurrentWindow();

      this.unlistenClose = await currentWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        await currentWindow.hide();
      });
    } catch {
      this.systemLogs.add('WARNING', 'Window runtime controls are unavailable.');
    }
  }

  ngOnDestroy(): void {
    this.gmailState.stopAutoRefresh();
    this.stopWindowsNotificationWatcher();
    this.inboxNavigation.destroy();
    this.unlistenClose?.();
    this.systemLogs.destroy();
  }

  private async initializeWindowsNotificationWatcher(): Promise<void> {
    try {
      const access = await this.windowsNotifications.requestAccess();

      console.log('[WINDOWS] Notification access:', access);

      if (!access.allowed) {
        this.systemLogs.add('WARNING', 'Windows notification access was not granted.');
        return;
      }

      const notifications = await this.windowsNotifications.getNotifications();

      this.windowsNotificationState.initialize(notifications);

      console.log('[WINDOWS] Current notifications:', notifications);

      for (const notification of notifications) {
        console.log(
          '[WINDOWS]',
          notification.appName,
          '| ID:',
          notification.id,
          '| Title:',
          notification.title,
          '| Body:',
          notification.body,
          '| Text:',
          notification.textLines,
        );
      }

      this.windowsNotificationTimer = setInterval(() => {
        void this.checkForNewWindowsNotifications();
      }, 2000);

      this.systemLogs.add('CORE', 'Windows notification watcher started.');
    } catch (error) {
      console.error('[WINDOWS] Notification watcher failed:', error);
      this.systemLogs.add('ERROR', 'Windows notification watcher failed to start.');
    }
  }

  private async checkForNewWindowsNotifications(): Promise<void> {
    try {
      const notifications = await this.windowsNotifications.getNotifications();

      for (const notification of notifications) {
        const added = this.windowsNotificationState.add(notification);

        if (!added) {
          continue;
        }

        console.log(
          '[WINDOWS NEW]',
          notification.appName,
          '| ID:',
          notification.id,
          '| Title:',
          notification.title,
          '| Body:',
          notification.body,
          '| Text:',
          notification.textLines,
        );

        this.systemLogs.add(
          'CORE',
          `New Windows notification detected from ${notification.appName}.`,
        );
      }
    } catch (error) {
      console.error('[WINDOWS] Unable to refresh notifications:', error);
    }
  }

  private stopWindowsNotificationWatcher(): void {
    if (this.windowsNotificationTimer) {
      clearInterval(this.windowsNotificationTimer);
      this.windowsNotificationTimer = null;
    }

    this.windowsNotificationState.clear();
  }
}
