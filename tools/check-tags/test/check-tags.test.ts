import { describe, expect, it } from 'vitest';
import { findTagViolations, formatViolations, type ResourceChange } from '../src/check-tags.ts';

const VALID = {
  Project: 'escola-gratis-de-tecnologia',
  Environment: 'dev',
  Component: 'site',
  ManagedBy: 'terraform',
  Repository: 'github.com/escolagratisdetecnologia/escolagratisdetecnologia',
};

function change(
  address: string,
  after: Record<string, unknown> | null,
  overrides: Partial<ResourceChange['change']> = {},
  mode: ResourceChange['mode'] = 'managed',
): ResourceChange {
  return { address, mode, change: { actions: ['create'], after, after_unknown: {}, ...overrides } };
}

describe('findTagViolations', () => {
  it('accepts resources carrying every required tag with allowed values', () => {
    const plan = { resource_changes: [change('aws_s3_bucket.site', { tags_all: VALID })] };

    expect(findTagViolations(plan)).toEqual([]);
  });

  it('reports missing required tags', () => {
    const { Component: _omitted, ...withoutComponent } = VALID;
    const plan = {
      resource_changes: [change('module.site.aws_s3_bucket.site', { tags_all: withoutComponent })],
    };

    expect(findTagViolations(plan)).toEqual([
      {
        address: 'module.site.aws_s3_bucket.site',
        missing: ['Component'],
        invalid: [],
        unknown: false,
      },
    ]);
  });

  it('reports values outside the allowed list', () => {
    const plan = {
      resource_changes: [
        change('aws_s3_bucket.site', { tags_all: { ...VALID, Environment: 'staging' } }),
      ],
    };

    expect(findTagViolations(plan)).toEqual([
      {
        address: 'aws_s3_bucket.site',
        missing: [],
        invalid: [{ key: 'Environment', value: 'staging' }],
        unknown: false,
      },
    ]);
  });

  it('treats a null tags_all as every tag missing', () => {
    const plan = { resource_changes: [change('aws_iam_role.github', { tags_all: null })] };

    expect(findTagViolations(plan)).toEqual([
      {
        address: 'aws_iam_role.github',
        missing: ['Project', 'Environment', 'Component', 'ManagedBy', 'Repository'],
        invalid: [],
        unknown: false,
      },
    ]);
  });

  it('skips resources that do not support tags', () => {
    const plan = { resource_changes: [change('aws_s3_bucket_policy.site', { policy: '{}' })] };

    expect(findTagViolations(plan)).toEqual([]);
  });

  it('skips data sources and pure deletions', () => {
    const plan = {
      resource_changes: [
        change('data.aws_caller_identity.current', { tags_all: {} }, {}, 'data'),
        change('aws_s3_bucket.old', null, { actions: ['delete'] }),
      ],
    };

    expect(findTagViolations(plan)).toEqual([]);
  });

  it('flags tags that stay unknown until apply', () => {
    const plan = {
      resource_changes: [change('aws_s3_bucket.site', {}, { after_unknown: { tags_all: true } })],
    };

    expect(findTagViolations(plan)).toEqual([
      { address: 'aws_s3_bucket.site', missing: [], invalid: [], unknown: true },
    ]);
  });

  it('handles plans without resource changes', () => {
    expect(findTagViolations({})).toEqual([]);
  });
});

describe('formatViolations', () => {
  it('lists every resource with its problems in pt-BR', () => {
    const text = formatViolations([
      {
        address: 'aws_s3_bucket.site',
        missing: ['Component'],
        invalid: [{ key: 'Environment', value: 'staging' }],
        unknown: false,
      },
      { address: 'aws_iam_role.github', missing: [], invalid: [], unknown: true },
    ]);

    expect(text).toBe(
      [
        'Recursos fora do padrão de tags (veja infra/CLAUDE.md, seção Tags):',
        '- aws_s3_bucket.site: faltando Component; Environment="staging" não permitido',
        '- aws_iam_role.github: tags_all só será conhecido no apply (use valores estáticos nas tags)',
      ].join('\n'),
    );
  });
});
