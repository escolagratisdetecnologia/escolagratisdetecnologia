import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

function run(args: string[], input: string) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input });
}

describe('tag-audit CLI', () => {
  it('exits 0 when the search finds only ignored resources', () => {
    const input = JSON.stringify({
      Resources: [{ Arn: 'arn:aws:ec2:sa-east-1:1:vpc/vpc-1', ResourceType: 'ec2:vpc' }],
    });

    const result = run(['dev'], input);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Nenhum recurso sem a tag Project em dev.');
  });

  it('exits 1 and prints the report when untagged resources exist', () => {
    const input = JSON.stringify({
      Resources: [{ Arn: 'arn:aws:s3:::solto', ResourceType: 's3:bucket', Region: 'sa-east-1' }],
    });

    const result = run(['prod'], input);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('| s3:bucket | sa-east-1 | `arn:aws:s3:::solto` |');
  });

  it('exits 2 without the environment argument', () => {
    const result = run([], '{}');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Uso: node tools/tag-audit/src/cli.ts <ambiente>');
  });

  it('exits 2 when stdin is not valid JSON', () => {
    const result = run(['dev'], '{ not json');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Não consegui ler o resultado da busca:');
  });
});
