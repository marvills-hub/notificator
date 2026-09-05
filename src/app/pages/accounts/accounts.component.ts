import { Component, OnInit, signal } from '@angular/core';
import { GmailService } from '../../core/services/gmail.service';
import { GmailConnectionResult, GmailMessage } from '../../core/models/gmail-profile.model';

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
  readonly connectingProvider = signal<string | null>(null);
  readonly restoringAccounts = signal(true);
  readonly gmailMessages = signal<GmailMessage[]>([]);
  readonly accounts = signal<ConnectedAccountView[]>([]);

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

  constructor(private readonly gmail: GmailService) {}

  async ngOnInit(): Promise<void> {
    await this.restoreConnectedAccounts();
  }

  private async restoreConnectedAccounts(): Promise<void> {
    this.restoringAccounts.set(true);

    try {
      console.log('[GMAIL] Checking for saved Gmail connection...');

      const result = await this.gmail.restore();

      console.log('[GMAIL] Saved Gmail connection restored.', result.profile.emailAddress);

      this.applyGmailConnection(result);
    } catch (error) {
      console.log('[GMAIL] No saved Gmail connection found.', error);
    } finally {
      this.restoringAccounts.set(false);
    }
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
      console.log('[GMAIL] Starting Gmail connection...');

      const result = await this.gmail.connect();

      this.applyGmailConnection(result);

      console.log('[GMAIL] Gmail connected successfully.', result.profile.emailAddress);
    } catch (error) {
      console.error('[GMAIL] Gmail connection failed.', error);
    }
  }

  private async connectOutlook(): Promise<void> {
    console.log('[OUTLOOK] Starting Outlook OAuth...');
  }

  private applyGmailConnection(result: GmailConnectionResult): void {
    const profile = result.profile;
    const currentAccounts = this.accounts();

    const existingIndex = currentAccounts.findIndex(
      (account) => account.email === profile.emailAddress && account.provider === 'Gmail',
    );

    const account: ConnectedAccountView = {
      id: existingIndex >= 0 ? currentAccounts[existingIndex].id : crypto.randomUUID(),
      provider: 'Gmail',
      name: 'Gmail',
      email: profile.emailAddress,
      unread: result.messages.filter((message) => !message.isRead).length,
      important: result.messages.filter((message) => message.isImportant).length,
      syncing: false,
    };

    if (existingIndex >= 0) {
      const updatedAccounts = [...currentAccounts];

      updatedAccounts[existingIndex] = account;

      this.accounts.set(updatedAccounts);
    } else {
      this.accounts.update((accounts) => [...accounts, account]);
    }

    this.gmailMessages.set(result.messages);

    console.log('[GMAIL] UI account state updated.', this.accounts());
  }

  disconnect(account: ConnectedAccountView): void {
    this.accounts.update((accounts) => accounts.filter((item) => item.id !== account.id));

    if (account.provider === 'Gmail') {
      this.gmailMessages.set([]);
    }
  }
}
