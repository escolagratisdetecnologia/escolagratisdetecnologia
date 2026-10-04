# 0014. Contas AWS separadas e acesso do GitHub via OIDC

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D14

## Contexto

Queremos isolar falhas e acessos entre ambientes, ter custo por ambiente claro e nenhuma chave de longa duração.

## Decisão

Usamos AWS Organizations com conta de gerenciamento + `egt-dev` + `egt-prod`. O estado Terraform fica em S3 por conta, com lock nativo (`use_lockfile`). Os buckets usam SSE-S3 (sem CMK), por custo e baixo ganho. O GitHub assume roles via OIDC:

- `plan` (ReadOnlyAccess, PRs, sem aprovação): tem Deny explícito em leituras do plano de dados (objetos S3 que não sejam o estado, itens do DynamoDB, usuários do Cognito, logs, segredos e `kms:Decrypt`) e só pode escrever `live/*.tflock`.
- `apply` (AdministratorAccess): confia no subject do GitHub Environment, então os Environments `dev` e `prod` DEVEM restringir deploys à branch `main`; prod exige aprovação.
- `audit` (Resource Explorer, branch main).

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

## Pilares Well-Architected

Segurança e excelência operacional.

## Revisar quando

Chegar ao fim da Fase 2: restringir a role `apply` com permissions boundary.
