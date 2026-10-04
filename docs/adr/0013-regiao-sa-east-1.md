# 0013. Região sa-east-1

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D13

## Contexto

O público está só no Brasil; importam a latência da API e os dados pessoais.

## Decisão

Usamos `sa-east-1` para tudo que a AWS permite. A `us-east-1` hospeda apenas o ACM e o WAF do CloudFront, o Cost Explorer e o índice local do Resource Explorer (inventário usado na auditoria de tags, ADR 0015).

## Alternativas consideradas

- `us-east-1`: mais barata, mas com cerca de 120 ms a mais por requisição.

## Consequências

- Positivas:
  - Latência baixa e dados no Brasil.
- Negativas:
  - Preços 30–50% maiores em alguns serviços (impacto pequeno em serverless de baixo volume).
  - Recursos em duas regiões exigem atenção em tags, inventário e remoção total.

## Pilares Well-Architected

Performance e custo.

## Revisar quando

Algum serviço necessário não existir em `sa-east-1`.
