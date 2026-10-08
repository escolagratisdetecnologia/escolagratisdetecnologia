# infra — Terraform

## Layout

- `bootstrap/account` — por conta (dev, prod): bucket de estado, OIDC do GitHub, roles `egt-<env>-bootstrap-github-{plan,apply,audit}`, Resource Explorer (view `egt-<env>-bootstrap-all-resources`), zona DNS.
- `bootstrap/management` — conta de gerenciamento: tag policy, anomalias de custo, cost allocation tags.
- `modules/*` — blocos reutilizáveis (tags, site, edge, observability, state-bucket…).
- `live/` — raiz única da aplicação; `env/<env>.tfvars` e `env/<env>.backend.hcl` por ambiente.
- `tf` — wrapper: `infra/tf <raiz> <env> <comando>`.

## Regiões

`sa-east-1` para tudo que a AWS permite. `us-east-1` (alias `aws.us_east_1`) só para ACM e WAF do CloudFront, Cost Explorer e o índice local do Resource Explorer (ADR 0013).

## Tags

Todo recurso AWS tagueável precisa de:

| Chave                | Valores                                                                                              | Origem                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `Project`            | `escola-gratis-de-tecnologia`                                                                        | `default_tags` (módulo `tags`)                |
| `Environment`        | `dev`, `prod`, `shared`                                                                              | `default_tags`                                |
| `ManagedBy`          | `terraform` (ou `app` para recursos criados pela aplicação)                                          | `default_tags`                                |
| `Repository`         | `github.com/escolagratisdetecnologia/escolagratisdetecnologia`                                       | `default_tags`                                |
| `Component`          | `edge`, `site`, `api`, `data`, `auth`, `media`, `jobs`, `certificates`, `observability`, `bootstrap` | `tags = local.tags` em cada recurso do módulo |
| `DataClassification` | `public`, `internal`, `personal`                                                                     | só em S3, DynamoDB e Cognito                  |

- Todo provider AWS (inclusive aliases) usa `default_tags { tags = module.tags.default_tags }`.
- Todo recurso tagueável num módulo declara `tags = local.tags` com `Component`.
- Recursos criados pela aplicação (ex.: jobs do MediaConvert) recebem as mesmas tags via variáveis de ambiente, com `ManagedBy=app`.
- O PR falha se faltar tag: `tools/check-tags` lê o plano; o tflint confere `Component`.
- Componente novo? Atualize `tools/check-tags/src/rules.ts`, esta tabela e a ADR 0015.

## Nomes

`egt-<env>-<component>-<nome>`. Buckets levam o ID da conta como sufixo para unicidade global (exceto os de estado, criados antes do Terraform). A conta de gerenciamento usa `egt-shared-bootstrap-<nome>`.

## Segurança e custo

- Menor privilégio; S3 sem acesso público e com política só-TLS; criptografia em repouso.
- Nenhuma chave de longa duração: GitHub assume roles via OIDC.
- As roles confiam no `sub` imutável do GitHub (`repo:<owner>@<owner_id>/<repo>@<repo_id>:...`, variável `github_subject_prefix`); renomear ou transferir o repositório exige atualizar a variável e reaplicar o bootstrap antes (ADR 0014).
- Prefira serviços pagos por uso. Se o padrão de uso mudar, atualize `infra/infracost-usage.yml`.
- Exceções do Trivy só inline, com `#trivy:ignore:<ID>` logo acima do recurso e uma linha de justificativa em inglês (não existe `.trivyignore` global).
- A variável `alert_emails` é `sensitive` e chega aos workflows pelo Secret `ALERT_EMAILS` (nunca por Variable — Variables aparecem em texto puro nos logs públicos).
- A role de plan dos PRs tem Deny explícito para leitura de dados (objetos S3 fora do estado, itens DynamoDB, usuários Cognito, logs, segredos, `kms:Decrypt`). Se um módulo novo precisar que o `plan` leia conteúdo, registre em ADR antes de afrouxar.

## Testes

`terraform fmt -check -recursive infra`, `terraform validate` em toda raiz afetada (`init -backend=false`), `terraform test` em módulos com lógica (módulos com provider em alias, como `edge`, são cobertos por `terraform test` com `mock_provider` em vez de `validate` avulso), `tflint --recursive`, `trivy config`.

Lock files: as raízes (`live/`, `bootstrap/*`) commitam o `.terraform.lock.hcl`; os de `infra/modules/` são ignorados pelo git.

## Proibido

- `apply`/`destroy` local em prod (o pipeline faz isso com aprovação). Exceção: o bootstrap e a remoção total, executados pelo mantenedor seguindo `docs/runbooks/bootstrap-aws.md` e `docs/runbooks/remover-projeto.md`.
- Recursos criados à mão no console, exceto o que um runbook manda.
- Mudar arquitetura sem ADR e sem atualizar `docs/arquitetura/well-architected.md`.
