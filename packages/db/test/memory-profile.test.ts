import { describe, expect, it } from 'vitest';
import { createMemoryProfileRepository } from '../src/index.ts';
import { describeProfileRepository } from './profile-contract.ts';

describeProfileRepository('memory', () => createMemoryProfileRepository());

describe('createMemoryProfileRepository', () => {
  it('starts with the seeded learners', async () => {
    const profile = {
      birthYear: 2008,
      termsVersion: '2026-10-10',
      termsAcceptedAt: '2026-10-10T12:00:00.000Z',
      createdAt: '2026-10-10T12:00:00.000Z',
    };
    const repository = createMemoryProfileRepository({ ana: profile });

    expect(await repository.get('ana')).toEqual(profile);
    expect(await repository.create('ana', profile)).toBe('exists');
  });
});
