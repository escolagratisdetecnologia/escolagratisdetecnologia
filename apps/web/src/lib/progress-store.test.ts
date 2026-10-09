// @vitest-environment happy-dom
import { completeLesson, emptyProgress } from '@egt/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROGRESS_KEY, clearProgress, readProgress, writeProgress } from './progress-store.ts';

describe('progress store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips progress through localStorage', () => {
    const progress = completeLesson(
      emptyProgress(),
      'curso',
      'aula',
      new Date('2026-10-09T12:00:00Z'),
    );
    writeProgress(progress);
    expect(readProgress()).toEqual(progress);
    expect(localStorage.getItem(PROGRESS_KEY)).toContain('"aula"');
  });

  it('starts empty when the stored value is garbage', () => {
    localStorage.setItem(PROGRESS_KEY, 'não é JSON');
    expect(readProgress()).toEqual(emptyProgress());
  });

  it('keeps working when storage refuses to save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeProgress(emptyProgress())).not.toThrow();
  });

  it('clears the saved progress', () => {
    writeProgress(completeLesson(emptyProgress(), 'curso', 'aula', new Date()));
    clearProgress();
    expect(readProgress()).toEqual(emptyProgress());
  });
});
