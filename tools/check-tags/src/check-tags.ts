import { REQUIRED_TAGS, type TagRules } from './rules.ts';

export interface ResourceChange {
  address: string;
  mode: 'managed' | 'data';
  change: {
    actions: string[];
    after: Record<string, unknown> | null;
    after_unknown?: Record<string, unknown>;
  };
}

export interface TerraformPlan {
  resource_changes?: ResourceChange[];
}

export interface TagViolation {
  address: string;
  missing: string[];
  invalid: { key: string; value: string }[];
  unknown: boolean;
}

export function findTagViolations(
  plan: TerraformPlan,
  rules: TagRules = REQUIRED_TAGS,
): TagViolation[] {
  const violations: TagViolation[] = [];

  for (const rc of plan.resource_changes ?? []) {
    const { after, actions, after_unknown } = rc.change;
    if (rc.mode !== 'managed' || after === null || isDeleteOnly(actions)) continue;

    if (after_unknown?.['tags_all'] === true) {
      violations.push({ address: rc.address, missing: [], invalid: [], unknown: true });
      continue;
    }
    if (!('tags_all' in after)) continue;

    const tags = (after['tags_all'] ?? {}) as Record<string, string>;
    const missing = Object.keys(rules).filter((key) => !(key in tags));
    const invalid = Object.entries(rules)
      .filter(([key, allowed]) => key in tags && !allowed.includes(tags[key] ?? ''))
      .map(([key]) => ({ key, value: tags[key] ?? '' }));

    if (missing.length > 0 || invalid.length > 0) {
      violations.push({ address: rc.address, missing, invalid, unknown: false });
    }
  }

  return violations;
}

export function formatViolations(violations: TagViolation[]): string {
  const lines = violations.map((violation) => {
    if (violation.unknown) {
      return `- ${violation.address}: tags_all só será conhecido no apply (use valores estáticos nas tags)`;
    }
    const problems = [
      ...violation.missing.map((key) => `faltando ${key}`),
      ...violation.invalid.map(({ key, value }) => `${key}="${value}" não permitido`),
    ];
    return `- ${violation.address}: ${problems.join('; ')}`;
  });
  return ['Recursos fora do padrão de tags (veja infra/CLAUDE.md, seção Tags):', ...lines].join(
    '\n',
  );
}

function isDeleteOnly(actions: string[]): boolean {
  return actions.length === 1 && actions[0] === 'delete';
}
