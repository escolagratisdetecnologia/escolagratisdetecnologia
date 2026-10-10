import { syncAfterSignIn } from './progress-sync.ts';

const HOME = '/eu/';
/** Same rule as the API: only paths of this site, never another host or a query. */
const SITE_PATH = /^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/;

/** Where to go after signing in: the `next` of the URL when it is a path of this site. */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get('next');
  return next !== null && next.length <= 200 && SITE_PATH.test(next) ? next : HOME;
}

export const signUpUrl = (next: string) => `/entrar/cadastro/?next=${encodeURIComponent(next)}`;

/**
 * After the code or Google: sign-up first when it is missing; then this device's progress goes
 * to the account (failures stay pending for the next page) and the learner moves on.
 */
export async function finishSignIn(profileComplete: boolean, next: string): Promise<void> {
  if (!profileComplete) {
    location.assign(signUpUrl(next));
    return;
  }
  await syncAfterSignIn();
  location.assign(next);
}
