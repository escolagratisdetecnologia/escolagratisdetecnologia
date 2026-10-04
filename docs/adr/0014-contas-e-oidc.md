# 0014. Contas AWS separadas e acesso do GitHub via OIDC

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D14

## Contexto

Queremos isolar falhas e acessos entre ambientes, ter custo por ambiente claro e nenhuma chave de longa duração.

## Decisão

Usamos AWS Organizations com conta de gerenciamento + `egt-dev` + `egt-prod`. O estado Terraform fica em S3 por conta, com lock nativo (`use_lockfile`). Os buckets usam SSE-S3 (sem CMK), por custo e baixo ganho. O GitHub assume roles via OIDC (nomes `egt-<env>-bootstrap-github-{plan,apply,audit}`):

- `plan` (ReadOnlyAccess, PRs, sem aprovação): tem Deny explícito em leituras do plano de dados (objetos S3 que não sejam o estado, itens do DynamoDB, usuários do Cognito, logs, segredos e `kms:Decrypt`) e só pode escrever `live/*.tflock`.
- `apply` (AdministratorAccess): confia no subject do GitHub Environment, então os Environments `dev` e `prod` DEVEM restringir deploys à branch `main`; prod exige aprovação.
- `audit` (Resource Explorer, branch main).

A confiança usa `StringEquals` no claim `sub` com o **formato imutável** do GitHub: `repo:<owner>@<owner_id>/<repo>@<repo_id>:<contexto>` (ex.: `repo:escolagratisdetecnologia@337714343/escolagratisdetecnologia@1404541572:pull_request`). Repositórios criados depois de 2026-07-15 recebem esse formato ([changelog do GitHub](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens)); este foi criado em 2026-10-04. Os IDs numéricos impedem que alguém recrie um repositório ou organização com o mesmo nome e herde a confiança. Eles são IDs públicos do GitHub (não são IDs de conta AWS) e ficam na variável `github_subject_prefix` de `infra/bootstrap/account`. **Renomear ou transferir o repositório muda o prefixo:** antes da mudança, atualize `github_subject_prefix` (novo nome e, numa transferência, novo owner e `owner_id`) por PR e reaplique o bootstrap das duas contas logo antes de renomear ou transferir; sem isso, os workflows deixam de assumir as roles.

Os workflows usam permissões mínimas por job e as GitHub Actions são fixadas por digest, atualizado pelo Renovate. `ALERT_EMAILS` é um Secret (Variables aparecem em texto claro nos logs públicos) e a variável Terraform `alert_emails` é `sensitive`. Os applies do bootstrap de prod e da conta de gerenciamento são feitos localmente pelo mantenedor; o Claude Code os nega.

## Alternativas consideradas

- Conta única com prefixos: raio de impacto maior.
- Chaves de acesso no GitHub: risco de vazamento.

## Consequências

- Positivas:
  - Isolamento entre ambientes, nenhuma chave longa e PRs de fork ou de terceiros sem acesso a dados.
- Negativas:
  - A role `apply` é ampla; a mitigação é depender de Environments restritos a `main` e, no prod, com aprovação.
  - Se o Environment for configurado sem a restrição de branch, a proteção deixa de valer.
  - Renomear ou transferir o repositório exige atualizar `github_subject_prefix` e reaplicar o bootstrap antes, pois o subject inclui nome e ID.

## Pilares Well-Architected

Segurança e excelência operacional.

## Revisar quando

Chegar ao fim da Fase 2: restringir a role `apply` com permissions boundary.
