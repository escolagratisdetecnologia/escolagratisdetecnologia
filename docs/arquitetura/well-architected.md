# Revisão AWS Well-Architected

Atualize este documento em todo PR que mudar a arquitetura (veja `infra/CLAUDE.md`). Status: **feito** (já em produção), **planejado** (fase indicada).

## Excelência operacional

| Prática                                                                                           | Status                |
| ------------------------------------------------------------------------------------------------- | --------------------- |
| Toda infraestrutura em Terraform, mudanças por PR com plano e delta de custo                      | feito (Fase 0)        |
| Decisões registradas em ADRs                                                                      | feito (Fase 0)        |
| Deploy automatizado dev → aprovação → prod com smoke tests                                        | feito (Fase 0)        |
| Runbooks de bootstrap, GitHub, deploy e rollback, flat-rate, remoção total e MCP                  | feito (Fase 0)        |
| Logs estruturados (Powertools) e alarmes de erro                                                  | planejado (Fase 1)    |
| Operações (conteúdo, social, transparência) via skills do Claude Code terminando em PR            | planejado (Fases 3–5) |
| Concorrência de deploy por ambiente e espera pela invalidação do CloudFront antes dos smoke tests | feito (Fase 0)        |
| Permissões mínimas por job nos workflows                                                          | feito (Fase 0)        |
| GitHub Actions fixadas por digest, atualizadas pelo Renovate                                      | feito (Fase 0)        |
| Exceções do Trivy documentadas inline, por recurso                                                | feito (Fase 0)        |

## Segurança

| Prática                                                                                                                                    | Status                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| GitHub → AWS via OIDC, sem chaves de longa duração                                                                                         | feito (Fase 0)            |
| Confiança OIDC no `sub` imutável do GitHub (IDs do dono e do repositório)                                                                  | feito (Fase 0)            |
| Contas separadas por ambiente; role de apply só em environment protegido                                                                   | feito (Fase 0)            |
| S3 privado com OAC, política só-TLS e criptografia em repouso                                                                              | feito (Fase 0)            |
| WAF com regras gerenciadas e rate limit; CSP, HSTS e cabeçalhos de segurança                                                               | feito (Fase 0)            |
| Tag policy e auditoria semanal de tags                                                                                                     | feito (Fase 0)            |
| Cognito, BFF com cookies HttpOnly, SMS MFA da equipe                                                                                       | planejado (Fase 1)        |
| Proteções contra SSRF e injeção de prompt no corretor                                                                                      | planejado (Fase 2)        |
| Chave de assinatura de certificados no KMS                                                                                                 | planejado (Fase 2)        |
| Permissions boundary na role de apply                                                                                                      | planejado (fim da Fase 2) |
| Role `plan` com Deny explícito em leituras do plano de dados (objetos S3 fora do estado, DynamoDB, Cognito, logs, segredos, `kms:Decrypt`) | feito (Fase 0)            |
| E-mails de alerta como Secret e `alert_emails` marcada como `sensitive`                                                                    | feito (Fase 0)            |
| Rate limit do WAF que ignora assets imutáveis (`/_astro/`)                                                                                 | feito (Fase 0)            |

## Confiabilidade

| Prática                                                                                      | Status                |
| -------------------------------------------------------------------------------------------- | --------------------- |
| Serviços gerenciados multi-AZ (S3, CloudFront)                                               | feito (Fase 0)        |
| Estado Terraform versionado com lock nativo                                                  | feito (Fase 0)        |
| DynamoDB com PITR; SQS com DLQ; workers idempotentes                                         | planejado (Fases 1–2) |
| Deploys serializados por ambiente e smoke tests só após a invalidação do CloudFront terminar | feito (Fase 0)        |

## Eficiência de performance

| Prática                                                  | Status             |
| -------------------------------------------------------- | ------------------ |
| Site estático na borda, HTTP/3, compressão               | feito (Fase 0)     |
| Orçamentos de desempenho na CI (Lighthouse, 30 KB de JS) | feito (Fase 0)     |
| Vídeo HLS adaptativo; Lambda arm64                       | planejado (Fase 1) |

## Otimização de custos

| Prática                                                       | Status                                               |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| Serverless pago por uso; nada ocioso                          | feito (Fase 0)                                       |
| Infracost em todo PR de infra (app do GitHub)                 | feito (Fase 0, via runbook)                          |
| Budgets por conta e detecção de anomalias por conta-membro    | feito (Fase 0)                                       |
| Tags de custo (Project, Environment, Component)               | feito (Fase 0; ativação 24 h após o primeiro deploy) |
| CloudFront pay-as-you-go no free tier; WAF à parte (ADR 0019) | feito (Fase 0)                                       |
| Gatilho de revisão do Cognito em 30 mil MAU                   | planejado (Fase 1)                                   |

## Sustentabilidade

| Prática                                                         | Status             |
| --------------------------------------------------------------- | ------------------ |
| Conteúdo estático com cache longo para assets imutáveis         | feito (Fase 0)     |
| Ciclo de vida para versões antigas no S3                        | feito (Fase 0)     |
| Graviton (arm64) nas Lambdas; originais de vídeo em camada fria | planejado (Fase 1) |
