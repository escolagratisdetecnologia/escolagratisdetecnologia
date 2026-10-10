# 0023. Chaves da AWS em dados, logs e alertas

- Status: aceita
- Data: 2026-10-09
- Decisão do spec: D6 (complementa)

## Contexto

A Fase 1B cria a tabela DynamoDB, os log groups da API e um tópico SNS que leva os alarmes do CloudWatch por e-mail. O Trivy pede chave KMS própria (CMK) nos três: AWS-0025 e AWS-0017 (baixa severidade) e AWS-0095 (alta, tópico SNS sem criptografia). Alarmes do CloudWatch não conseguem publicar em tópicos criptografados com a chave gerenciada `aws/sns`: seria preciso uma CMK com política para o CloudWatch, a US$ 1 por mês por ambiente, mais as requisições.

## Decisão

- DynamoDB criptografado com a chave da AWS (padrão, sem custo), PITR de 35 dias e proteção contra exclusão em prod.
- Log groups com a criptografia padrão do CloudWatch Logs e retenção de 30 dias.
- Tópico `egt-<env>-observability-alerts` sem criptografia em repouso, com `#trivy:ignore:AWS-0095` e a justificativa inline. As mensagens têm só metadados do alarme (nome, métrica, estado), nada pessoal.
- Assinaturas por e-mail a partir do Secret `ALERT_EMAILS`, com `count` (não `for_each`) para os endereços continuarem `sensitive` no plano. Cada endereço confirma a assinatura uma vez.

## Alternativas consideradas

- CMK por ambiente: US$ 24 por ano sem ganho real, porque os dados já ficam criptografados em repouso e os alertas não têm dados pessoais.
- Alertas por SMS ou chat: custo e mais integrações para o mesmo aviso.
- Sem alarmes: um problema só apareceria quando alguém reclamasse.

## Consequências

- Positivas: custo zero de KMS; alarmes de erro desde a primeira API.
- Negativas: o tópico de alertas fica sem criptografia em repouso. Se os alertas passarem a carregar dados pessoais, esta decisão precisa ser revista.

## Pilares Well-Architected

Segurança (risco aceito e documentado), otimização de custos e excelência operacional (alarmes por e-mail).

## Revisar quando

As mensagens de alerta passarem a ter dados pessoais, ou o projeto adotar uma CMK simétrica por outro motivo.
