import { emptyProgress, parseProgress, type Progress } from '@egt/core';

export const PROGRESS_KEY = 'egt:progress:v1';

/** localStorage can be missing or throw (private mode, blocked site data); progress is then not kept. */
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readProgress(): Progress {
  try {
    const raw = storage()?.getItem(PROGRESS_KEY);
    return raw ? parseProgress(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function writeProgress(progress: Progress): void {
  try {
    storage()?.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or blocked: the learner keeps going, progress just is not saved.
  }
}

export function clearProgress(): void {
  try {
    storage()?.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing stored to clear.
  }
}
