import { Component, OnDestroy, OnInit, signal } from '@angular/core';

import { Event, UnlistenFn, emitTo, listen } from '@tauri-apps/api/event';

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { CriticalAlertPayload } from '../../core/services/critical-alert.service';

@Component({
  selector: 'app-critical-call',
  standalone: true,
  templateUrl: './critical-call.component.html',
  styleUrl: './critical-call.component.scss',
})
export class CriticalCallComponent implements OnInit, OnDestroy {
  readonly caller = signal('Client ABC');
  readonly provider = signal('WhatsApp');

  readonly subject = signal('');
  readonly preview = signal('');
  readonly senderAddress = signal('');
  readonly receivedAt = signal('');
  readonly messageId = signal('');

  readonly mode = signal<'call' | 'gmail'>('call');

  private unlistenCriticalAlert?: UnlistenFn;

  async ngOnInit(): Promise<void> {
    try {
      this.unlistenCriticalAlert = await listen<CriticalAlertPayload>(
        'critical-alert',
        (event: Event<CriticalAlertPayload>) => {
          this.handleCriticalAlert(event.payload);
        },
      );
    } catch (error) {
      console.error('[CRITICAL] Unable to listen for critical alerts.', error);
    }
  }

  ngOnDestroy(): void {
    this.unlistenCriticalAlert?.();
  }

  private handleCriticalAlert(payload: CriticalAlertPayload): void {
    this.mode.set('gmail');
    this.provider.set('Gmail');

    this.caller.set(payload.senderName || payload.senderAddress || 'Unknown Sender');

    this.senderAddress.set(payload.senderAddress);

    this.subject.set(payload.subject);

    this.preview.set(payload.preview);

    this.receivedAt.set(payload.receivedAt);

    this.messageId.set(payload.messageId);
  }

  async dismiss(): Promise<void> {
    try {
      await getCurrentWindow().hide();
    } catch (error) {
      console.error('[CRITICAL] Unable to hide critical alert.', error);
    }
  }

  async answer(): Promise<void> {
    if (this.mode() === 'gmail') {
      await this.openGmailMessage();
      return;
    }

    console.log('Answer call:', this.provider(), this.caller());

    await this.dismiss();
  }

  private async openGmailMessage(): Promise<void> {
    try {
      const messageId = this.messageId();

      if (!messageId) {
        console.error('[CRITICAL] Gmail message ID is unavailable.');

        return;
      }

      const mainWindow = await WebviewWindow.getByLabel('main');

      if (!mainWindow) {
        console.error('[CRITICAL] Main Notificator window was not found.');

        return;
      }

      await emitTo('main', 'open-gmail-message', {
        messageId,
      });

      await mainWindow.show();
      await mainWindow.unminimize();
      await mainWindow.setFocus();

      await this.dismiss();
    } catch (error) {
      console.error('[CRITICAL] Unable to open Gmail message.', error);
    }
  }
}
