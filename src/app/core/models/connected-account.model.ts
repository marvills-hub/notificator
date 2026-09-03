export type AccountProvider = 'gmail' | 'outlook' | 'whatsapp';

export type AccountStatus = 'connected' | 'disconnected' | 'error' | 'syncing';

export interface ConnectedAccount {
  id?: string;

  userId: string;

  provider: AccountProvider;

  email?: string;

  displayName: string;

  status: AccountStatus;

  unreadCount: number;

  importantCount: number;

  notificationsEnabled: boolean;

  lastSyncAt?: unknown;

  createdAt?: unknown;
}
