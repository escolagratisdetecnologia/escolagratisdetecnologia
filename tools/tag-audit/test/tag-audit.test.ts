import { describe, expect, it } from 'vitest';
import { findUntaggedResources, formatReport, type IgnoreRules } from '../src/tag-audit.ts';

const ignore: IgnoreRules = {
  resourceTypes: ['ec2:vpc'],
  arnPatterns: [':role/aws-service-role/'],
};

describe('findUntaggedResources', () => {
  it('keeps resources that are not ignored', () => {
    const bucket = {
      Arn: 'arn:aws:s3:::egt-dev-site-123',
      ResourceType: 's3:bucket',
      Region: 'sa-east-1',
    };

    expect(findUntaggedResources({ Resources: [bucket] }, ignore)).toEqual([bucket]);
  });

  it('drops ignored resource types and ARN patterns', () => {
    const output = {
      Resources: [
        {
          Arn: 'arn:aws:ec2:sa-east-1:123:vpc/vpc-1',
          ResourceType: 'ec2:vpc',
          Region: 'sa-east-1',
        },
        {
          Arn: 'arn:aws:iam::123:role/aws-service-role/ops.apigateway.amazonaws.com/AWSServiceRoleForAPIGateway',
          ResourceType: 'iam:role',
          Region: 'global',
        },
      ],
    };

    expect(findUntaggedResources(output, ignore)).toEqual([]);
  });

  it('handles an empty search result', () => {
    expect(findUntaggedResources({}, ignore)).toEqual([]);
  });
});

describe('formatReport', () => {
  it('says everything is fine when nothing was found', () => {
    expect(formatReport('dev', [])).toBe('Nenhum recurso sem a tag Project em dev.');
  });

  it('renders a Markdown table with type, region and ARN', () => {
    const report = formatReport('prod', [
      { Arn: 'arn:aws:s3:::x', ResourceType: 's3:bucket', Region: 'sa-east-1' },
    ]);

    expect(report).toContain('## Recursos sem a tag `Project` em prod');
    expect(report).toContain('| s3:bucket | sa-east-1 | `arn:aws:s3:::x` |');
    expect(report).toContain('tools/tag-audit/ignore.json');
  });
});
