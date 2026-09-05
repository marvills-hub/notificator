import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { GmailStateService } from '../../core/services/gmail-state.service';

interface AccountSummary {
  name: string;
  provider: string;
  unread: number;
  important: number;
  status: 'online' | 'warning';
}

interface RecentMessage {
  sender: string;
  subject: string;
  provider: string;
  account: string;
  time: string;
  important: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly gmailState = inject(GmailStateService);

  readonly accounts = computed<AccountSummary[]>(() => {
    const profile = this.gmailState.profile();

    if (!profile) {
      return [];
    }

    return [
      {
        name: profile.emailAddress,
        provider: 'Gmail',
        unread: this.gmailState.unreadCount(),
        important: this.gmailState.importantCount(),
        status: 'online',
      },
    ];
  });

  readonly recentMessages = computed<RecentMessage[]>(() => {
    const profile = this.gmailState.profile();

    if (!profile) {
      return [];
    }

    return this.gmailState
      .messages()
      .slice(0, 5)
      .map((message) => ({
        sender: message.senderName || message.senderAddress,
        subject: message.subject || '(No subject)',
        provider: 'Gmail',
        account: profile.emailAddress,
        time: this.formatReceivedAt(message.receivedAt),
        important: message.isImportant,
      }));
  });

  readonly totalUnread = computed(() => {
    return this.gmailState.unreadCount();
  });

  readonly totalImportant = computed(() => {
    return this.gmailState.importantCount();
  });

  readonly connectedAccountCount = computed(() => {
    return this.gmailState.connected() ? 1 : 0;
  });

  readonly totalMessages = computed(() => {
    return this.gmailState.messageCount();
  });

  readonly loading = this.gmailState.loading;
  readonly connected = this.gmailState.connected;

  private formatReceivedAt(value: string): string {
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
}
