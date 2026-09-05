import { Component, computed, inject, signal } from '@angular/core';

import { SystemLogService, SystemLogType } from '../../core/services/system-log.service';

import { DesktopNotificationService } from '../../core/services/desktop-notification.service';

@Component({
  selector: 'app-system-console',
  standalone: true,
  templateUrl: './system-console.component.html',
  styleUrl: './system-console.component.scss',
})
export class SystemConsoleComponent {
  private readonly systemLogs = inject(SystemLogService);

  private readonly desktopNotifications = inject(DesktopNotificationService);

  readonly collapsed = signal(false);

  readonly logs = this.systemLogs.logs;

  readonly logCount = computed(() => this.logs().length);

  toggleCollapsed(): void {
    this.collapsed.update((value) => !value);
  }

  clearLogs(): void {
    this.systemLogs.clear();
  }

  async testNotification(): Promise<void> {
    const success = await this.desktopNotifications.showTestNotification();

    if (success) {
      this.systemLogs.add('CORE', 'Desktop notification test sent.');

      return;
    }

    this.systemLogs.add('WARNING', 'Desktop notification test failed or permission was denied.');
  }

  getLogClass(type: SystemLogType): string {
    return type.toLowerCase();
  }
}
