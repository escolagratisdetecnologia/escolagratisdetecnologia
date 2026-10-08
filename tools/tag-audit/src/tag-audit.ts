export interface ExplorerResource {
  Arn: string;
  ResourceType: string;
  Region?: string;
  OwningAccountId?: string;
}

export interface SearchOutput {
  Resources?: ExplorerResource[];
}

export interface IgnoreRules {
  resourceTypes: readonly string[];
  arnPatterns: readonly string[];
}

export function findUntaggedResources(
  output: SearchOutput,
  ignore: IgnoreRules,
): ExplorerResource[] {
  const patterns = ignore.arnPatterns.map((pattern) => new RegExp(pattern));
  return (output.Resources ?? []).filter(
    (resource) =>
      !ignore.resourceTypes.includes(resource.ResourceType) &&
      !patterns.some((pattern) => pattern.test(resource.Arn)),
  );
}

export function formatReport(environment: string, resources: ExplorerResource[]): string {
  if (resources.length === 0) return `Nenhum recurso sem a tag Project em ${environment}.`;
  return [
    `## Recursos sem a tag \`Project\` em ${environment}`,
    '',
    'Todo recurso do projeto precisa da tag `Project=escola-gratis-de-tecnologia` (ADR 0015).',
    'Corrija no Terraform ou, se for um recurso padrão da AWS que não criamos, adicione-o em `tools/tag-audit/ignore.json`.',
    '',
    '| Tipo | Região | ARN |',
    '|---|---|---|',
    ...resources.map((r) => `| ${r.ResourceType} | ${r.Region ?? '-'} | \`${r.Arn}\` |`),
  ].join('\n');
}
