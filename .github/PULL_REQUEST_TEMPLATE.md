## O que muda

<!-- 1 a 3 frases. -->

## Como testar

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm test:e2e` (se mexeu no site)
- [ ] `terraform validate` + `tflint` (se mexeu em `infra/`)

## Delta de custo

<!-- Obrigatório se tocar em infra/: resuma o comentário do Infracost ou escreva "sem impacto". -->

## Pilares Well-Architected afetados

- [ ] Excelência operacional
- [ ] Segurança
- [ ] Confiabilidade
- [ ] Eficiência de performance
- [ ] Otimização de custos
- [ ] Sustentabilidade

## ADR

<!-- Link para a ADR nova ou atualizada, ou "não se aplica". -->

## Checklist

- [ ] Recursos AWS novos com as tags padrão (Project, Environment, Component, ManagedBy, Repository)
- [ ] Nenhum segredo, e-mail pessoal ou ID de conta no código
- [ ] Docs e CLAUDE.md atualizados se algum padrão mudou
