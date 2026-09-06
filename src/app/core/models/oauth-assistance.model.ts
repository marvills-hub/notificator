export type OAuthIssueType =
  | 'cancelled'
  | 'timeout'
  | 'access-blocked'
  | 'test-user'
  | 'network'
  | 'token-exchange'
  | 'browser-error'
  | 'unknown';

export interface OAuthIssueStep {
  text: string;
  linkLabel?: string;
  link?: string;
}

export interface OAuthIssue {
  type: OAuthIssueType;
  title: string;
  message: string;
  steps: OAuthIssueStep[];
  canRetry: boolean;
}
