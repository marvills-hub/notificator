import { Component, OnInit, inject, signal } from '@angular/core';

import { DesktopService } from '../../core/services/desktop.service';
import { NotificationRulesService } from '../../core/services/notification-rules.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  readonly desktop = inject(DesktopService);

  private readonly notificationRules = inject(NotificationRulesService);

  readonly notificationsEnabled = this.notificationRules.notificationsEnabled;

  readonly importantOnly = this.notificationRules.importantOnly;

  readonly criticalSenders = this.notificationRules.criticalSenders;

  readonly newCriticalSender = signal('');

  async ngOnInit(): Promise<void> {
    await this.desktop.initialize();
  }

  async toggleAutostart(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;

    await this.desktop.setAutostart(input.checked);
  }

  toggleNotifications(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.notificationRules.setNotificationsEnabled(input.checked);
  }

  toggleImportantOnly(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.notificationRules.setImportantOnly(input.checked);
  }

  setCriticalSenderInput(value: string): void {
    this.newCriticalSender.set(value);
  }

  addCriticalSender(): void {
    const emailAddress = this.newCriticalSender().trim().toLowerCase();

    if (!emailAddress) {
      return;
    }

    this.notificationRules.addCriticalSender(emailAddress);

    this.newCriticalSender.set('');
  }

  removeCriticalSender(emailAddress: string): void {
    this.notificationRules.removeCriticalSender(emailAddress);
  }

  async testNotification(): Promise<void> {
    await this.desktop.notify('NOTIFICATOR', 'Desktop communication monitoring is online.');
  }

  async simulateCall(): Promise<void> {
    await this.desktop.simulateIncomingCall();
  }
}
