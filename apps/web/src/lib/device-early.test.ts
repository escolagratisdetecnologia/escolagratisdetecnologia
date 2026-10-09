import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform.ts';

const source = readFileSync(new URL('../scripts/device-early.js', import.meta.url), 'utf8');

const USER_AGENTS: [string, number][] = [
  [
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36',
    0,
  ],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 5],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    5,
  ],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    0,
  ],
  ['Mozilla/5.0 (X11; CrOS x86_64 15917.0.0) AppleWebKit/537.36 Chrome/130 Safari/537.36', 0],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', 0],
  ['Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0', 0],
];
const ALL = 'android ios chromeos windows mac';

/** Runs the classic script against a fake page and returns what it wrote to data-device. */
function run(available: string | undefined, userAgent: string, maxTouchPoints: number) {
  const dataset: Record<string, string> = {};
  const document = {
    querySelector: (selector: string) =>
      selector === 'meta[name="egt-variants"]' && available !== undefined
        ? { content: available }
        : null,
    documentElement: { dataset },
  };
  new Function('document', 'navigator', source)(document, { userAgent, maxTouchPoints });
  return dataset.device;
}

describe('device-early.js', () => {
  it('is a plain classic script', () => {
    expect(source).not.toMatch(/^\s*(import|export)\s/m);
  });

  it.each(USER_AGENTS)('matches detectPlatform for %s (touch %i)', (userAgent, touch) => {
    // Every platform is available here, so the only fallback is the first one (android).
    expect(run(ALL, userAgent, touch)).toBe(detectPlatform(userAgent, touch) ?? 'android');
  });

  it('falls back to the first available platform when the detected one is missing', () => {
    const windows = USER_AGENTS[5]![0];
    expect(run('android ios', windows, 0)).toBe('android');
    expect(run('ios mac', USER_AGENTS[6]![0], 0)).toBe('ios');
  });

  it('does nothing without the meta tag', () => {
    expect(run(undefined, USER_AGENTS[0]![0], 0)).toBeUndefined();
  });
});
