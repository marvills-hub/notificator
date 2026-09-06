import { Injectable } from '@angular/core';
import { getIdToken } from 'firebase/auth';
import { invoke } from '@tauri-apps/api/core';
import { auth } from '../firebase/firebase.config';
import {
  GmailAccountConnectionResult,
  GmailAccountSummary,
  GmailConnectionResult,
} from '../models/gmail-profile.model';

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

  async cancelConnect(): Promise<void> {
    return invoke<void>('cancel_gmail_connect');
  }

  async restore(): Promise<GmailConnectionResult> {
    const firebaseIdToken = await this.getFirebaseIdToken();

    return invoke<GmailConnectionResult>('restore_gmail', {
      firebaseIdToken,
    });
  }

  async listAccounts(): Promise<GmailAccountSummary[]> {
    const firebaseIdToken = await this.getFirebaseIdToken();

    return invoke<GmailAccountSummary[]>('list_gmail_accounts', {
      firebaseIdToken,
    });
  }

  async restoreAccounts(): Promise<GmailAccountConnectionResult[]> {
    const firebaseIdToken = await this.getFirebaseIdToken();

    return invoke<GmailAccountConnectionResult[]>('restore_gmail_accounts', {
      firebaseIdToken,
    });
  }

  async disconnect(): Promise<void> {
    const firebaseIdToken = await this.getFirebaseIdToken();

    return invoke<void>('disconnect_gmail', {
      firebaseIdToken,
    });
  }

  async disconnectAccount(accountId: string): Promise<void> {
    const firebaseIdToken = await this.getFirebaseIdToken();

    return invoke<void>('disconnect_gmail_account', {
      firebaseIdToken,
      accountId,
    });
  }

  async setPrimaryAccount(accountId: string): Promise<void> {
    const firebaseIdToken = await this.getFirebaseIdToken();

    return invoke<void>('set_primary_gmail_account', {
      firebaseIdToken,
      accountId,
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
