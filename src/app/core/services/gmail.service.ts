import { Injectable } from '@angular/core';

import { invoke } from '@tauri-apps/api/core';

import { GmailConnectionResult } from '../models/gmail-profile.model';

@Injectable({
  providedIn: 'root',
})
export class GmailService {
  private readonly clientId = '';
  private readonly clientSecret = '';

  connect(): Promise<GmailConnectionResult> {
    return invoke<GmailConnectionResult>('connect_gmail', {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
  }

  restore(): Promise<GmailConnectionResult> {
    return invoke<GmailConnectionResult>('restore_gmail', {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
  }
}
