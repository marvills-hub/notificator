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

import { GmailStateService } from '../../core/services/gmail-state.service';
import { InboxNavigationService } from '../../core/services/inbox-navigation.service';
import { openUrl } from '@tauri-apps/plugin-opener';

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

  @ViewChildren('messageRow')
  private messageRows?: QueryList<ElementRef<HTMLElement>>;

  readonly searchTerm = signal('');
  readonly activeFilter = signal<InboxFilter>('all');

  readonly loading = this.gmailState.loading;

  readonly restoring = this.gmailState.restoring;

  readonly connected = this.gmailState.connected;

  readonly messages = this.gmailState.messages;

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
        message.subject.toLowerCase().includes(search) ||
        message.snippet.toLowerCase().includes(search);

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

  readonly unreadCount = this.gmailState.unreadCount;

  readonly importantCount = this.gmailState.importantCount;

  readonly starredCount = this.gmailState.starredCount;

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

  async openInGmail(messageId: string): Promise<void> {
    if (!messageId) return;

    try {
      const url = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

      await openUrl(url);
    } catch (error) {
      console.error('[INBOX] Unable to open Gmail message.', error);
    }
  }
}
