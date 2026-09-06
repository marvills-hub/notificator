import { Injectable } from '@angular/core';
import { GmailMessage } from '../models/gmail-profile.model';

@Injectable({
  providedIn: 'root',
})
export class GmailMessageTrackerService {
  private readonly knownMessageIds = new Set<string>();
  private readonly maxKnownMessages = 500;

  getNewMessages(messages: GmailMessage[]): GmailMessage[] {
    return messages.filter((message) => !this.knownMessageIds.has(this.getMessageKey(message)));
  }

  remember(messages: GmailMessage[]): void {
    for (const message of messages) {
      this.knownMessageIds.add(this.getMessageKey(message));
    }

    if (this.knownMessageIds.size <= this.maxKnownMessages) {
      return;
    }

    const ids = Array.from(this.knownMessageIds);
    const recentIds = ids.slice(ids.length - this.maxKnownMessages);

    this.knownMessageIds.clear();

    for (const id of recentIds) {
      this.knownMessageIds.add(id);
    }
  }

  clear(): void {
    this.knownMessageIds.clear();
  }

  private getMessageKey(message: GmailMessage): string {
    return `${message.accountId}:${message.id}`;
  }
}
