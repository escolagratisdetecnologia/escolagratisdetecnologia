import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform.ts';

describe('detectPlatform', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36',
      0,
      'android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      5,
      'ios',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      5,
      'ios',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      0,
      'mac',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 15917.0.0) AppleWebKit/537.36 Chrome/130 Safari/537.36',
      0,
      'chromeos',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
      0,
      'windows',
    ],
  ])('%s → %s', (userAgent, touchPoints, expected) => {
    expect(detectPlatform(userAgent, touchPoints)).toBe(expected);
  });

  it('returns undefined for other systems', () => {
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0')).toBeUndefined();
  });
});
