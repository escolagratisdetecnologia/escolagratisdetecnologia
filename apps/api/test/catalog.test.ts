import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProgressCatalog } from '../src/catalog.ts';

const FIXTURE = fileURLToPath(
  new URL('../../../packages/content/test/fixtures/valid', import.meta.url),
);

describe('loadProgressCatalog', () => {
  it('lists the lessons of each course with their number of quiz questions', async () => {
    expect(await loadProgressCatalog(FIXTURE)).toEqual({
      'curso-teste': { 'boas-vindas': 1, 'no-seu-aparelho': 1, 'primeiro-passo': 1 },
    });
  });

  it('refuses content with problems', async () => {
    const broken = mkdtempSync(join(tmpdir(), 'egt-content-'));
    cpSync(FIXTURE, broken, { recursive: true });
    writeFileSync(join(broken, 'courses/curso-teste/course.yaml'), 'title: 1\n');

    await expect(loadProgressCatalog(broken)).rejects.toThrow(/content:check/);
  });
});
