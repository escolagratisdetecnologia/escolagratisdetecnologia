# 0006. DynamoDB on-demand em tabela única

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D6

## Contexto

Os acessos são por chave (usuário, curso, certificado), queremos pagar só pelo uso e rodar localmente.

## Decisão

Uma tabela única on-demand, com PITR, GSI1 e TTL, modelada com ElectroDB.

## Alternativas consideradas

- Aurora Serverless v2: retomada lenta após pausa.
- Aurora DSQL: restrições de SQL.

## Consequências

- Positivas:
  - Custo proporcional ao uso, latência baixa e DynamoDB Local para desenvolvimento.
- Negativas:
  - Consultas analíticas exigem exportação; a modelagem precisa ser planejada por padrão de acesso.

## Pilares Well-Architected

Custo, performance e confiabilidade.

## Revisar quando

Consultas ad hoc frequentes não couberem em índices secundários, ou o tráfego ficar alto e estável, quando a capacidade provisionada (que o Infracost sugere nos PRs que mexem na tabela) pode sair mais barata que on-demand.
