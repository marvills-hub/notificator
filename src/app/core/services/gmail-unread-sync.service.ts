import { Injectable, inject } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { SystemLogService } from './system-log.service';

@Injectable({
  providedIn: 'root',
})
export class GmailUnreadSyncService {
  private readonly systemLogs = inject(SystemLogService);

  private gmailUnreadCount = 0;
  private windowsUnreadCount = 0;

  async sync(count: number): Promise<void> {
    this.gmailUnreadCount = count;
    await this.syncTotal();
  }

  async syncWindows(count: number): Promise<void> {
    this.windowsUnreadCount = count;
    await this.syncTotal();
  }

  private async syncTotal(): Promise<void> {
    const total = this.gmailUnreadCount + this.windowsUnreadCount;

    try {
      await invoke('set_unread_count', {
        count: total,
      });

      this.systemLogs.add(
        'SYNC',
        `Widget unread count updated: ${total} (${this.gmailUnreadCount} Gmail + ${this.windowsUnreadCount} Windows)`,
      );
    } catch {
      this.systemLogs.add('WARNING', 'Unable to update floating widget unread count.');
    }
  }
}
