# Revisão AWS Well-Architected

Atualize este documento em todo PR que mudar a arquitetura (veja `infra/CLAUDE.md`). Status: **feito** (já em produção), **planejado** (fase indicada).

## Excelência operacional

| Prática                                                                                             | Status                |
| --------------------------------------------------------------------------------------------------- | --------------------- |
| Toda infraestrutura em Terraform, mudanças por PR com plano e delta de custo                        | feito (Fase 0)        |
| Decisões registradas em ADRs                                                                        | feito (Fase 0)        |
| Deploy automatizado dev → aprovação → prod com smoke tests                                          | feito (Fase 0)        |
| Runbooks de bootstrap, GitHub, deploy e rollback, flat-rate, remoção total e MCP                    | feito (Fase 0)        |
| Logs estruturados (Powertools) e alarmes de erro da API por e-mail (ADR 0023)                       | feito (Fase 1B)       |
| Ambiente local com DynamoDB Local (`pnpm db:up`) e testes de integração com ele na CI               | feito (Fase 1B)       |
| Login testável sem AWS: provedor local, Mailpit e Google de mentira no `pnpm db:up`, na CI e no e2e | feito (Fase 1C)       |
| Operações (conteúdo, social, transparência) via skills do Claude Code terminando em PR              | planejado (Fases 3–5) |
| Concorrência de deploy por ambiente e espera pela invalidação do CloudFront antes dos smoke tests   | feito (Fase 0)        |
| Permissões mínimas por job nos workflows                                                            | feito (Fase 0)        |
| GitHub Actions fixadas por digest, atualizadas pelo Renovate                                        | feito (Fase 0)        |
| Conteúdo validado na CI (`pnpm content:check`) e rascunhos só em dev                                | feito (Fase 1A)       |
| Exceções do Trivy documentadas inline, por recurso                                                  | feito (Fase 0)        |

## Segurança

| Prática                                                                                                                                    | Status                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| GitHub → AWS via OIDC, sem chaves de longa duração                                                                                         | feito (Fase 0)            |
| Confiança OIDC no `sub` imutável do GitHub (IDs do dono e do repositório)                                                                  | feito (Fase 0)            |
| Contas separadas por ambiente; role de apply só em environment protegido                                                                   | feito (Fase 0)            |
| S3 privado com OAC, política só-TLS e criptografia em repouso                                                                              | feito (Fase 0)            |
| WAF com regras gerenciadas e rate limit; CSP, HSTS e cabeçalhos de segurança                                                               | feito (Fase 0)            |
| Tag policy e auditoria semanal de tags                                                                                                     | feito (Fase 0)            |
| Contas de alunos no Cognito (Essentials) sem senha; tokens só em cookies HttpOnly, sem `Domain` (ADR 0024)                                 | feito (Fase 1C)           |
| Login com limite próprio no WAF (50 requisições por IP a cada 5 minutos em `/api/auth/*`)                                                  | feito (Fase 1C)           |
| Idade mínima no cadastro e autoatendimento da LGPD (baixar e excluir os dados)                                                             | feito (Fase 1C)           |
| SMS MFA da equipe                                                                                                                          | planejado (Fase 1)        |
| Proteções contra SSRF e injeção de prompt no corretor                                                                                      | planejado (Fase 2)        |
| Chave de assinatura de certificados no KMS                                                                                                 | planejado (Fase 2)        |
| Permissions boundary na role de apply                                                                                                      | planejado (fim da Fase 2) |
| Role `plan` com Deny explícito em leituras do plano de dados (objetos S3 fora do estado, DynamoDB, Cognito, logs, segredos, `kms:Decrypt`) | feito (Fase 0)            |
| E-mails de alerta como Secret e `alert_emails` marcada como `sensitive`                                                                    | feito (Fase 0)            |
| Rate limit do WAF que ignora assets imutáveis (`/_astro/`)                                                                                 | feito (Fase 0)            |
| Nenhum script ou estilo inline no HTML (`check:csp` na CI, ADR 0021)                                                                       | feito (Fase 1A)           |
| API só pelo CloudFront: cabeçalho secreto de origem, WAF e cabeçalhos de segurança também na API (ADR 0022)                                | feito (Fase 1B)           |
| Mudanças na API só com `Origin` do site (CSRF); corpo até 8 KB; respostas `no-store`                                                       | feito (Fase 1B)           |
| IAM de menor privilégio na Lambda da API; logs de acesso sem IP                                                                            | feito (Fase 1B)           |
| E-mail do domínio com DKIM, MAIL FROM próprio e DMARC (SES)                                                                                | feito (Fase 1C)           |

## Confiabilidade

| Prática                                                                                      | Status             |
| -------------------------------------------------------------------------------------------- | ------------------ |
| Serviços gerenciados multi-AZ (S3, CloudFront)                                               | feito (Fase 0)     |
| Estado Terraform versionado com lock nativo                                                  | feito (Fase 0)     |
| DynamoDB com PITR (35 dias) e proteção contra exclusão em prod                               | feito (Fase 1B)    |
| Mescla de progresso sem ler-e-regravar: conjuntos com `ADD` e `SET` condicional              | feito (Fase 1B)    |
| `/api/health` confere o banco; o smoke confere a versão publicada e os erros da API em JSON  | feito (Fase 1B)    |
| Progresso sincronizado um curso por pedido; o que falha fica pendente no aparelho            | feito (Fase 1C)    |
| Progresso limitado às aulas do catálogo (tamanho dos dados por aluno)                        | feito (Fase 1C)    |
| SQS com DLQ; workers idempotentes                                                            | planejado (Fase 2) |
| Deploys serializados por ambiente e smoke tests só após a invalidação do CloudFront terminar | feito (Fase 0)     |
| Domínio principal `.com.br`; `.com` e `www` redirecionam com 301 na mesma borda (ADR 0020)   | feito (Fase 0)     |
| Páginas visitadas disponíveis offline (service worker)                                       | feito (Fase 1A)    |

## Eficiência de performance

| Prática                                                  | Status              |
| -------------------------------------------------------- | ------------------- |
| Site estático na borda, HTTP/3, compressão               | feito (Fase 0)      |
| Orçamentos de desempenho na CI (Lighthouse, 30 KB de JS) | feito (Fase 0)      |
| Lambda arm64 com bundle único minificado                 | feito (Fase 1B)     |
| Vídeo HLS adaptativo                                     | planejado (Fase 1D) |
| Ilhas Preact sob demanda; JS medido em gzip no e2e       | feito (Fase 1A)     |

## Otimização de custos

| Prática                                                                    | Status                      |
| -------------------------------------------------------------------------- | --------------------------- |
| Serverless pago por uso; nada ocioso                                       | feito (Fase 0)              |
| Infracost em todo PR de infra (app do GitHub)                              | feito (Fase 0, via runbook) |
| Budgets por conta e detecção de anomalias por conta-membro                 | feito (Fase 0)              |
| Tags de custo (Project, Environment, Component)                            | feito (Fase 0)              |
| CloudFront pay-as-you-go no free tier; WAF à parte (ADR 0019)              | feito (Fase 0)              |
| Cognito Essentials gratuito até 10 mil MAU; revisão em 30 mil (ADR 0007)   | feito (Fase 1C)             |
| API, banco e alarmes pagos por uso; chaves da AWS em vez de CMK (ADR 0023) | feito (Fase 1B)             |

## Sustentabilidade

| Prática                                                 | Status              |
| ------------------------------------------------------- | ------------------- |
| Conteúdo estático com cache longo para assets imutáveis | feito (Fase 0)      |
| Ciclo de vida para versões antigas no S3                | feito (Fase 0)      |
| Graviton (arm64) na Lambda da API                       | feito (Fase 1B)     |
| Originais de vídeo em camada fria                       | planejado (Fase 1D) |
