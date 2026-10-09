import type { Platform } from '@egt/content';

/** Best guess of the learner's device, to open the right steps of module 0 (they can switch). */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform | undefined {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS identifies as a Mac; touch support tells them apart.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/CrOS/i.test(userAgent)) return 'chromeos';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  return undefined;
}
