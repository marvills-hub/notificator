import { Injectable, inject } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { SystemLogService } from './system-log.service';

@Injectable({
  providedIn: 'root',
})
export class GmailUnreadSyncService {
  private readonly systemLogs = inject(SystemLogService);

  async sync(count: number): Promise<void> {
    try {
      await invoke('set_unread_count', {
        count,
      });

      this.systemLogs.add('SYNC', `Unread count updated: ${count}`);
    } catch {
      this.systemLogs.add('WARNING', 'Unable to update floating widget unread count.');
    }
  }
}
