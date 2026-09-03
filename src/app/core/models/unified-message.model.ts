import { AccountProvider } from './connected-account.model';

export interface UnifiedMessage {
  id?: string;

  userId: string;

  accountId: string;

  provider: AccountProvider;

  sourceMessageId: string;

  senderName: string;

  senderAddress?: string;

  subject?: string;

  preview: string;

  receivedAt: unknown;

  isRead: boolean;

  isImportant: boolean;

  isStarred: boolean;
}
