import { Component, OnInit } from '@angular/core';

import { DesktopService } from '../../core/services/desktop.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  constructor(public desktop: DesktopService) {}

  async ngOnInit(): Promise<void> {
    await this.desktop.initialize();
  }

  async toggleAutostart(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;

    await this.desktop.setAutostart(input.checked);
  }

  async testNotification(): Promise<void> {
    await this.desktop.notify('NOTIFICATOR', 'Desktop communication monitoring is online.');
  }

  async simulateCall(): Promise<void> {
    await this.desktop.simulateIncomingCall();
  }
}
