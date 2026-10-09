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

  // Found by the first audit (2026-10-09) in both accounts; account ID replaced.
  const knownNoise = [
    ['iam:role', 'arn:aws:iam::123456789012:role/egt-dev-bootstrap-github-apply'],
    ['iam:role', 'arn:aws:iam::123456789012:role/egt-prod-bootstrap-github-plan'],
    [
      'iam:saml-provider',
      'arn:aws:iam::123456789012:saml-provider/AWSSSO_59cde2e7ce332d82_DO_NOT_DELETE',
    ],
    ['budgets:budget', 'arn:aws:budgets::123456789012:budget/null'],
    [
      'cloudfront:origin-access-control',
      'arn:aws:cloudfront::123456789012:origin-access-control/E2PMAIPHHM9XQL',
    ],
    [
      'cloudfront:response-headers-policy',
      'arn:aws:cloudfront::123456789012:response-headers-policy/b72c280c-d692-4b14-8df8-f4d60cc1ef73',
    ],
    ['kms:key', 'arn:aws:kms:us-east-1:123456789012:key/6a83f5b3-ae37-4c4d-97dc-cd71623440e3'],
    ['athena:datacatalog', 'arn:aws:athena:sa-east-1:123456789012:datacatalog/AwsDataCatalog'],
    ['athena:workgroup', 'arn:aws:athena:us-east-1:123456789012:workgroup/primary'],
    ['events:event-bus', 'arn:aws:events:sa-east-1:123456789012:event-bus/default'],
    ['xray:sampling-rule', 'arn:aws:xray:us-east-1:123456789012:sampling-rule/Default'],
    ['s3:storage-lens', 'arn:aws:s3:us-east-1:123456789012:storage-lens/default-account-dashboard'],
    ['elasticache:user', 'arn:aws:elasticache:sa-east-1:123456789012:user:default'],
    ['elasticache:user', 'arn:aws:elasticache:us-east-1:123456789012:user:default.iam-user'],
    [
      'elasticache:usergroup',
      'arn:aws:elasticache:sa-east-1:123456789012:usergroup:default.iam-user-group',
    ],
    ['memorydb:user', 'arn:aws:memorydb:sa-east-1:123456789012:user/default'],
    ['memorydb:acl', 'arn:aws:memorydb:us-east-1:123456789012:acl/open-access'],
    [
      'memorydb:parametergroup',
      'arn:aws:memorydb:sa-east-1:123456789012:parametergroup/default.memorydb-valkey7.search',
    ],
    [
      'memorydb:parametergroup',
      'arn:aws:memorydb:us-east-1:123456789012:parametergroup/default.memorydb-redis7.search.preview',
    ],
  ];

  it('ignores the AWS defaults and the resources whose tags Resource Explorer cannot see', () => {
    const input = JSON.stringify({
      Resources: knownNoise.map(([ResourceType, Arn]) => ({ Arn, ResourceType, Region: 'global' })),
    });

    const result = run(['dev'], input);

    expect(result.stdout).toBe('Nenhum recurso sem a tag Project em dev.\n');
    expect(result.status).toBe(0);
  });

  it('still reports roles, budgets and users created outside Terraform', () => {
    const input = JSON.stringify({
      Resources: [
        { Arn: 'arn:aws:iam::123456789012:role/criada-no-console', ResourceType: 'iam:role' },
        { Arn: 'arn:aws:budgets::123456789012:budget/teste', ResourceType: 'budgets:budget' },
        {
          Arn: 'arn:aws:memorydb:sa-east-1:123456789012:user/alguem',
          ResourceType: 'memorydb:user',
        },
      ],
    });

    const result = run(['prod'], input);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('role/criada-no-console');
    expect(result.stdout).toContain('budget/teste');
    expect(result.stdout).toContain('user/alguem');
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
