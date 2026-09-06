import { Injectable } from '@angular/core';
import { OAuthIssue } from '../models/oauth-assistance.model';
import { OAUTH_ISSUES } from '../constants/oauth-assistance.constant';

@Injectable({
  providedIn: 'root',
})
export class OAuthAssistanceService {
  resolve(error: unknown): OAuthIssue {
    const message = this.getErrorMessage(error);
    const normalized = message.toLowerCase();

    if (message.startsWith('GMAIL_OAUTH_ERROR:')) {
      const [, oauthError = '', description = ''] = message.split(':', 3);

      if (oauthError.toLowerCase() === 'access_denied') {
        return OAUTH_ISSUES.accessBlocked;
      }

      return {
        ...OAUTH_ISSUES.googleAuthorizationFailed,
        message: description.trim() || OAUTH_ISSUES.googleAuthorizationFailed.message,
      };
    }

    if (message === 'GMAIL_OAUTH_CANCELLED') {
      return OAUTH_ISSUES.cancelled;
    }

    if (message === 'GMAIL_OAUTH_TIMEOUT') {
      return OAUTH_ISSUES.timeout;
    }

    if (normalized.includes('cancelled') || normalized.includes('canceled')) {
      return OAUTH_ISSUES.cancelled;
    }

    if (normalized.includes('timed out') || normalized.includes('timeout')) {
      return OAUTH_ISSUES.timeout;
    }

    if (
      normalized.includes('access blocked') ||
      normalized.includes('access_denied') ||
      normalized.includes('403') ||
      normalized.includes('verification') ||
      normalized.includes('not verified')
    ) {
      return OAUTH_ISSUES.accessBlocked;
    }

    if (normalized.includes('test user') || normalized.includes('testing')) {
      return OAUTH_ISSUES.testUser;
    }

    if (
      normalized.includes('network') ||
      normalized.includes('fetch') ||
      normalized.includes('connection')
    ) {
      return OAUTH_ISSUES.network;
    }

    if (normalized.includes('token') || normalized.includes('exchange')) {
      return OAUTH_ISSUES.tokenExchange;
    }

    return OAUTH_ISSUES.unknown;
  }

  browserError(): OAuthIssue {
    return OAUTH_ISSUES.browserError;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
