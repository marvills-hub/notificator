import {
  AfterViewInit,
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  computed,
  inject,
  signal,
} from '@angular/core';
import { openUrl } from '@tauri-apps/plugin-opener';

import { GmailStateService } from '../../core/services/gmail-state.service';
import { InboxNavigationService } from '../../core/services/inbox-navigation.service';
import { UnifiedInboxItem, UnifiedInboxService } from '../../core/services/unified-inbox.service';
import { WindowsNotificationStateService } from '../../core/services/windows-notification-state.service';
import { WindowsNotificationListenerService } from '../../core/services/windows-notification-listener.service';

type InboxFilter = 'all' | 'unread' | 'important' | 'starred';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.component.scss',
})
export class InboxComponent implements AfterViewInit {
  private readonly gmailState = inject(GmailStateService);
  private readonly inboxNavigation = inject(InboxNavigationService);
  private readonly unifiedInbox = inject(UnifiedInboxService);
  private readonly windowsNotificationState = inject(WindowsNotificationStateService);
  private readonly windowsNotificationListener = inject(WindowsNotificationListenerService);

  @ViewChildren('messageRow')
  private messageRows?: QueryList<ElementRef<HTMLElement>>;

  readonly searchTerm = signal('');
  readonly activeFilter = signal<InboxFilter>('all');

  readonly loading = this.gmailState.loading;
  readonly restoring = this.gmailState.restoring;
  readonly connected = this.gmailState.connected;

  readonly messages = this.unifiedInbox.items;

  readonly selectedMessageId = this.inboxNavigation.selectedMessageId;

  readonly selectedMessage = computed(() => {
    const selectedId = this.selectedMessageId();

    if (!selectedId) {
      return null;
    }

    return this.messages().find((message) => message.id === selectedId) ?? null;
  });

  readonly filteredMessages = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const filter = this.activeFilter();

    return this.messages().filter((message) => {
      const matchesSearch =
        !search ||
        message.senderName.toLowerCase().includes(search) ||
        message.senderAddress.toLowerCase().includes(search) ||
        message.title.toLowerCase().includes(search) ||
        message.preview.toLowerCase().includes(search) ||
        message.sourceName.toLowerCase().includes(search);

      if (!matchesSearch) {
        return false;
      }

      if (filter === 'unread') {
        return !message.isRead;
      }

      if (filter === 'important') {
        return message.isImportant;
      }

      if (filter === 'starred') {
        return message.isStarred;
      }

      return true;
    });
  });

  readonly totalCount = computed(() => this.messages().length);

  readonly unreadCount = computed(
    () => this.messages().filter((message) => !message.isRead).length,
  );

  readonly importantCount = computed(
    () => this.messages().filter((message) => message.isImportant).length,
  );

  readonly starredCount = computed(
    () => this.messages().filter((message) => message.isStarred).length,
  );

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.scrollToSelectedMessage();
    });

    this.messageRows?.changes.subscribe(() => {
      queueMicrotask(() => {
        this.scrollToSelectedMessage();
      });
    });
  }

  setFilter(filter: InboxFilter): void {
    this.activeFilter.set(filter);
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  selectMessage(messageId: string): void {
    this.inboxNavigation.selectMessage(messageId);
  }

  closeMessageDetails(): void {
    this.inboxNavigation.clearSelection();
  }

  async refresh(): Promise<void> {
    await this.gmailState.refresh();
  }

  formatReceivedAt(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const difference = today.getTime() - messageDate.getTime();
    const daysDifference = Math.round(difference / (1000 * 60 * 60 * 24));

    if (daysDifference === 0) {
      return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
    }

    if (daysDifference === 1) {
      return 'Yesterday';
    }

    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      });
    }

    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  getProviderLabel(message: UnifiedInboxItem): string {
    if (message.provider === 'gmail') {
      return 'Gmail';
    }

    return message.sourceName || 'Windows';
  }

  getSenderLabel(message: UnifiedInboxItem): string {
    return message.senderName || message.senderAddress || message.sourceName;
  }

  async openMessage(message: UnifiedInboxItem): Promise<void> {
    if (message.provider !== 'gmail') {
      return;
    }

    try {
      const url = `https://mail.google.com/mail/u/0/#inbox/${message.sourceId}`;

      await openUrl(url);
    } catch (error) {
      console.error('[INBOX] Unable to open Gmail message.', error);
    }
  }

  private scrollToSelectedMessage(): void {
    const selectedId = this.selectedMessageId();

    if (!selectedId || !this.messageRows) {
      return;
    }

    const row = this.messageRows.find(
      (element) => element.nativeElement.dataset['messageId'] === selectedId,
    );

    row?.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  markRead(message: UnifiedInboxItem): void {
    if (message.provider !== 'windows') {
      return;
    }

    this.windowsNotificationState.markRead(message.sourceId);
  }

  async dismissMessage(message: UnifiedInboxItem): Promise<void> {
    if (message.provider !== 'windows') {
      return;
    }

    try {
      await this.windowsNotificationListener.removeNotification(message.sourceId);

      this.windowsNotificationState.remove(message.sourceId);

      this.closeMessageDetails();
    } catch (error) {
      console.error('[INBOX] Unable to dismiss Windows notification.', error);
    }
  }
}
