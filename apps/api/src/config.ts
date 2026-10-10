import type { CognitoSettings } from './identity/cognito.ts';
import type { LocalIdentitySettings } from './identity/local.ts';

export type Environment = 'local' | 'dev' | 'prod';

export interface AppConfig {
  environment: Environment;
  version: string;
  /** DynamoDB table: egt-<env>-data-main. */
  tableName: string;
  /** DynamoDB Local URL; only when running locally. */
  dynamodbEndpoint?: string;
  /** The site's origin: the only one allowed to send changes (CSRF, spec §3.6). */
  siteOrigin: string;
  /** Value CloudFront sends in x-origin-verify (ADR 0022); absent locally. */
  originVerifySecret?: string;
  /** Learner user pool (ADR 0024); absent locally. */
  cognito?: CognitoSettings;
  /** Mailpit and the fake Google (docker compose); only locally. */
  local?: LocalIdentitySettings;
}

const ENVIRONMENTS: readonly string[] = ['local', 'dev', 'prod'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = env.APP_ENV ?? 'local';
  if (!isEnvironment(environment)) {
    throw new Error(`Invalid APP_ENV "${environment}". Expected local, dev or prod.`);
  }
  if (environment === 'local') {
    return {
      environment,
      version: env.APP_VERSION ?? '0.0.0-local',
      tableName: env.TABLE_NAME ?? 'egt-local-data-main',
      dynamodbEndpoint: env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
      siteOrigin: env.SITE_ORIGIN ?? 'http://localhost:4321',
      local: {
        mailpitUrl: env.MAILPIT_URL ?? 'http://localhost:8025',
        googleIssuer: env.FAKE_GOOGLE_ISSUER ?? 'http://localhost:8080/google',
      },
    };
  }
  return {
    environment,
    version: required(env, 'APP_VERSION'),
    tableName: required(env, 'TABLE_NAME'),
    siteOrigin: required(env, 'SITE_ORIGIN'),
    originVerifySecret: required(env, 'ORIGIN_VERIFY_SECRET'),
    cognito: {
      userPoolId: required(env, 'USER_POOL_ID'),
      clientId: required(env, 'USER_POOL_CLIENT_ID'),
      clientSecret: required(env, 'USER_POOL_CLIENT_SECRET'),
      domain: required(env, 'AUTH_DOMAIN'),
    },
  };
}

function isEnvironment(value: string): value is Environment {
  return ENVIRONMENTS.includes(value);
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name} (required when APP_ENV is ${env.APP_ENV}).`);
  return value;
}
