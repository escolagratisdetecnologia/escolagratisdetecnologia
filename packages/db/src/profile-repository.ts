/** What the learner tells us when the account is created (spec §3.5 and §5.5). */
export interface Profile {
  /** Only the year: enough to keep children under 12 out, without the full birth date. */
  birthYear: number;
  /** Version of the terms of use and privacy policy the learner accepted. */
  termsVersion: string;
  termsAcceptedAt: string;
  createdAt: string;
}

/** The learner profile (PK USER#<sub> · SK PROFILE). */
export interface ProfileRepository {
  get(sub: string): Promise<Profile | null>;
  /** Creates the profile once; answers 'exists' (and changes nothing) when there is one. */
  create(sub: string, profile: Profile): Promise<'created' | 'exists'>;
  delete(sub: string): Promise<void>;
}
