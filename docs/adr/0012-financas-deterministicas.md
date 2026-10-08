# 0012. Números financeiros por scripts determinísticos

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D12

## Contexto

A transparência financeira precisa ser auditável por qualquer pessoa.

## Decisão

Os valores vêm de scripts determinísticos (Stripe, Cost Explorer, API de custos da Anthropic, assinaturas, PTAX do Banco Central) e são gravados em JSON versionado. A IA só redige o resumo em linguagem simples.

## Alternativas consideradas

- Relatório gerado por IA via MCP: não reprodutível.

## Consequências

- Positivas:
  - Reprodutível e revisável em PR.
- Negativas:
  - Manutenção dos scripts quando as APIs mudarem.

## Pilares Well-Architected

Excelência operacional.

## Revisar quando

Surgir nova fonte de receita ou custo.
