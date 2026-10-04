# Bootstrap da AWS

Executado uma única vez pelo mantenedor, com acesso administrativo. Ordem: organização → perfis → buckets de estado → gerenciamento → dev → prod → DNS no GoDaddy → GitHub → primeiro deploy → tags de custo.

> **Quem executa o quê.** O `.claude/settings.json` do projeto **nega** ao Claude Code estes comandos: `infra/tf bootstrap/account prod apply|destroy`, `infra/tf bootstrap/management shared apply|destroy`, `infra/tf live prod apply|destroy` e `terraform -chdir=... apply|destroy`. Esses passos são seus: rode os blocos marcados "você executa" **no seu terminal do WSL** (com o PATH do mise). Não use o prefixo `!` do Claude Code com blocos que têm `export`: cada `!` roda num shell novo (o `export` não persiste) e o `yes` do Terraform pode ficar sem entrada. Se mesmo assim quiser rodar de dentro do Claude Code, use uma linha só, com as variáveis inline (ex.: `!AWS_PROFILE=egt-prod infra/tf bootstrap/account prod apply`). O bootstrap de **dev** pode ser feito pelo Claude, com aprovação explícita sua.

## 0. Pré-requisitos

- `mise install` (Terraform 1.16.5) e AWS CLI v2.
- Conta de gerenciamento com MFA no root e acesso administrativo pelo IAM Identity Center.

## 1. Organização e contas

A organização **já existe**: ela foi criada quando você habilitou o IAM Identity Center (sa-east-1) na conta de gerenciamento. Confirme, habilite o tipo de política de tags (se ainda não estiver) e crie as contas-membro:

```bash
aws sso login --profile egt-management
export AWS_PROFILE=egt-management
aws organizations describe-organization   # confirme "FeatureSet": "ALL" (tag policies exigem)
root_id="$(aws organizations list-roots --query 'Roots[0].Id' --output text)"
aws organizations list-roots --query 'Roots[0].PolicyTypes'   # procure TAG_POLICY com Status ENABLED
aws organizations enable-policy-type --root-id "$root_id" --policy-type TAG_POLICY   # se não estiver habilitado
aws organizations create-account --email "<e-mail-raiz-dev>" --account-name egt-dev
aws organizations create-account --email "<e-mail-raiz-prod>" --account-name egt-prod
aws organizations list-accounts --query "Accounts[?starts_with(Name,'egt-')].[Name,Id]" --output table
```

Use e-mails distintos que você controla (ex.: endereços com `+`). Anote os IDs — eles **não** vão para o repositório. A criação de conta é assíncrona; acompanhe e repita até as duas ficarem `SUCCEEDED` (se `FAILED`, a coluna final mostra o motivo):

```bash
aws organizations list-create-account-status --query 'CreateAccountStatuses[].[AccountName,State,FailureReason]' --output table
```

## 2. Perfis de acesso

O perfil SSO `egt-management` já existe (sessão `egt`, região sa-east-1). Para os outros dois (um único login da sessão serve para os dois perfis):

1. No IAM Identity Center, atribua o permission set `AdministratorAccess` ao seu usuário nas contas `egt-dev` e `egt-prod`.
2. Crie os perfis reutilizando a sessão `egt`:

```bash
aws configure sso   # sessão: egt (existente); escolha a conta egt-dev e AdministratorAccess; região padrão sa-east-1; o nome do perfil (egt-dev) é a última pergunta
aws configure sso   # idem para a conta egt-prod, nome do perfil egt-prod
aws sso login --profile egt-dev
```

## 3. Buckets de estado

```bash
for pair in management:egt-management dev:egt-dev prod:egt-prod; do
  env="${pair%%:*}"; profile="${pair##*:}"; bucket="escolagratis-tfstate-$env"
  aws s3api create-bucket --bucket "$bucket" --region sa-east-1 \
    --create-bucket-configuration LocationConstraint=sa-east-1 --profile "$profile"
  aws s3api put-bucket-versioning --bucket "$bucket" \
    --versioning-configuration Status=Enabled --profile "$profile"
  aws s3api put-public-access-block --bucket "$bucket" --profile "$profile" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
done
```

O Terraform importa esses buckets no primeiro `apply` (blocos `import` em cada raiz de bootstrap).

Se algum nome já existir na AWS (`BucketAlreadyExists`), use um sufixo aleatório, nunca o ID da conta: gere com `openssl rand -hex 3` e use `escolagratis-tfstate-<env>-<sufixo>` (ex.: `escolagratis-tfstate-dev-a1b2c3`). Crie o bucket com esse nome e troque o nome nos arquivos abaixo, num PR:

- `state_bucket_name` em `infra/bootstrap/management/env/shared.tfvars`, `infra/bootstrap/account/env/dev.tfvars` e `infra/bootstrap/account/env/prod.tfvars`;
- `bucket` em `infra/bootstrap/management/env/shared.backend.hcl`, `infra/bootstrap/account/env/{dev,prod}.backend.hcl` e `infra/live/env/{dev,prod}.backend.hcl`.

## 4. Conta de gerenciamento

Exporte **sempre** as duas variáveis abaixo antes de `plan` ou `apply`. Sem `TF_VAR_member_account_ids` o plano falha (a variável exige IDs de 12 dígitos, não vazia); sem `TF_VAR_alert_emails` o apply remove a inscrição de e-mail do alerta de anomalia.

```bash
export AWS_PROFILE=egt-management
export TF_VAR_member_account_ids='{"dev":"<id-dev>","prod":"<id-prod>"}'
export TF_VAR_alert_emails='["<seu-e-mail>"]'
infra/tf bootstrap/management shared plan
infra/tf bootstrap/management shared apply   # você executa, no seu terminal
```

Se a criação da tag policy falhar com `InvalidInputException` citando um tipo de recurso, remova esse tipo de `enforced_resource_types` em `infra/bootstrap/management/main.tf` e rode de novo.

Confira o seu e-mail: se chegar uma mensagem de confirmação da inscrição do alerta de anomalia, confirme.

## 5. Conta dev

Pode ser executado pelo Claude, com aprovação explícita, ou por você.

```bash
export AWS_PROFILE=egt-dev
infra/tf bootstrap/account dev plan
infra/tf bootstrap/account dev apply
infra/tf bootstrap/account dev output -json zone_name_servers
```

## 6. Conta prod (com delegação de `dev.`)

Cole os name servers da etapa 5 em `infra/bootstrap/account/env/prod.tfvars`:

```hcl
subdomain_delegations = {
  "dev.escolagratisdetecnologia.com" = ["ns-1.awsdns-01.org", "ns-2.awsdns-02.co.uk", "ns-3.awsdns-03.com", "ns-4.awsdns-04.net"]
}
```

(os valores acima são exemplos — use os da sua saída). **Commite essa alteração via PR** (name servers não são segredo); sem isso, um apply futuro de prod a partir de um checkout limpo apaga a delegação. Depois, **você** executa no seu terminal (negado ao Claude):

```bash
export AWS_PROFILE=egt-prod
infra/tf bootstrap/account prod plan
infra/tf bootstrap/account prod apply   # você executa
infra/tf bootstrap/account prod output -json zone_name_servers
```

## 7. DNS no GoDaddy

Antes de trocar, confira no GoDaddy: (a) registros que precisam ser recriados no Route 53 (MX/TXT, encaminhamento de e-mail), pois a zona nova começa vazia; (b) DNSSEC: se estiver ligado, desligue e remova o registro DS.

GoDaddy → Meus produtos → `escolagratisdetecnologia.com` → DNS → Servidores de nomes → **Alterar** → "Usarei meus próprios servidores de nomes" → cole os 4 name servers da etapa 6. A propagação pode levar algumas horas; confira:

```bash
curl -s "https://dns.google/resolve?name=escolagratisdetecnologia.com&type=NS" | python3 -m json.tool
curl -s "https://dns.google/resolve?name=dev.escolagratisdetecnologia.com&type=NS" | python3 -m json.tool
```

**Só siga para o passo 9 quando os dois comandos responderem com os name servers `awsdns`.** Senão a validação do certificado ACM expira.

## 8. GitHub

Siga `docs/runbooks/configurar-github.md` (variáveis com os IDs das contas e o segredo `ALERT_EMAILS`). `ALERT_EMAILS` é **Secret**, nunca Variable: Variables aparecem em texto puro nos logs públicos do Actions.

## 9. Primeiro deploy

Pelo pipeline (merge na `main` → job `dev` → aprovação → job `prod`). Depois, assine os planos flat-rate: `docs/runbooks/cloudfront-flat-rate.md`.

Contas novas às vezes recebem "Your account must be verified before you can add new CloudFront resources": abra um caso gratuito no AWS Support e, quando liberar, reexecute em GitHub → Actions → deploy → Run workflow.

## 10. Tags de custo (24 h depois do primeiro deploy)

Ative as tags (mantenha as variáveis da etapa 4 exportadas). Se `aws_ce_cost_allocation_tag` falhar porque as chaves ainda não apareceram no billing, espere mais um dia e repita:

```bash
export AWS_PROFILE=egt-management
export TF_VAR_member_account_ids='{"dev":"<id-dev>","prod":"<id-prod>"}'
export TF_VAR_alert_emails='["<seu-e-mail>"]'
TF_VAR_activate_cost_allocation_tags=true infra/tf bootstrap/management shared plan
TF_VAR_activate_cost_allocation_tags=true infra/tf bootstrap/management shared apply   # você executa, no seu terminal
```

Em seguida, **persista** a ativação: via PR, acrescente `activate_cost_allocation_tags = true` em `infra/bootstrap/management/env/shared.tfvars`. Sem isso, o próximo apply desativa as tags.

As tags passam a aparecer no Cost Explorer em até 24 h.
