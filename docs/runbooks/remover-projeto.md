# Remover 100% do projeto da AWS

Irreversível. Só com decisão explícita do mantenedor. A tag `Project=escola-gratis-de-tecnologia` é a referência para achar tudo (ADR 0015).

> **Quem executa.** Só os `destroy` de prod e da conta de gerenciamento (e `terraform -chdir=... destroy`) são bloqueados para o Claude Code. Mesmo assim, **todos os passos deste runbook são executados por você**, no seu terminal do WSL (com o PATH do mise). Não use o prefixo `!` do Claude Code: cada `!` roda num shell novo (o `export` não persiste) e o `yes` do Terraform pode ficar sem entrada.

## 0. Preparação e plano flat-rate

A AWS exige cancelar o plano flat-rate primeiro e só **depois do ciclo de cobrança atual** permite apagar a distribuição. Portanto:

1. No console do CloudFront de cada conta (dev e prod), cancele o plano da distribuição.
2. No GitHub, desative os workflows `deploy` e `auditoria-tags` (Actions → workflow → **Disable workflow**), para que nenhum merge republique a aplicação durante a espera.
3. Espere o próximo ciclo de cobrança. Só então siga para o passo 1.

## 1. Reverter o DNS no GoDaddy

Antes de apagar as zonas, volte os servidores de nomes do GoDaddy para os padrões (Meus produtos → `escolagratisdetecnologia.com` → DNS → Servidores de nomes → Alterar). Assim nenhuma delegação fica apontando para zonas do Route 53 que deixam de existir (risco de alguém recriar a zona e sequestrar o domínio).

## 2. Aplicação (prod, depois dev)

Após esperar o ciclo de cobrança, a sessão SSO expirou. Um login serve aos três perfis:

```bash
aws sso login --profile egt-management
export AWS_PROFILE=egt-prod
infra/tf live prod destroy
export AWS_PROFILE=egt-dev
infra/tf live dev destroy
```

O bucket do site tem `force_destroy`, então é esvaziado automaticamente.

## 3. Bootstrap das contas

O estado do bootstrap mora no bucket que será apagado, por isso o destroy é feito com `-target` e o bucket é removido à mão. Para cada conta (prod, depois dev):

```bash
export AWS_PROFILE=egt-prod
infra/tf bootstrap/account prod state pull > bootstrap-prod.tfstate   # cópia de segurança; não commitar
```

1. Remova **localmente, sem commitar**, os blocos `lifecycle { prevent_destroy = true }` da zona (`aws_route53_zone.this`, em `infra/bootstrap/account/main.tf`) e do bucket (`infra/modules/state-bucket/main.tf`).

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

   Se a exclusão da zona falhar com `HostedZoneNotEmpty` (registros criados à mão), apague esses registros e repita.

3. Esvazie e apague o bucket de estado. Use o nome que estiver em `infra/live/env/<env>.backend.hcl` (pode ter sufixo, se o fallback do bootstrap foi usado). Opção simples: console S3 → bucket → **Esvaziar** (trata todas as versões). Pela CLI, o laço abaixo apaga em lotes de até 1000 (o `use_lockfile` gera muitas versões e delete markers):

   ```bash
   bucket=escolagratis-tfstate-prod   # use o nome do env/*.backend.hcl
   lote="$(mktemp)"
   while :; do
     aws s3api list-object-versions --bucket "$bucket" --no-paginate --output json \
       --query '{Objects: [Versions,DeleteMarkers][][].{Key: Key, VersionId: VersionId} | [:1000], Quiet: `true`}' > "$lote" || break
     n="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["Objects"] or []))' "$lote")" || break
     [ "$n" = 0 ] && break
     erros="$(aws s3api delete-objects --bucket "$bucket" --delete "file://$lote" --query 'length(Errors || `[]`)' --output text)" || break
     [ "$erros" = 0 ] || { echo "delete-objects: $erros erro(s); confira antes de repetir" >&2; break; }
   done
   rm -f "$lote"
   aws s3api delete-bucket --bucket "$bucket"   # falha com BucketNotEmpty se algo sobrou: seguro
   ```

   O `--no-paginate` faz uma única chamada (o S3 devolve no máximo 1000 entradas), o `[:1000]` garante o limite do `delete-objects`, o `file://` evita o limite de tamanho de argumento e o laço para em qualquer erro.

Repita com `AWS_PROFILE=egt-dev`, `dev` e o bucket de dev. Só depois de destruir as duas contas, descarte as alterações locais (restaura o `prevent_destroy`):

```bash
git checkout -- infra/modules/state-bucket/main.tf infra/bootstrap/account/main.tf
```

## 4. Conta de gerenciamento

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

Depois esvazie e apague o bucket de estado da gerenciamento (nome em `infra/bootstrap/management/env/shared.backend.hcl`) como no passo 3.3: console S3 → **Esvaziar**, ou o mesmo laço com `bucket=escolagratis-tfstate-management` (ou o nome do arquivo). Usa-se `-target` pelo mesmo motivo: o estado mora nesse bucket. O bloco `prevent_destroy` do bucket só atrapalharia um destroy completo.

## 5. Conferir sobras pela tag

Em cada conta (troque `AWS_PROFILE`) e nas regiões `sa-east-1` e `us-east-1`:

```bash
aws resourcegroupstaggingapi get-resources --region sa-east-1 \
  --tag-filters Key=Project,Values=escola-gratis-de-tecnologia --query 'ResourceTagMappingList[].ResourceARN'
aws resourcegroupstaggingapi get-resources --region us-east-1 \
  --tag-filters Key=Project,Values=escola-gratis-de-tecnologia --query 'ResourceTagMappingList[].ResourceARN'
```

Apague o que aparecer. Confira também o Cost Explorer filtrado por `Project` no mês seguinte.

## 6. Encerrar contas

Obtenha cada ID pelo nome, para não fechar a conta errada, e feche com o perfil `egt-management`:

```bash
export AWS_PROFILE=egt-management
dev_id="$(aws organizations list-accounts --query "Accounts[?Name=='egt-dev'].Id" --output text)"
prod_id="$(aws organizations list-accounts --query "Accounts[?Name=='egt-prod'].Id" --output text)"
echo "$dev_id $prod_id"
```

Confira os dois IDs. Só então feche as contas:

```bash
aws organizations close-account --account-id "$dev_id"
aws organizations close-account --account-id "$prod_id"
```

Opcional: remova os perfis SSO `egt-dev` e `egt-prod` do `~/.aws/config`. Desabilite o tipo de política de tags (`root_id` como no bootstrap) só se você o habilitou para este projeto e não há outras tag policies na organização (desabilitar desanexa todas):

```bash
root_id="$(aws organizations list-roots --query 'Roots[0].Id' --output text)"
aws organizations disable-policy-type --root-id "$root_id" --policy-type TAG_POLICY
```
