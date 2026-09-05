import { Injectable, signal } from '@angular/core';
import { Event, UnlistenFn, listen } from '@tauri-apps/api/event';

export type SystemLogType = 'CORE' | 'AUTH' | 'GMAIL' | 'SYNC' | 'WARNING' | 'ERROR';

interface SystemLogEvent {
  logType: SystemLogType;
  message: string;
}

export interface SystemLog {
  id: number;
  type: SystemLogType;
  message: string;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class SystemLogService {
  private readonly logsSignal = signal<SystemLog[]>([]);

  private unlistenSystemLog?: UnlistenFn;
  private nextLogId = 1;
  private initialized = false;

  readonly logs = this.logsSignal.asReadonly();

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    try {
      this.unlistenSystemLog = await listen<SystemLogEvent>(
        'system-log',
        (event: Event<SystemLogEvent>) => {
          this.add(event.payload.logType, event.payload.message);
        },
      );

      this.add('CORE', 'System activity channel connected.');
    } catch (error) {
      console.error('[SYSTEM LOG] Unable to listen for runtime logs.', error);

      this.add('ERROR', 'Unable to connect to runtime event channel.');
    }
  }

  add(type: SystemLogType, message: string): void {
    const log: SystemLog = {
      id: this.nextLogId++,
      type,
      message,
      timestamp: this.getCurrentTime(),
    };

    this.logsSignal.update((logs) => {
      const updatedLogs = [...logs, log];

      const maxLogs = 100;

      if (updatedLogs.length > maxLogs) {
        return updatedLogs.slice(updatedLogs.length - maxLogs);
      }

      return updatedLogs;
    });
  }

  clear(): void {
    this.logsSignal.set([]);
  }

  destroy(): void {
    this.unlistenSystemLog?.();
    this.unlistenSystemLog = undefined;
    this.initialized = false;
  }

  private getCurrentTime(): string {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
}
