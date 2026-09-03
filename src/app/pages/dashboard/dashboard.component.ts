import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  accounts: AccountSummary[] = [
    {
      name: 'Personal Gmail',
      provider: 'Gmail',
      unread: 4,
      important: 1,
      status: 'online',
    },
    {
      name: 'Work Gmail',
      provider: 'Gmail',
      unread: 7,
      important: 2,
      status: 'online',
    },
    {
      name: 'Outlook',
      provider: 'Outlook',
      unread: 2,
      important: 1,
      status: 'online',
    },
    {
      name: 'WhatsApp',
      provider: 'WhatsApp',
      unread: 4,
      important: 0,
      status: 'online',
    },
  ];

  recentMessages: RecentMessage[] = [
    {
      sender: 'John Smith',
      subject: 'Frontend Developer Interview Schedule',
      provider: 'Gmail',
      account: 'Work Gmail',
      time: '10:32 AM',
      important: true,
    },
    {
      sender: 'Client ABC',
      subject: 'Homepage revision request',
      provider: 'Outlook',
      account: 'Outlook',
      time: '10:18 AM',
      important: true,
    },
    {
      sender: 'David',
      subject: 'Can we have a meeting later?',
      provider: 'WhatsApp',
      account: 'WhatsApp',
      time: '9:56 AM',
      important: false,
    },
  ];

  get totalUnread(): number {
    return this.accounts.reduce((total, account) => total + account.unread, 0);
  }

  get totalImportant(): number {
    return this.accounts.reduce((total, account) => total + account.important, 0);
  }
}
