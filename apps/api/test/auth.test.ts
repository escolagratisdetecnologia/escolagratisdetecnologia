import { describe, expect, it } from 'vitest';
import { createDevAuthenticator, noAuthentication } from '../src/auth.ts';
import { config } from './helpers.ts';

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/progress', { headers });

describe('createDevAuthenticator', () => {
  const authenticate = createDevAuthenticator(config);

  it('uses x-dev-user as the learner', async () => {
    expect(await authenticate(request({ 'x-dev-user': 'ana-1' }))).toEqual({ sub: 'ana-1' });
  });

  it('ignores missing or odd values', async () => {
    expect(await authenticate(request())).toBeNull();
    expect(await authenticate(request({ 'x-dev-user': 'Ana Maria' }))).toBeNull();
  });

  it('only exists locally', () => {
    expect(() => createDevAuthenticator({ ...config, environment: 'dev' })).toThrow(
      'The dev authenticator only runs locally.',
    );
  });
});

describe('noAuthentication', () => {
  it('never finds a learner (AWS until Phase 1C)', async () => {
    expect(await noAuthentication(request({ 'x-dev-user': 'ana' }))).toBeNull();
  });
});
