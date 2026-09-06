import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { SystemLogService, SystemLogType } from '../../core/services/system-log.service';
import { DesktopNotificationService } from '../../core/services/desktop-notification.service';
@Component({
  selector: 'app-system-console',
  standalone: true,
  templateUrl: './system-console.component.html',
  styleUrl: './system-console.component.scss',
})
export class SystemConsoleComponent implements AfterViewInit {
  private readonly systemLogs = inject(SystemLogService);
  private readonly desktopNotifications = inject(DesktopNotificationService);
  @ViewChild('logList') private logList?: ElementRef<HTMLDivElement>;
  readonly collapsed = signal(false);
  readonly logs = this.systemLogs.logs;
  readonly logCount = computed(() => this.logs().length);
  private viewReady = false;
  constructor() {
    effect(() => {
      this.logs();
      if (!this.viewReady || this.collapsed()) {
        return;
      }
      queueMicrotask(() => {
        this.scrollToLatest();
      });
    });
  }
  ngAfterViewInit(): void {
    this.viewReady = true;
    queueMicrotask(() => {
      this.scrollToLatest();
    });
  }
  toggleCollapsed(): void {
    this.collapsed.update((value) => !value);
    if (!this.collapsed()) {
      queueMicrotask(() => {
        this.scrollToLatest();
      });
    }
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
  private scrollToLatest(): void {
    const element = this.logList?.nativeElement;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }
}
