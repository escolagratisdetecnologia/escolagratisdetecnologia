import { Logger } from '@aws-lambda-powertools/logger';
import {
  AdminCreateUserCommand,
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/** The fields of the Cognito trigger events these handlers read and write. */
export interface TriggerEvent {
  triggerSource: string;
  userPoolId: string;
  userName: string;
  request: { userAttributes: Record<string, string>; codeParameter?: string };
  response: Record<string, unknown>;
}

/** Error text Cognito passes on to /api/auth/callback; the API then signs in again once. */
export const ACCOUNT_LINKED = 'ACCOUNT_LINKED';

const CODE_MESSAGES = new Set([
  'CustomMessage_SignUp',
  'CustomMessage_ResendCode',
  'CustomMessage_Authentication',
]);

function codeEmail(code: string): string {
  return [
    '<p>Olá!</p>',
    '<p>Use este código para entrar na Escola Grátis de Tecnologia:</p>',
    `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>`,
    '<p>Se não foi você que pediu, pode ignorar este e-mail: sem o código, ninguém entra na sua conta.</p>',
  ].join('');
}

/**
 * Cognito triggers of the learner pool (ADR 0024):
 * - pre sign-up: a first Google sign-in is linked to the account with the same e-mail (created
 *   when there is none), so every learner has one account and one `sub`;
 * - custom message: the e-mails with codes, in pt-BR.
 */
export function createTriggers(
  client: Pick<CognitoIdentityProviderClient, 'send'>,
  logger: Logger,
) {
  async function findAccount(userPoolId: string, email: string): Promise<string | undefined> {
    const { Users = [] } = await client.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${email.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
      }),
    );
    return Users.find((user) => user.UserStatus !== 'EXTERNAL_PROVIDER')?.Username;
  }

  async function linkGoogle(event: TriggerEvent): Promise<never> {
    const { email, email_verified: verified } = event.request.userAttributes;
    if (email === undefined || verified !== 'true') {
      throw new Error('Google account without a verified e-mail');
    }
    const separator = event.userName.indexOf('_');
    const providerName = event.userName.slice(0, separator);
    const providerUserId = event.userName.slice(separator + 1);

    let username = await findAccount(event.userPoolId, email.toLowerCase());
    const created = username === undefined;
    if (username === undefined) {
      // Google confirmed the e-mail, so the account is born verified and without a password.
      const { User } = await client.send(
        new AdminCreateUserCommand({
          UserPoolId: event.userPoolId,
          Username: email.toLowerCase(),
          UserAttributes: [
            { Name: 'email', Value: email.toLowerCase() },
            { Name: 'email_verified', Value: 'true' },
          ],
          MessageAction: 'SUPPRESS',
        }),
      );
      username = User?.Username;
      if (username === undefined) throw new Error('Cognito created a user without a username');
    }
    await client.send(
      new AdminLinkProviderForUserCommand({
        UserPoolId: event.userPoolId,
        DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: username },
        SourceUser: {
          ProviderName: providerName,
          ProviderAttributeName: 'Cognito_Subject',
          ProviderAttributeValue: providerUserId,
        },
      }),
    );
    logger.info('google_linked', { createdAccount: created });
    // Cognito cannot finish this sign-in as the linked account; the next attempt can.
    throw new Error(ACCOUNT_LINKED);
  }

  return async function handler(event: TriggerEvent): Promise<TriggerEvent> {
    if (event.triggerSource === 'PreSignUp_ExternalProvider') return linkGoogle(event);
    if (CODE_MESSAGES.has(event.triggerSource) && event.request.codeParameter !== undefined) {
      event.response.emailSubject = 'Seu código para entrar na Escola Grátis de Tecnologia';
      event.response.emailMessage = codeEmail(event.request.codeParameter);
    }
    return event;
  };
}

export const handler = createTriggers(
  new CognitoIdentityProviderClient({}),
  new Logger({ serviceName: 'auth-triggers' }),
);
