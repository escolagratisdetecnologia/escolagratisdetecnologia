/** Who is calling: the learner id (Cognito `sub`; locally, derived from the e-mail). */
export interface Identity {
  sub: string;
}

export interface Tokens {
  accessToken: string;
  /** Present after a sign-in and after each refresh (refresh tokens rotate). */
  refreshToken?: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

/** `invalid_code` covers wrong and expired codes alike. */
export type CodeCheck = { tokens: Tokens } | { error: 'invalid_code' };

/** The provider refuses for now (too many codes or attempts): the API answers 429. */
export class RateLimitedError extends Error {
  constructor() {
    super('Identity provider rate limit');
    this.name = 'RateLimitedError';
  }
}

/**
 * Accounts and sessions (spec §5). In AWS, Cognito (identity/cognito.ts); locally, an in-process
 * stand-in with Mailpit and a fake Google (identity/local.ts).
 */
export interface IdentityProvider {
  /**
   * Sends a code to the e-mail: sign-in when the account exists, sign-up otherwise, with the same
   * observable behavior (spec §5.1). Returns the state the second step needs.
   */
  startEmailLogin(email: string): Promise<string>;
  finishEmailLogin(state: string, code: string): Promise<CodeCheck>;
  /** Where the browser goes to sign in with Google (authorization code with PKCE). */
  googleAuthorizeUrl(request: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  /** Exchanges the code that the Google sign-in sent back to /api/auth/callback. */
  finishGoogleLogin(request: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<Tokens>;
  /** New tokens, or null when the refresh token no longer works. */
  refresh(refreshToken: string): Promise<Tokens | null>;
  /** Ends the session of this refresh token (logout). */
  revoke(refreshToken: string): Promise<void>;
  /** The learner behind a valid access token, or null. */
  verifyAccessToken(accessToken: string): Promise<Identity | null>;
  /** The account e-mail (Eu page and data export); null when the account is gone. */
  email(sub: string): Promise<string | null>;
  /** Deletes the account, Google link included. */
  deleteUser(sub: string): Promise<void>;
}

const unavailable = async (): Promise<never> => {
  throw new Error('No identity provider wired yet');
};

/** No accounts yet: every token is refused. Replaced when the Cognito and local providers are wired. */
export const noAccounts: IdentityProvider = {
  startEmailLogin: unavailable,
  finishEmailLogin: unavailable,
  googleAuthorizeUrl: () => {
    throw new Error('No identity provider wired yet');
  },
  finishGoogleLogin: unavailable,
  refresh: async () => null,
  revoke: async () => {},
  verifyAccessToken: async () => null,
  email: async () => null,
  deleteUser: unavailable,
};
