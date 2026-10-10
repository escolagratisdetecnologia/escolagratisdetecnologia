import { Entity } from 'electrodb';
import type { Database } from './client.ts';
import { isConditionalCheckFailure } from './errors.ts';
import type { ProfileRepository } from './profile-repository.ts';

/** PK USER#<sub> · SK PROFILE (spec §3.5). */
function profileEntity(db: Database) {
  return new Entity(
    {
      model: { entity: 'profile', version: '1', service: 'egt' },
      attributes: {
        sub: { type: 'string', required: true },
        birthYear: { type: 'number', required: true },
        termsVersion: { type: 'string', required: true },
        termsAcceptedAt: { type: 'string', required: true },
        createdAt: { type: 'string', required: true },
      },
      indexes: {
        byUser: {
          pk: { field: 'PK', composite: ['sub'], template: 'USER#${sub}', casing: 'none' },
          sk: { field: 'SK', composite: [], template: 'PROFILE', casing: 'none' },
        },
      },
    },
    { client: db.document, table: db.table },
  );
}

export function createDynamoProfileRepository(db: Database): ProfileRepository {
  const entity = profileEntity(db);
  return {
    async get(sub) {
      const { data } = await entity.get({ sub }).go({ consistent: true });
      if (data === null) return null;
      const { birthYear, termsVersion, termsAcceptedAt, createdAt } = data;
      return { birthYear, termsVersion, termsAcceptedAt, createdAt };
    },
    async create(sub, profile) {
      try {
        await entity.create({ sub, ...profile }).go();
        return 'created';
      } catch (error) {
        if (isConditionalCheckFailure(error)) return 'exists';
        throw error;
      }
    },
    async delete(sub) {
      await entity.delete({ sub }).go();
    },
  };
}
