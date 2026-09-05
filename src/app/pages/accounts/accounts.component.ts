import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { GmailStateService } from '../../core/services/gmail-state.service';

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
export class AccountsComponent implements OnInit {
  private readonly gmailState = inject(GmailStateService);

  readonly connectingProvider = signal<string | null>(null);

  readonly restoringAccounts = this.gmailState.restoring;
  readonly gmailMessages = this.gmailState.messages;

  readonly accounts = computed<ConnectedAccountView[]>(() => {
    const profile = this.gmailState.profile();

    if (!profile) {
      return [];
    }

    return [
      {
        id: profile.emailAddress,
        provider: 'Gmail',
        name: 'Gmail',
        email: profile.emailAddress,
        unread: this.gmailState.unreadCount(),
        important: this.gmailState.importantCount(),
        syncing: this.gmailState.loading(),
      },
    ];
  });

  readonly providers: ProviderOption[] = [
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

  async ngOnInit(): Promise<void> {
    await this.gmailState.initialize();
  }

  async connect(provider: ProviderOption): Promise<void> {
    if (provider.status === 'coming-soon') {
      return;
    }

    if (this.connectingProvider()) {
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
      console.log('[ACCOUNTS] Starting Gmail connection...');

      await this.gmailState.connect();

      console.log('[ACCOUNTS] Gmail connected successfully.', this.gmailState.emailAddress());
    } catch (error) {
      console.error('[ACCOUNTS] Gmail connection failed.', error);
    }
  }

  private async connectOutlook(): Promise<void> {
    console.log('[OUTLOOK] Starting Outlook OAuth...');
  }

  async disconnect(account: ConnectedAccountView): Promise<void> {
    if (account.provider !== 'Gmail') {
      return;
    }

    try {
      await this.gmailState.disconnect();
    } catch (error) {
      console.error('[ACCOUNTS] Unable to disconnect Gmail.', error);
    }
  }
}
