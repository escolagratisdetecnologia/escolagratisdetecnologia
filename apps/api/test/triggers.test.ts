import { Logger } from '@aws-lambda-powertools/logger';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_LINKED, createTriggers, type TriggerEvent } from '../src/triggers.ts';

type Reply = (input: Record<string, unknown>) => unknown;

function setup(replies: Record<string, Reply> = {}) {
  const sent: { command: string; input: Record<string, unknown> }[] = [];
  const client = {
    async send(command: { constructor: { name: string }; input: unknown }) {
      const name = command.constructor.name.replace(/Command$/, '');
      const input = command.input as Record<string, unknown>;
      sent.push({ command: name, input });
      const reply = replies[name];
      if (reply === undefined) throw new Error(`Unexpected ${name}`);
      return reply(input);
    },
  };
  // The fake only implements send(); the triggers use nothing else.
  const handler = createTriggers(client as never, new Logger({ logLevel: 'SILENT' }));
  return { handler, sent };
}

const event = (
  triggerSource: string,
  userAttributes: Record<string, string> = {},
  codeParameter?: string,
): TriggerEvent => ({
  triggerSource,
  userPoolId: 'sa-east-1_Teste123',
  userName: 'Google_1098',
  request: { userAttributes, ...(codeParameter === undefined ? {} : { codeParameter }) },
  response: {},
});

const google = { email: 'Ana@Example.com', email_verified: 'true' };

describe('pre sign-up trigger', () => {
  it('links a first Google sign-in to the account with the same e-mail', async () => {
    const { handler, sent } = setup({
      ListUsers: () => ({
        Users: [
          { Username: 'Google_555', UserStatus: 'EXTERNAL_PROVIDER' },
          { Username: 'uuid-da-ana', UserStatus: 'CONFIRMED' },
        ],
      }),
      AdminLinkProviderForUser: () => ({}),
    });

    await expect(handler(event('PreSignUp_ExternalProvider', google))).rejects.toThrow(
      ACCOUNT_LINKED,
    );
    expect(sent).toEqual([
      {
        command: 'ListUsers',
        input: { UserPoolId: 'sa-east-1_Teste123', Filter: 'email = "ana@example.com"' },
      },
      {
        command: 'AdminLinkProviderForUser',
        input: {
          UserPoolId: 'sa-east-1_Teste123',
          DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: 'uuid-da-ana' },
          SourceUser: {
            ProviderName: 'Google',
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: '1098',
          },
        },
      },
    ]);
  });

  it('creates the e-mail account first when there is none', async () => {
    const { handler, sent } = setup({
      ListUsers: () => ({ Users: [] }),
      AdminCreateUser: () => ({ User: { Username: 'uuid-nova' } }),
      AdminLinkProviderForUser: () => ({}),
    });

    await expect(handler(event('PreSignUp_ExternalProvider', google))).rejects.toThrow(
      ACCOUNT_LINKED,
    );
    expect(sent[1]).toEqual({
      command: 'AdminCreateUser',
      input: {
        UserPoolId: 'sa-east-1_Teste123',
        Username: 'ana@example.com',
        UserAttributes: [
          { Name: 'email', Value: 'ana@example.com' },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      },
    });
    expect(sent[2]?.input.DestinationUser).toEqual({
      ProviderName: 'Cognito',
      ProviderAttributeValue: 'uuid-nova',
    });
  });

  it('refuses Google accounts without a verified e-mail', async () => {
    const { handler, sent } = setup();

    const unverified: Record<string, string>[] = [
      {},
      { email: 'ana@example.com', email_verified: 'false' },
    ];
    for (const attributes of unverified) {
      await expect(handler(event('PreSignUp_ExternalProvider', attributes))).rejects.toThrow(
        'Google account without a verified e-mail',
      );
    }
    expect(sent).toEqual([]);
  });

  it('escapes the e-mail in the search filter', async () => {
    const { handler, sent } = setup({
      ListUsers: () => ({ Users: [{ Username: 'u', UserStatus: 'CONFIRMED' }] }),
      AdminLinkProviderForUser: () => ({}),
    });

    await expect(
      handler(
        event('PreSignUp_ExternalProvider', {
          email: 'a"b\\c@example.com',
          email_verified: 'true',
        }),
      ),
    ).rejects.toThrow(ACCOUNT_LINKED);
    expect(sent[0]?.input.Filter).toBe('email = "a\\"b\\\\c@example.com"');
  });

  it('leaves e-mail sign-ups alone', async () => {
    const { handler, sent } = setup();
    const signUp = event('PreSignUp_SignUp', { email: 'ana@example.com' });

    expect(await handler(signUp)).toBe(signUp);
    expect(sent).toEqual([]);
  });
});

describe('custom message trigger', () => {
  it('writes the code e-mails in pt-BR', async () => {
    const { handler } = setup();

    for (const source of [
      'CustomMessage_SignUp',
      'CustomMessage_ResendCode',
      'CustomMessage_Authentication',
    ]) {
      const result = await handler(event(source, {}, '{####}'));

      expect(result.response.emailSubject).toBe(
        'Seu código para entrar na Escola Grátis de Tecnologia',
      );
      expect(result.response.emailMessage).toContain('{####}');
      expect(result.response.emailMessage).toContain(
        'Use este código para entrar na Escola Grátis de Tecnologia:',
      );
    }
  });

  it('leaves other messages as they are', async () => {
    const { handler } = setup();

    const result = await handler(event('CustomMessage_ForgotPassword', {}, '{####}'));

    expect(result.response).toEqual({});
  });
});
