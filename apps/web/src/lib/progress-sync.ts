import { parseProgress, type Progress } from '@egt/core';
import { api } from './api.ts';
import { clearProgress, readProgress, writeProgress } from './progress-store.ts';
import { hasSession } from './session.ts';

/** Courses changed on this device and not yet in the account. */
export const PENDING_KEY = 'egt:progress:pending:v1';
/** When this device last brought in progress from the account (other devices). */
export const PULLED_KEY = 'egt:progress:pulled:v1';
const PULL_EVERY_MS = 5 * 60_000;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readPending(): string[] {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writePending(courses: string[]): void {
  try {
    storage()?.setItem(PENDING_KEY, JSON.stringify([...new Set(courses)]));
  } catch {
    // Storage blocked: the course syncs with the next change.
  }
}

/** The account's progress, except courses this device still has to send (their local copy is newer). */
function adopt(account: Progress): void {
  const pending = new Set(readPending());
  const local = readProgress();
  const courses = { ...parseProgress(account).courses };
  for (const course of pending) {
    const mine = local.courses[course];
    if (mine) courses[course] = mine;
  }
  writeProgress({ version: 1, courses });
}

function forget(course: string): void {
  writePending(readPending().filter((item) => item !== course));
}

/**
 * Errors that mean this course's data will never be accepted, however many times it is sent.
 * Decided by the error code, not the status: a 400 `invalid_origin` is a deployment problem and
 * must not cost the learner their progress.
 */
const REFUSED_FOR_GOOD = new Set(['invalid_request', 'payload_too_large']);

/**
 * Sends the pending courses to the account, one course per request (small bodies, far below the
 * 8 KB limit). A course refused for good is dropped and the next one goes on; any other failure
 * stops here and keeps the rest for the next page.
 */
export async function syncPending(options: { keepalive?: boolean } = {}): Promise<boolean> {
  if (!hasSession()) return false;
  for (const course of readPending()) {
    const progress = readProgress().courses[course];
    if (progress === undefined) {
      forget(course);
      continue;
    }
    const res = await api<Progress>('/api/progress/merge', {
      method: 'POST',
      body: { version: 1, courses: { [course]: progress } },
      keepalive: options.keepalive ?? false,
    });
    if (!res.ok) {
      // Retrying a refused course would fail forever and block every course after it.
      if (!REFUSED_FOR_GOOD.has(res.error.code)) return false;
      forget(course);
      continue;
    }
    // The learner may have saved this course again while the request was in flight. Then the
    // account only has the older state: keep it pending (`adopt` keeps the local copy) so the
    // newer change is sent next. Both sides come from `readProgress`, so key order is stable.
    if (JSON.stringify(readProgress().courses[course]) === JSON.stringify(progress)) forget(course);
    adopt(res.data);
  }
  return true;
}

/** Saves on this device and, with a session, in the account too. */
export function saveProgress(progress: Progress, course: string): void {
  writeProgress(progress);
  writePending([...readPending(), course]);
  if (hasSession()) void syncPending({ keepalive: true });
}

/** Brings in what other devices saved, at most every few minutes unless `force`. */
export async function pullProgress(
  options: { force?: boolean; now?: number } = {},
): Promise<boolean> {
  if (!hasSession()) return false;
  const now = options.now ?? Date.now();
  const last = Number(storage()?.getItem(PULLED_KEY) ?? 0);
  if (!options.force && now - last < PULL_EVERY_MS) return true;
  const res = await api<Progress>('/api/progress');
  if (!res.ok) return false;
  adopt(res.data);
  try {
    storage()?.setItem(PULLED_KEY, String(now));
  } catch {
    // Pulls again on the next page.
  }
  return true;
}

/** Right after signing in: everything on this device goes to the account, then comes back merged. */
export async function syncAfterSignIn(): Promise<boolean> {
  writePending([...readPending(), ...Object.keys(readProgress().courses)]);
  return (await syncPending()) && (await pullProgress({ force: true }));
}

/** Signing out (or deleting the account) leaves nothing of the learner on this device. */
export function forgetProgress(): void {
  clearProgress();
  try {
    storage()?.removeItem(PENDING_KEY);
    storage()?.removeItem(PULLED_KEY);
  } catch {
    // Nothing stored.
  }
}
