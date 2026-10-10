import { describe, expect, it } from 'vitest';
import { latestBirthYear } from '../src/index.ts';

describe('latestBirthYear', () => {
  it('keeps out everyone who may still be under 12', () => {
    expect(latestBirthYear(new Date('2026-10-10T12:00:00Z'))).toBe(2013);
    expect(latestBirthYear(new Date('2027-01-01T00:00:00Z'))).toBe(2014);
  });
});
