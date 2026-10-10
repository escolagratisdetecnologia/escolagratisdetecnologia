/** Spec §5.5: children under 12 cannot have an account (LGPD art. 14). */
export const MIN_AGE = 12;

/** Version of the terms of use and privacy policy the sign-up accepts (dates of the texts). */
export const TERMS_VERSION = '2026-10-10';

/**
 * Last birth year that may sign up. Only the year is known, so someone born in
 * `currentYear - 12` may still be 11: the rule keeps them out until the next year.
 */
export function latestBirthYear(now: Date): number {
  return now.getUTCFullYear() - MIN_AGE - 1;
}
