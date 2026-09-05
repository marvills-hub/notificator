import { Injectable, inject, signal } from '@angular/core';

import { Event, UnlistenFn, listen } from '@tauri-apps/api/event';

import { Router } from '@angular/router';

interface OpenGmailMessageEvent {
  messageId: string;
}

@Injectable({
  providedIn: 'root',
})
export class InboxNavigationService {
  private readonly router = inject(Router);

  private readonly selectedMessageIdSignal = signal<string | null>(null);

  private unlistenOpenMessage?: UnlistenFn;
  private initialized = false;

  readonly selectedMessageId = this.selectedMessageIdSignal.asReadonly();

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    try {
      this.unlistenOpenMessage = await listen<OpenGmailMessageEvent>(
        'open-gmail-message',
        async (event: Event<OpenGmailMessageEvent>) => {
          const messageId = event.payload.messageId;

          if (!messageId) {
            return;
          }

          this.selectedMessageIdSignal.set(messageId);

          await this.router.navigate(['/inbox']);
        },
      );
    } catch (error) {
      console.error('[INBOX] Unable to initialize message navigation.', error);
    }
  }

  selectMessage(messageId: string): void {
    this.selectedMessageIdSignal.set(messageId);
  }

  clearSelection(): void {
    this.selectedMessageIdSignal.set(null);
  }

  destroy(): void {
    this.unlistenOpenMessage?.();

    this.unlistenOpenMessage = undefined;
    this.initialized = false;
  }
}
