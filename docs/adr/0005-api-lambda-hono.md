# 0005. API única em Lambda com Hono e Node 24

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D5

## Contexto

Há poucas rotas no início, o cold start afeta a experiência e a API precisa rodar igual na máquina local.

## Decisão

Um Lambda `api` (Hono, Node 24, arm64) fica atrás de um API Gateway HTTP API. As tarefas assíncronas rodam em Lambdas separados. O mesmo app roda como servidor Node local.

## Alternativas consideradas

- Um Lambda por rota: mais cold starts.
- Function URL com OAC: exige o hash do corpo nos POSTs.

## Consequências

- Positivas:
  - Menos cold starts, deploy simples e paridade com o ambiente local.
- Negativas:
  - O pacote cresce com o tempo; é preciso manter o bundle enxuto e os workers separados.

## Pilares Well-Architected

Performance, excelência operacional e custo.

## Revisar quando

O bundle passar de 5 MB ou o p95 de cold start passar de 1 s.
