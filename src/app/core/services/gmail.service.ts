import { Injectable } from '@angular/core';
import { getIdToken } from 'firebase/auth';
import { invoke } from '@tauri-apps/api/core';

import { auth } from '../firebase/firebase.config';
import { GmailConnectionResult } from '../models/gmail-profile.model';

@Injectable({
  providedIn: 'root',
})
export class GmailService {
  async connect(): Promise<GmailConnectionResult> {
    const firebaseIdToken = await this.getFirebaseIdToken();

    return invoke<GmailConnectionResult>('connect_gmail', {
      firebaseIdToken,
    });
  }

  async restore(): Promise<GmailConnectionResult> {
    const firebaseIdToken = await this.getFirebaseIdToken();

    return invoke<GmailConnectionResult>('restore_gmail', {
      firebaseIdToken,
    });
  }

  async disconnect(): Promise<void> {
    const firebaseIdToken = await this.getFirebaseIdToken();

    return invoke<void>('disconnect_gmail', {
      firebaseIdToken,
    });
  }

  private async getFirebaseIdToken(): Promise<string> {
    const user = auth.currentUser;

    if (!user) {
      throw new Error('You must be signed in to Notificator before using Gmail.');
    }

    return getIdToken(user);
  }
}
