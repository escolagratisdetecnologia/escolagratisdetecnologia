# 0015. Padrão obrigatório de tags

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D15

## Contexto

O mantenedor precisa enxergar o custo, remover 100% do projeto por uma única tag e separar dev de prod.

## Decisão

As tags obrigatórias são `Project` (tag única do projeto), `Environment`, `Component`, `ManagedBy`, `Repository` e `DataClassification` em dados (tabela em `infra/CLAUDE.md`). A garantia é em camadas: `default_tags` + `Component` por módulo; `tools/check-tags` no plano do PR; tflint; tag policy nas contas-membro; cost allocation tags; auditoria semanal com Resource Explorer (`tools/tag-audit`); runbook de remoção total.

Os recursos da conta de gerenciamento são nomeados `egt-shared-bootstrap-<nome>`. A auditoria semanal abre uma issue só quando encontra recursos sem tag (saída 1), falha de forma visível em caso de erro e fecha a issue quando tudo está limpo.

## Alternativas consideradas

- Tags só por convenção: sem garantia.

## Consequências

- Positivas:
  - Custo e inventário por projeto, ambiente e componente, e remoção total guiada.
- Negativas:
  - Manutenção da lista de ignorados da auditoria e das listas de componentes.

## Pilares Well-Architected

Custo e excelência operacional.

## Revisar quando

Entrar um componente novo (atualizar `rules.ts`, `infra/CLAUDE.md` e esta ADR).
