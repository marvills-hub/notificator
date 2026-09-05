import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

import { GmailStateService } from '../../core/services/gmail-state.service';
import { SystemLogService } from '../../core/services/system-log.service';
import { InboxNavigationService } from '../../core/services/inbox-navigation.service';
import { DesktopNotificationService } from '../../core/services/desktop-notification.service';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit, OnDestroy {
  private readonly gmailState = inject(GmailStateService);

  private readonly systemLogs = inject(SystemLogService);

  private readonly inboxNavigation = inject(InboxNavigationService);

  private readonly desktopNotifications = inject(DesktopNotificationService);

  private unlistenClose?: () => void;

  async ngOnInit(): Promise<void> {
    await this.systemLogs.initialize();

    await this.inboxNavigation.initialize();

    await this.desktopNotifications.initialize();

    this.systemLogs.add('CORE', 'Notificator main runtime initialized.');

    await this.gmailState.initialize();

    this.gmailState.startAutoRefresh();

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

    this.inboxNavigation.destroy();

    this.unlistenClose?.();

    this.systemLogs.destroy();
  }
}
