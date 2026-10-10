import { api } from './api.ts';

/** Ways out of a sign-up that was started but not finished (spec §5.5). */
export type SignUpExit = 'sign-out' | 'cancel';

const REQUESTS: Record<SignUpExit, { path: string; method: 'POST' | 'DELETE'; notice: string }> = {
  'sign-out': { path: '/api/auth/logout', method: 'POST', notice: 'saiu-cadastro' },
  cancel: { path: '/api/me', method: 'DELETE', notice: 'cadastro-cancelado' },
};

/**
 * Signs out or cancels (deletes the account of) an unfinished sign-up. This device's progress is
 * never touched: it never reached the account. Goes to the Eu tab with a notice, or returns the
 * error message and changes nothing.
 */
export async function leaveSignUp(exit: SignUpExit): Promise<string | null> {
  const { path, method, notice } = REQUESTS[exit];
  const res = await api(path, { method });
  if (!res.ok) return res.error.message;
  location.assign(`/eu/?conta=${notice}`);
  return null;
}
