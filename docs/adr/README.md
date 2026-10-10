# Decisões de arquitetura (ADRs)

Cada decisão relevante vira um arquivo `NNNN-titulo.md` a partir de `0000-modelo.md`. Decisão nova ou alterada entra no mesmo PR da mudança e atualiza `docs/arquitetura/well-architected.md`.

| #    | Decisão                                                     | Status               |
| ---- | ----------------------------------------------------------- | -------------------- |
| 0001 | Site static-first com Astro e API serverless                | aceita               |
| 0002 | Conteúdo como código                                        | aceita               |
| 0003 | Vídeos hospedados na AWS                                    | aceita               |
| 0004 | CloudFront com plano flat-rate                              | substituída por 0019 |
| 0005 | API única em Lambda com Hono e Node 24                      | aceita               |
| 0006 | DynamoDB on-demand em tabela única                          | aceita               |
| 0007 | Amazon Cognito para identidade                              | aceita               |
| 0008 | Política de SMS                                             | aceita               |
| 0009 | Avaliação com quizzes formativos e projeto corrigido por IA | aceita               |
| 0010 | Certificados Open Badges 3.0 assinados no KMS               | aceita               |
| 0011 | Operações via Claude Code + MCP, sempre em PR               | aceita               |
| 0012 | Números financeiros por scripts determinísticos             | aceita               |
| 0013 | Região sa-east-1                                            | aceita               |
| 0014 | Contas AWS separadas e acesso do GitHub via OIDC            | aceita               |
| 0015 | Padrão obrigatório de tags                                  | aceita               |
| 0016 | Licenças                                                    | aceita               |
| 0017 | Idioma de docs e código                                     | aceita               |
| 0018 | Entidade de doações parametrizada                           | aceita               |
| 0019 | CloudFront pay-as-you-go                                    | aceita               |
| 0020 | Domínio principal .com.br                                   | aceita               |
| 0021 | JavaScript no cliente sob CSP estrita                       | aceita               |
| 0023 | Chaves da AWS em dados, logs e alertas                      | aceita               |
