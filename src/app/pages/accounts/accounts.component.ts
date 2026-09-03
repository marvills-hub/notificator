import { Component, signal } from '@angular/core';
import { GmailService } from '../../core/services/gmail.service';
import { GmailMessage } from '../../core/models/gmail-profile.model';

interface ProviderOption {
  id: 'gmail' | 'outlook' | 'whatsapp';
  name: string;
  description: string;
  status: 'available' | 'coming-soon';
}

interface ConnectedAccountView {
  id: string;
  provider: string;
  name: string;
  email: string;
  unread: number;
  important: number;
  syncing: boolean;
}

@Component({
  selector: 'app-accounts',
  standalone: true,
  templateUrl: './accounts.component.html',
  styleUrl: './accounts.component.scss',
})
export class AccountsComponent {
  connectingProvider = signal<string | null>(null);
  gmailMessages: GmailMessage[] = [];
  providers: ProviderOption[] = [
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Connect personal or work Gmail accounts.',
      status: 'available',
    },
    {
      id: 'outlook',
      name: 'Outlook',
      description: 'Connect Microsoft Outlook or Microsoft 365.',
      status: 'available',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      description: 'WhatsApp integration will be added later.',
      status: 'coming-soon',
    },
  ];

  accounts: ConnectedAccountView[] = [];

  constructor(private readonly gmail: GmailService) {}

  async connect(provider: ProviderOption): Promise<void> {
    if (provider.status === 'coming-soon') {
      return;
    }

    this.connectingProvider.set(provider.id);

    try {
      if (provider.id === 'gmail') {
        await this.connectGmail();
      }

      if (provider.id === 'outlook') {
        await this.connectOutlook();
      }
    } finally {
      this.connectingProvider.set(null);
    }
  }

  private async connectGmail(): Promise<void> {
    try {
      const result = await this.gmail.connect();

      const profile = result.profile;

      const alreadyConnected = this.accounts.some(
        (account) => account.email === profile.emailAddress,
      );

      if (!alreadyConnected) {
        this.accounts = [
          ...this.accounts,
          {
            id: crypto.randomUUID(),

            provider: 'Gmail',

            name: 'Gmail',

            email: profile.emailAddress,

            unread: result.messages.filter((message) => !message.isRead).length,

            important: result.messages.filter((message) => message.isImportant).length,

            syncing: false,
          },
        ];
      }

      this.gmailMessages = result.messages;

      console.log('Gmail connected:', profile);

      console.log('Gmail messages:', result.messages);
    } catch (error) {
      console.error('Gmail connection failed:', error);
    }
  }

  private async connectOutlook(): Promise<void> {
    console.log('Starting Outlook OAuth...');
  }

  disconnect(account: ConnectedAccountView): void {
    this.accounts = this.accounts.filter((item) => item.id !== account.id);
  }
}
