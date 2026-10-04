# Remover 100% do projeto da AWS

Irreversível. Só com decisão explícita do mantenedor. A tag `Project=escola-gratis-de-tecnologia` é a referência para achar tudo (ADR 0015).

> Todos os comandos `destroy` abaixo são **negados ao Claude Code**. Você os executa: no Claude Code com o prefixo `!`, ou no seu terminal.

## 1. Aplicação (prod, depois dev)

Cancele antes os planos flat-rate no console do CloudFront.

```bash
export AWS_PROFILE=egt-prod
infra/tf live prod destroy   # você executa
export AWS_PROFILE=egt-dev
infra/tf live dev destroy
```

O bucket do site tem `force_destroy`, então é esvaziado automaticamente.

## 2. Bootstrap das contas

O estado do bootstrap mora no bucket que será apagado, por isso o destroy é feito com `-target` e o bucket é removido à mão. Para cada conta (prod, depois dev):

```bash
export AWS_PROFILE=egt-prod
infra/tf bootstrap/account prod state pull > bootstrap-prod.tfstate   # cópia de segurança; não commitar
```

1. Remova **localmente, sem commitar**, os blocos `lifecycle { prevent_destroy = true }` da zona (`aws_route53_zone.this`, em `infra/bootstrap/account/main.tf`) e do bucket (`infra/modules/state-bucket/main.tf`). Ao final, descarte com `git checkout -- infra`.
2. Destrua:

```bash
infra/tf bootstrap/account prod destroy \
  -target=aws_route53_record.delegation \
  -target=aws_route53_zone.this \
  -target=aws_resourceexplorer2_view.all \
  -target=aws_resourceexplorer2_index.aggregator \
  -target=aws_resourceexplorer2_index.us_east_1 \
  -target=aws_iam_role.github \
  -target=aws_iam_openid_connect_provider.github
```

3. Esvazie e apague o bucket de estado:

```bash
aws s3api delete-objects --bucket escolagratis-tfstate-prod --delete "$(aws s3api list-object-versions --bucket escolagratis-tfstate-prod --query '{Objects: [Versions,DeleteMarkers][][].{Key: Key, VersionId: VersionId}}' --output json)"
aws s3api delete-bucket --bucket escolagratis-tfstate-prod
```

Repita com `AWS_PROFILE=egt-dev`, `dev` e `escolagratis-tfstate-dev`. Se o bucket tiver mais de 1000 versões, repita o `delete-objects` até esvaziar.

## 3. Conta de gerenciamento

Os recursos têm nomes `egt-shared-bootstrap-*` (tag policy, monitor e assinatura de anomalias de custo).

```bash
export AWS_PROFILE=egt-management
export TF_VAR_member_account_ids='{"dev":"<id-dev>","prod":"<id-prod>"}'
infra/tf bootstrap/management shared destroy \
  -target=aws_ce_cost_allocation_tag.this \
  -target=aws_ce_anomaly_subscription.email \
  -target=aws_ce_anomaly_monitor.member_accounts \
  -target=aws_organizations_policy_attachment.tags \
  -target=aws_organizations_policy.tags
```

Depois esvazie e apague `escolagratis-tfstate-management` como no passo 2.3. (Usa-se `-target` pelo mesmo motivo: o estado mora nesse bucket. O bloco `prevent_destroy` do bucket só atrapalharia um destroy completo.)

## 4. Conferir sobras pela tag

Em cada conta e nas regiões `sa-east-1` e `us-east-1`:

```bash
aws resourcegroupstaggingapi get-resources --region sa-east-1 \
  --tag-filters Key=Project,Values=escola-gratis-de-tecnologia --query 'ResourceTagMappingList[].ResourceARN'
aws resourcegroupstaggingapi get-resources --region us-east-1 \
  --tag-filters Key=Project,Values=escola-gratis-de-tecnologia --query 'ResourceTagMappingList[].ResourceARN'
```

Apague o que aparecer. Confira também o Cost Explorer filtrado por `Project` no mês seguinte.

## 5. Encerrar contas e DNS

- `aws organizations close-account --account-id <id>` para `egt-dev` e `egt-prod` (perfil `egt-management`).
- No GoDaddy, volte os servidores de nomes para os padrões.
