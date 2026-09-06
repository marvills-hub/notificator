import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Event, listen, UnlistenFn } from '@tauri-apps/api/event';
import { RuntimePlatformService } from './runtime-platform.service';

interface OpenGmailMessageEvent {
  messageId: string;
}

@Injectable({
  providedIn: 'root',
})
export class InboxNavigationService {
  private readonly router = inject(Router);
  private readonly platform = inject(RuntimePlatformService);
  private readonly selectedMessageIdSignal = signal<string | null>(null);

  private unlistenOpenMessage?: UnlistenFn;
  private initialized = false;

  readonly selectedMessageId = this.selectedMessageIdSignal.asReadonly();

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (!this.platform.isTauri) {
      return;
    }

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
