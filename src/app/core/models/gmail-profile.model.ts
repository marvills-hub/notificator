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
