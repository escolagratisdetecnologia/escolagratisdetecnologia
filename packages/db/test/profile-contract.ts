import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Profile, ProfileRepository } from '../src/index.ts';

const profile: Profile = {
  birthYear: 2008,
  termsVersion: '2026-10-10',
  termsAcceptedAt: '2026-10-10T12:00:00.000Z',
  createdAt: '2026-10-10T12:00:00.000Z',
};

/** Behavior every ProfileRepository must have (memory and DynamoDB run the same tests). */
export function describeProfileRepository(name: string, create: () => ProfileRepository): void {
  describe(`${name}: ProfileRepository`, () => {
    const learner = () => `learner-${randomUUID()}`;

    it('has no profile before the learner creates one', async () => {
      expect(await create().get(learner())).toBeNull();
    });

    it('creates the profile once and never overwrites it', async () => {
      const repository = create();
      const sub = learner();

      expect(await repository.create(sub, profile)).toBe('created');
      expect(await repository.create(sub, { ...profile, birthYear: 2000 })).toBe('exists');
      expect(await repository.get(sub)).toEqual(profile);
    });

    it('deletes one learner only, even when there is nothing to delete', async () => {
      const repository = create();
      const ana = learner();
      const bia = learner();
      await repository.create(ana, profile);
      await repository.create(bia, profile);

      await repository.delete(ana);
      await repository.delete(learner());

      expect(await repository.get(ana)).toBeNull();
      expect(await repository.get(bia)).toEqual(profile);
    });
  });
}
