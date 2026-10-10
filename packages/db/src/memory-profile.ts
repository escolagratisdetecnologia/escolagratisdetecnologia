import type { Profile, ProfileRepository } from './profile-repository.ts';

/**
 * In-memory profiles: for tests and for `pnpm dev` without Docker (lost on restart). `initial`
 * seeds learners who already finished sign-up.
 */
export function createMemoryProfileRepository(
  initial: Record<string, Profile> = {},
): ProfileRepository {
  const profiles = new Map<string, Profile>(Object.entries(structuredClone(initial)));
  return {
    async get(sub) {
      const profile = profiles.get(sub);
      return profile === undefined ? null : structuredClone(profile);
    },
    async create(sub, profile) {
      if (profiles.has(sub)) return 'exists';
      profiles.set(sub, structuredClone(profile));
      return 'created';
    },
    async delete(sub) {
      profiles.delete(sub);
    },
  };
}
