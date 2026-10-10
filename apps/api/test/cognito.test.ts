import { createHmac } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { RateLimitedError } from '../src/identity.ts';
import { createCognitoIdentity, type CognitoSettings } from '../src/identity/cognito.ts';

const settings: CognitoSettings = {
  userPoolId: 'sa-east-1_Teste123',
  clientId: 'cliente-teste',
  clientSecret: 'segredo-do-cliente',
  domain: 'auth.example.com',
};
const hash = (username: string) =>
  createHmac('sha256', settings.clientSecret)
    .update(username + settings.clientId)
    .digest('base64');
const result = { AccessToken: 'at', RefreshToken: 'rt', ExpiresIn: 3600 };

type Reply = (input: Record<string, unknown>) => unknown;

/** Cognito stand-in: answers each command by name and remembers what was sent. */
function fakeClient(replies: Record<string, Reply>) {
  const sent: { command: string; input: Record<string, unknown> }[] = [];
  return {
    sent,
    async send(command: { constructor: { name: string }; input: unknown }) {
      const name = command.constructor.name.replace(/Command$/, '');
      const input = command.input as Record<string, unknown>;
      sent.push({ command: name, input });
      const reply = replies[name];
      if (reply === undefined) throw new Error(`Unexpected ${name}`);
      return reply(input);
    },
  };
}

const failure = (name: string) => () => {
  const error = new Error(name);
  error.name = name;
  throw error;
};

function provider(replies: Record<string, Reply>, extra = {}) {
  const client = fakeClient(replies);
  // The fake only implements send(); the adapter uses nothing else.
  const identity = createCognitoIdentity(settings, { client: client as never, ...extra });
  return { identity, sent: client.sent };
}

describe('Cognito e-mail sign-in', () => {
  it('signs up a new e-mail without a password', async () => {
    const { identity, sent } = provider({ SignUp: () => ({ Session: 's1' }) });

    const state = await identity.startEmailLogin('ana@example.com');

    expect(sent).toEqual([
      {
        command: 'SignUp',
        input: {
          ClientId: 'cliente-teste',
          Username: 'ana@example.com',
          SecretHash: hash('ana@example.com'),
          UserAttributes: [{ Name: 'email', Value: 'ana@example.com' }],
        },
      },
    ]);
    expect(JSON.parse(Buffer.from(state, 'base64url').toString())).toEqual({
      kind: 'signup',
      username: 'ana@example.com',
      session: 's1',
    });
  });

  it('asks for a sign-in code when the account exists', async () => {
    const { identity, sent } = provider({
      SignUp: failure('UsernameExistsException'),
      AdminInitiateAuth: () => ({
        ChallengeName: 'EMAIL_OTP',
        ChallengeParameters: { USERNAME: 'uuid-da-ana' },
        Session: 's2',
      }),
    });

    const state = await identity.startEmailLogin('ana@example.com');

    expect(sent[1]).toEqual({
      command: 'AdminInitiateAuth',
      input: {
        UserPoolId: 'sa-east-1_Teste123',
        ClientId: 'cliente-teste',
        AuthFlow: 'USER_AUTH',
        AuthParameters: {
          USERNAME: 'ana@example.com',
          PREFERRED_CHALLENGE: 'EMAIL_OTP',
          SECRET_HASH: hash('ana@example.com'),
        },
      },
    });
    expect(JSON.parse(Buffer.from(state, 'base64url').toString())).toEqual({
      kind: 'signin',
      username: 'uuid-da-ana',
      session: 's2',
    });
  });

  it('fails loudly when sign-in answers a challenge other than the e-mail code', async () => {
    const { identity } = provider({
      SignUp: failure('UsernameExistsException'),
      AdminInitiateAuth: () => ({ ChallengeName: 'PASSWORD', Session: 's2' }),
    });

    const attempt = identity.startEmailLogin('ana@example.com');

    await expect(attempt).rejects.toThrow('PASSWORD');
    await expect(attempt).rejects.not.toThrow('ana@example.com');
  });

  it('starts over a sign-up that was never confirmed', async () => {
    let signUps = 0;
    const { identity, sent } = provider({
      SignUp: (input) => {
        signUps += 1;
        if (signUps === 1) failure('UsernameExistsException')();
        return { Session: `s-${input.Username}` };
      },
      AdminInitiateAuth: failure('UserNotConfirmedException'),
      AdminDeleteUser: () => ({}),
    });

    await identity.startEmailLogin('ana@example.com');

    expect(sent.map(({ command }) => command)).toEqual([
      'SignUp',
      'AdminInitiateAuth',
      'AdminDeleteUser',
      'SignUp',
    ]);
  });

  it('turns Cognito throttling into RateLimitedError', async () => {
    const { identity } = provider({ SignUp: failure('LimitExceededException') });

    await expect(identity.startEmailLogin('ana@example.com')).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  const state = (kind: 'signup' | 'signin', username = 'ana@example.com') =>
    Buffer.from(JSON.stringify({ kind, username, session: 's1' })).toString('base64url');

  it('confirms a sign-up and signs in with the confirmation session', async () => {
    const { identity, sent } = provider({
      ConfirmSignUp: () => ({ Session: 's3' }),
      AdminInitiateAuth: () => ({ AuthenticationResult: result }),
    });

    expect(await identity.finishEmailLogin(state('signup'), '123456')).toEqual({
      tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 },
    });
    expect(sent).toEqual([
      {
        command: 'ConfirmSignUp',
        input: {
          ClientId: 'cliente-teste',
          Username: 'ana@example.com',
          ConfirmationCode: '123456',
          SecretHash: hash('ana@example.com'),
          Session: 's1',
        },
      },
      {
        command: 'AdminInitiateAuth',
        input: {
          UserPoolId: 'sa-east-1_Teste123',
          ClientId: 'cliente-teste',
          AuthFlow: 'USER_AUTH',
          AuthParameters: { USERNAME: 'ana@example.com', SECRET_HASH: hash('ana@example.com') },
          Session: 's3',
        },
      },
    ]);
  });

  it('answers the sign-in challenge with the code', async () => {
    const { identity, sent } = provider({
      AdminRespondToAuthChallenge: () => ({ AuthenticationResult: result }),
    });

    await identity.finishEmailLogin(state('signin', 'uuid-da-ana'), '12345678');

    expect(sent[0]).toEqual({
      command: 'AdminRespondToAuthChallenge',
      input: {
        UserPoolId: 'sa-east-1_Teste123',
        ClientId: 'cliente-teste',
        ChallengeName: 'EMAIL_OTP',
        Session: 's1',
        ChallengeResponses: {
          USERNAME: 'uuid-da-ana',
          EMAIL_OTP_CODE: '12345678',
          SECRET_HASH: hash('uuid-da-ana'),
        },
      },
    });
  });

  it('treats wrong, expired and broken codes alike', async () => {
    for (const name of [
      'CodeMismatchException',
      'ExpiredCodeException',
      'NotAuthorizedException',
    ]) {
      const { identity } = provider({ AdminRespondToAuthChallenge: failure(name) });

      expect(await identity.finishEmailLogin(state('signin'), '123456')).toEqual({
        error: 'invalid_code',
      });
    }
    const { identity } = provider({});
    expect(await identity.finishEmailLogin('lixo', '123456')).toEqual({ error: 'invalid_code' });
  });

  it('slows down after too many wrong codes', async () => {
    const { identity } = provider({
      AdminRespondToAuthChallenge: failure('TooManyFailedAttemptsException'),
    });

    await expect(identity.finishEmailLogin(state('signin'), '123456')).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });
});

describe('Cognito Google sign-in', () => {
  it('goes to Google through the pool domain, with PKCE', () => {
    const { identity } = provider({});

    const url = new URL(
      identity.googleAuthorizeUrl({
        state: 'estado',
        codeChallenge: 'desafio',
        redirectUri: 'https://example.com/api/auth/callback',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://auth.example.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'cliente-teste',
      redirect_uri: 'https://example.com/api/auth/callback',
      identity_provider: 'Google',
      scope: 'openid email',
      prompt: 'select_account',
      state: 'estado',
      code_challenge: 'desafio',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges the code at the token endpoint with the client secret', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
    };
    const { identity } = provider({}, { fetch: fakeFetch });

    const tokens = await identity.finishGoogleLogin({
      code: 'codigo',
      codeVerifier: 'verificador',
      redirectUri: 'https://example.com/api/auth/callback',
    });

    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 });
    expect(calls[0]?.url).toBe('https://auth.example.com/oauth2/token');
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('cliente-teste:segredo-do-cliente').toString('base64')}`,
    );
    expect(Object.fromEntries(calls[0]?.init.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      client_id: 'cliente-teste',
      code: 'codigo',
      redirect_uri: 'https://example.com/api/auth/callback',
      code_verifier: 'verificador',
    });
  });

  it('fails when the token endpoint refuses the code', async () => {
    const fakeFetch = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const { identity } = provider({}, { fetch: fakeFetch });

    await expect(
      identity.finishGoogleLogin({ code: 'x', codeVerifier: 'y', redirectUri: 'z' }),
    ).rejects.toThrow('Cognito token endpoint answered 400');
  });
});

describe('Cognito sessions', () => {
  it('refreshes with rotation and gives up on dead refresh tokens', async () => {
    const { identity, sent } = provider({
      GetTokensFromRefreshToken: () => ({ AuthenticationResult: result }),
    });

    expect(await identity.refresh('rt-velho')).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
    });
    expect(sent[0]?.input).toEqual({
      ClientId: 'cliente-teste',
      ClientSecret: 'segredo-do-cliente',
      RefreshToken: 'rt-velho',
    });

    for (const name of ['NotAuthorizedException', 'RefreshTokenReuseException']) {
      const dead = provider({ GetTokensFromRefreshToken: failure(name) });
      expect(await dead.identity.refresh('rt-velho')).toBeNull();
    }
  });

  it('revokes the refresh token on logout', async () => {
    const { identity, sent } = provider({ RevokeToken: () => ({}) });

    await identity.revoke('rt');

    expect(sent).toEqual([
      {
        command: 'RevokeToken',
        input: { Token: 'rt', ClientId: 'cliente-teste', ClientSecret: 'segredo-do-cliente' },
      },
    ]);
  });
});

describe('Cognito access tokens', () => {
  const issuer = `https://cognito-idp.sa-east-1.amazonaws.com/${settings.userPoolId}`;
  let sign: (claims: Record<string, unknown>, expiresIn?: string) => Promise<string>;
  let identity: ReturnType<typeof createCognitoIdentity>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const { kty = 'RSA', n = '', e = '' } = await exportJWK(publicKey);
    const jwk = { kty, n, e, kid: 'chave-1', alg: 'RS256', use: 'sig' };
    sign = (claims, expiresIn = '1h') =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'chave-1' })
        .setIssuer(issuer)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(privateKey);
    identity = createCognitoIdentity(settings, {
      client: fakeClient({}) as never,
      jwks: { keys: [jwk] },
    });
  });

  const claims = { sub: 'uuid-da-ana', token_use: 'access', client_id: 'cliente-teste' };

  it('accepts access tokens of this pool and client', async () => {
    expect(await identity.verifyAccessToken(await sign(claims))).toEqual({ sub: 'uuid-da-ana' });
  });

  it('refuses ID tokens, other clients, expired tokens and junk', async () => {
    for (const token of [
      await sign({ ...claims, token_use: 'id' }),
      await sign({ ...claims, client_id: 'outro' }),
      await sign(claims, '-1m'),
      'lixo',
    ]) {
      expect(await identity.verifyAccessToken(token)).toBeNull();
    }
  });
});

describe('Cognito accounts', () => {
  const ana = {
    Username: 'uuid-da-ana',
    UserAttributes: [
      { Name: 'email', Value: 'ana@example.com' },
      { Name: 'identities', Value: JSON.stringify([{ providerName: 'Google', userId: '1098' }]) },
    ],
  };

  it('finds the e-mail of an account', async () => {
    const { identity, sent } = provider({ AdminGetUser: () => ana });

    expect(await identity.email('uuid-da-ana')).toBe('ana@example.com');
    expect(sent[0]?.input).toEqual({ UserPoolId: 'sa-east-1_Teste123', Username: 'uuid-da-ana' });

    const gone = provider({ AdminGetUser: failure('UserNotFoundException') });
    expect(await gone.identity.email('uuid-da-ana')).toBeNull();
  });

  it('unlinks Google before deleting the account', async () => {
    const { identity, sent } = provider({
      AdminGetUser: () => ana,
      AdminDisableProviderForUser: () => ({}),
      AdminDeleteUser: () => ({}),
    });

    await identity.deleteUser('uuid-da-ana');

    expect(sent.slice(1)).toEqual([
      {
        command: 'AdminDisableProviderForUser',
        input: {
          UserPoolId: 'sa-east-1_Teste123',
          User: {
            ProviderName: 'Google',
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: '1098',
          },
        },
      },
      {
        command: 'AdminDeleteUser',
        input: { UserPoolId: 'sa-east-1_Teste123', Username: 'uuid-da-ana' },
      },
    ]);
  });

  it('does nothing when the account is already gone', async () => {
    const { identity, sent } = provider({ AdminGetUser: failure('UserNotFoundException') });

    await identity.deleteUser('uuid-da-ana');

    expect(sent.map(({ command }) => command)).toEqual(['AdminGetUser']);
  });
});
