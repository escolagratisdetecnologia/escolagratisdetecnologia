import { createHmac } from 'node:crypto';
import {
  AdminDeleteUserCommand,
  AdminDisableProviderForUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  GetTokensFromRefreshTokenCommand,
  RevokeTokenCommand,
  SignUpCommand,
  type AuthenticationResultType,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { Jwks } from 'aws-jwt-verify/jwk';
import { z } from 'zod';
import {
  RateLimitedError,
  type CodeCheck,
  type IdentityProvider,
  type Tokens,
} from '../identity.ts';

export interface CognitoSettings {
  userPoolId: string;
  clientId: string;
  clientSecret: string;
  /** Domain of the user pool (auth.<site domain>): Google sign-in goes through it. */
  domain: string;
}

export interface CognitoOptions {
  client?: Pick<CognitoIdentityProviderClient, 'send'>;
  fetch?: typeof fetch;
  /** Signing keys to trust without downloading them (tests). */
  jwks?: Jwks;
}

/** E-mail sign-in in progress: sign-up (new account) or sign-in, and the Cognito session. */
const pendingLogin = z.object({
  kind: z.enum(['signup', 'signin']),
  username: z.string(),
  session: z.string(),
});
type PendingLogin = z.infer<typeof pendingLogin>;

const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

const linkedIdentity = z.array(z.object({ providerName: z.string(), userId: z.string() }));

/** Google identities linked to the account (the `identities` attribute, a JSON string). */
function linkedIdentities(value: string | undefined) {
  try {
    return linkedIdentity.parse(JSON.parse(value ?? '[]'));
  } catch {
    return [];
  }
}

const named = (error: unknown, ...names: string[]) =>
  error instanceof Error && names.includes(error.name);

const THROTTLED = ['TooManyRequestsException', 'LimitExceededException'];
const BAD_CODE = ['CodeMismatchException', 'ExpiredCodeException', 'NotAuthorizedException'];

/**
 * Learner accounts in the Cognito user pool (Essentials): passwordless e-mail codes through the
 * server-side (Admin*) API, Google through the pool domain, refresh tokens that rotate (ADR 0024).
 */
export function createCognitoIdentity(
  settings: CognitoSettings,
  options: CognitoOptions = {},
): IdentityProvider {
  const client = options.client ?? new CognitoIdentityProviderClient({});
  const fetchFn = options.fetch ?? fetch;
  const { userPoolId, clientId, clientSecret, domain } = settings;
  const verifier = CognitoJwtVerifier.create({ userPoolId, tokenUse: 'access', clientId });
  if (options.jwks !== undefined) verifier.cacheJwks(options.jwks);

  const secretHash = (username: string) =>
    createHmac('sha256', clientSecret)
      .update(username + clientId)
      .digest('base64');
  const encode = (pending: PendingLogin) =>
    Buffer.from(JSON.stringify(pending)).toString('base64url');
  const decode = (state: string): PendingLogin | null => {
    try {
      const parsed = pendingLogin.safeParse(
        JSON.parse(Buffer.from(state, 'base64url').toString('utf8')),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  function tokensOf(result: AuthenticationResultType | undefined): Tokens {
    if (result?.AccessToken === undefined || result.ExpiresIn === undefined) {
      throw new Error('Cognito answered without tokens');
    }
    return {
      accessToken: result.AccessToken,
      ...(result.RefreshToken === undefined ? {} : { refreshToken: result.RefreshToken }),
      expiresIn: result.ExpiresIn,
    };
  }

  async function signUp(email: string): Promise<string> {
    const out = await client.send(
      new SignUpCommand({
        ClientId: clientId,
        Username: email,
        SecretHash: secretHash(email),
        UserAttributes: [{ Name: 'email', Value: email }],
      }),
    );
    if (out.Session === undefined) throw new Error('Cognito sign-up answered without a session');
    return encode({ kind: 'signup', username: email, session: out.Session });
  }

  async function signIn(email: string): Promise<string> {
    const out = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: 'USER_AUTH',
        AuthParameters: {
          USERNAME: email,
          PREFERRED_CHALLENGE: 'EMAIL_OTP',
          SECRET_HASH: secretHash(email),
        },
      }),
    );
    if (out.ChallengeName !== 'EMAIL_OTP') {
      throw new Error(`Cognito sign-in answered the unexpected challenge ${out.ChallengeName}`);
    }
    if (out.Session === undefined) throw new Error('Cognito sign-in answered without a session');
    // Cognito may answer with the internal user name; the code check must use the same one.
    const username = out.ChallengeParameters?.USERNAME ?? email;
    return encode({ kind: 'signin', username, session: out.Session });
  }

  async function user(sub: string) {
    try {
      return await client.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: sub }));
    } catch (error) {
      if (named(error, 'UserNotFoundException')) return null;
      throw error;
    }
  }

  return {
    async startEmailLogin(email) {
      try {
        try {
          return await signUp(email);
        } catch (error) {
          if (!named(error, 'UsernameExistsException')) throw error;
        }
        try {
          return await signIn(email);
        } catch (error) {
          if (!named(error, 'UserNotConfirmedException')) throw error;
          // Signed up before but never typed the code: start that sign-up over.
          await client.send(
            new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: email }),
          );
          return await signUp(email);
        }
      } catch (error) {
        if (named(error, ...THROTTLED)) throw new RateLimitedError();
        throw error;
      }
    },

    async finishEmailLogin(state, code): Promise<CodeCheck> {
      const pending = decode(state);
      if (pending === null) return { error: 'invalid_code' };
      const { username, session } = pending;
      try {
        if (pending.kind === 'signup') {
          const confirmed = await client.send(
            new ConfirmSignUpCommand({
              ClientId: clientId,
              Username: username,
              ConfirmationCode: code,
              SecretHash: secretHash(username),
              Session: session,
            }),
          );
          // The session from the confirmation signs the new learner in, without a second code.
          const out = await client.send(
            new AdminInitiateAuthCommand({
              UserPoolId: userPoolId,
              ClientId: clientId,
              AuthFlow: 'USER_AUTH',
              AuthParameters: { USERNAME: username, SECRET_HASH: secretHash(username) },
              Session: confirmed.Session,
            }),
          );
          return { tokens: tokensOf(out.AuthenticationResult) };
        }
        const out = await client.send(
          new AdminRespondToAuthChallengeCommand({
            UserPoolId: userPoolId,
            ClientId: clientId,
            ChallengeName: 'EMAIL_OTP',
            Session: session,
            ChallengeResponses: {
              USERNAME: username,
              EMAIL_OTP_CODE: code,
              SECRET_HASH: secretHash(username),
            },
          }),
        );
        return { tokens: tokensOf(out.AuthenticationResult) };
      } catch (error) {
        if (named(error, ...BAD_CODE)) return { error: 'invalid_code' };
        if (named(error, 'TooManyFailedAttemptsException', ...THROTTLED)) {
          throw new RateLimitedError();
        }
        throw error;
      }
    },

    googleAuthorizeUrl({ state, codeChallenge, redirectUri }) {
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        identity_provider: 'Google',
        scope: 'openid email',
        prompt: 'select_account',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return `https://${domain}/oauth2/authorize?${query}`;
    },

    async finishGoogleLogin({ code, codeVerifier, redirectUri }) {
      const res = await fetchFn(`https://${domain}/oauth2/token`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      if (!res.ok) throw new Error(`Cognito token endpoint answered ${res.status}`);
      const body = tokenResponse.parse(await res.json());
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresIn: body.expires_in,
      };
    },

    async refresh(refreshToken) {
      try {
        const out = await client.send(
          new GetTokensFromRefreshTokenCommand({
            ClientId: clientId,
            ClientSecret: clientSecret,
            RefreshToken: refreshToken,
          }),
        );
        return tokensOf(out.AuthenticationResult);
      } catch (error) {
        if (named(error, 'NotAuthorizedException', 'RefreshTokenReuseException')) return null;
        throw error;
      }
    },

    async revoke(refreshToken) {
      await client.send(
        new RevokeTokenCommand({
          Token: refreshToken,
          ClientId: clientId,
          ClientSecret: clientSecret,
        }),
      );
    },

    async verifyAccessToken(accessToken) {
      try {
        const payload = await verifier.verify(accessToken);
        return { sub: payload.sub };
      } catch {
        return null;
      }
    },

    async email(sub) {
      const found = await user(sub);
      return found?.UserAttributes?.find((attribute) => attribute.Name === 'email')?.Value ?? null;
    },

    async deleteUser(sub) {
      const found = await user(sub);
      if (found === null) return;
      // Unlink Google first, so a later Google sign-in starts a new account instead of failing.
      const identities = found.UserAttributes?.find((attribute) => attribute.Name === 'identities');
      for (const { providerName, userId } of linkedIdentities(identities?.Value)) {
        await client.send(
          new AdminDisableProviderForUserCommand({
            UserPoolId: userPoolId,
            User: {
              ProviderName: providerName,
              ProviderAttributeName: 'Cognito_Subject',
              ProviderAttributeValue: userId,
            },
          }),
        );
      }
      await client.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: sub }));
    },
  };
}
