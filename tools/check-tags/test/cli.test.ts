import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

describe('check-tags CLI', () => {
  it('exits 0 when every resource is compliant', () => {
    const result = run(fixture('plan-ok.json'));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Tags OK');
  });

  it('exits 1 and explains the violations', () => {
    const result = run(fixture('plan-bad.json'));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '- module.edge.aws_cloudfront_distribution.this: faltando Component',
    );
  });

  it('exits 2 when the plan path is missing', () => {
    const result = run();

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Uso: node tools/check-tags/src/cli.ts <plano.json>');
  });
});
