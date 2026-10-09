import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COURSE, VALID, copyFixture, edit } from './helpers.ts';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

describe('content:check CLI', () => {
  it('exits 0 and summarizes valid content', () => {
    const result = run([VALID]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('Conteúdo OK: 1 curso, 3 aulas.\n');
  });

  it('exits 1 and lists every problem', async () => {
    const dir = await copyFixture();
    await edit(dir, `${COURSE}/projeto.md`, (s) => s.replace('weight: 40', 'weight: 30'));

    const result = run([dir]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Encontrei 1 problema no conteúdo:');
    expect(result.stdout).toContain('projeto.md: os pesos da rubrica somam 90; precisam somar 100');
  });

  it('exits 2 without the content folder', () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Uso: node packages/content/src/cli.ts <pasta-do-conteúdo>');
  });

  it('exits 2 when the folder has no courses/', () => {
    const result = run([fileURLToPath(new URL('./', import.meta.url))]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Não consegui ler o conteúdo em');
  });
});
