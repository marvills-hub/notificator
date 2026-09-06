export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
  unreadCount: number;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  accountId: string;
  accountEmail: string;
  senderName: string;
  senderAddress: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
  isImportant: boolean;
  isStarred: boolean;
}

export interface GmailConnectionResult {
  profile: GmailProfile;
  messages: GmailMessage[];
}

export interface GmailAccountSummary {
  accountId: string;
  emailAddress: string;
  isPrimary: boolean;
}

export interface GmailAccountConnectionResult {
  accountId: string;
  emailAddress: string;
  isPrimary: boolean;
  profile: GmailProfile;
  messages: GmailMessage[];
}
