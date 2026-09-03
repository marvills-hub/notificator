import { Component } from '@angular/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

@Component({
  selector: 'app-critical-call',
  standalone: true,
  templateUrl: './critical-call.component.html',
  styleUrl: './critical-call.component.scss',
})
export class CriticalCallComponent {
  caller = 'Client ABC';

  provider = 'WhatsApp';

  async dismiss(): Promise<void> {
    try {
      await getCurrentWindow().hide();
    } catch (error) {
      console.error(error);
    }
  }

  async answer(): Promise<void> {
    console.log('Answer call:', this.provider, this.caller);

    await this.dismiss();
  }
}
