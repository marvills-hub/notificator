import { Injectable } from '@angular/core';

import { invoke } from '@tauri-apps/api/core';

import { GmailConnectionResult } from '../models/gmail-profile.model';

@Injectable({
  providedIn: 'root',
})
export class GmailService {
  private readonly clientId =
    '765110123067-gvh629sadobl3b4nhe9amtv41aidh9jc.apps.googleusercontent.com';

  connect(): Promise<GmailConnectionResult> {
    return invoke<GmailConnectionResult>('connect_gmail', {
      clientId: this.clientId,
    });
  }
}
