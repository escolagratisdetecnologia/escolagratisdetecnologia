import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';

/** Gzipped bytes of every script the page loads (spec §4.6: 30 KB gzip per content page). */
export async function gzippedScriptBytes(page: Page, url: string): Promise<number> {
  const bodies: Promise<Buffer>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script')
      bodies.push(response.body().catch(() => Buffer.alloc(0)));
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  const all = await Promise.all(bodies);
  return all.reduce((total, body) => total + gzipSync(body).length, 0);
}
