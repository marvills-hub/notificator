import { Injectable } from '@angular/core';
import { emitTo } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

import { GmailMessage } from '../models/gmail-profile.model';

export interface CriticalAlertPayload {
  senderName: string;
  senderAddress: string;
  subject: string;
  preview: string;
  messageId: string;
  receivedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class CriticalAlertService {
  async show(message: GmailMessage): Promise<void> {
    try {
      const criticalWindow = await WebviewWindow.getByLabel('critical-call');

      if (!criticalWindow) {
        console.error('[CRITICAL] Critical call window was not found.');

        return;
      }

      const payload: CriticalAlertPayload = {
        senderName: message.senderName || message.senderAddress || 'Unknown Sender',

        senderAddress: message.senderAddress || '',

        subject: message.subject || 'Critical Gmail message',

        preview: message.snippet || '',

        messageId: message.id,

        receivedAt: message.receivedAt,
      };

      await emitTo('critical-call', 'critical-alert', payload);

      await criticalWindow.show();
      await criticalWindow.unminimize();
      await criticalWindow.setFocus();
    } catch (error) {
      console.error('[CRITICAL] Unable to show critical call window.', error);
    }
  }

  async hide(): Promise<void> {
    try {
      const criticalWindow = await WebviewWindow.getByLabel('critical-call');

      if (!criticalWindow) {
        return;
      }

      await criticalWindow.hide();
    } catch (error) {
      console.error('[CRITICAL] Unable to hide critical call window.', error);
    }
  }
}
