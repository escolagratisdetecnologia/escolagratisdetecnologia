# Deploy, reexecução e rollback

Como a aplicação chega a dev e prod, e o que fazer quando algo dá errado.

## Como funciona

1. Toda mudança entra por PR na `main`. O merge dispara o workflow `deploy` quando muda algo que vai para a AWS (`apps/web/`, `infra/`, `tools/deploy-site.sh`, `tools/smoke.sh`, dependências ou os próprios workflows de deploy). Mudança só de documentação não publica nada.
2. Job `dev` (environment `dev`, sem aprovação): `terraform apply` da raiz `live`, build e publicação do site (`tools/deploy-site.sh`, que espera a invalidação do CloudFront terminar) e smoke tests (`tools/smoke.sh`).
3. Job `prod`: só começa se o `dev` passou e fica esperando aprovação no environment `prod`. Para aprovar: Actions → execução do `deploy` → **Review deployments** → marque `prod` → **Approve and deploy**. Faz os mesmos passos do dev e ainda confere os redirects de `www.escolagratisdetecnologia.com.br`, `escolagratisdetecnologia.com` e `www.escolagratisdetecnologia.com` (ADR 0020).

Dentro do mesmo environment apenas um deploy é executado por vez; um deploy mais novo pendente substitui um mais antigo ainda aguardando, e um deploy em execução nunca é cancelado. Cada job tem limite de 45 minutos.

## Reexecutar

- **Rodar de novo do zero** (ex.: depois de liberar algo na AWS): Actions → **deploy** → **Run workflow** → branch `main`. Publica o último commit da `main`.
- **Repetir só o que falhou** (ex.: falha passageira de rede): abra a execução → **Re-run failed jobs**. Usa o mesmo commit.

## Rollback

**Padrão: reverter por PR.** Crie o revert do commit problemático e abra um PR:

```bash
git switch main && git pull
git switch -c revert/<assunto>
git revert <sha-do-commit>
git push -u origin revert/<assunto>
```

O merge do PR dispara um deploy novo (dev → aprovação → prod). Se o commit mexeu em `infra/`, leia o plano do PR de revert antes do merge: desfazer infraestrutura pode apagar ou recriar recursos.

**Emergência no site de prod** (página quebrada e não dá para esperar o pipeline): o bucket do site é versionado e guarda as versões antigas por 30 dias. Você executa, no seu terminal, para cada arquivo afetado:

```bash
export AWS_PROFILE=egt-prod
bucket="$(infra/tf live prod output -raw site_bucket_name)"
distribution="$(infra/tf live prod output -raw distribution_id)"
key=index.html   # arquivo afetado (ex.: 404.html)
aws s3api list-object-versions --bucket "$bucket" --prefix "$key" \
  --query "Versions[?Key=='$key'].[VersionId,LastModified,IsLatest]" --output table
aws s3api copy-object --bucket "$bucket" --key "$key" --copy-source "$bucket/$key?versionId=<versao-boa>"
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*'
```

A cópia mantém o tipo e o cache da versão antiga, e os assets de `_astro/` antigos continuam no bucket, então o HTML restaurado funciona. Em seguida, abra o PR de revert: senão o próximo deploy publica o problema de novo.

## Onde ver logs

- GitHub → Actions → **deploy** → execução → job `dev` ou `prod`. Os passos `terraform apply`, `tools/deploy-site.sh` e `tools/smoke.sh` mostram o que aconteceu.
- O plano Terraform de cada PR de infra fica no resumo do job `plan` do workflow `infra`.
- Na AWS (conta do ambiente): métricas do CloudFront e do WAF (`egt-<env>-edge-waf`) no console. Logs da API chegam na Fase 1.

## Se o smoke falhar

O `tools/smoke.sh` confere: a página inicial responde com o nome da Escola (até 6 tentativas, 20 s entre elas), `/nao-existe` devolve 404 e os cabeçalhos HSTS e CSP estão presentes. A mensagem no log diz qual conferência falhou.

1. Abra a URL no navegador ou rode `tools/smoke.sh https://dev.escolagratisdetecnologia.com` (ou a de prod) no seu terminal.
2. Falha passageira (rede, timeout)? **Re-run failed jobs** uma vez.
3. Falha real no `dev`: o `prod` não roda, então produção está protegida. Corrija por PR.
4. Falha real no `prod`: produção pode estar quebrada. Faça o rollback (PR de revert; se for urgente, a restauração de emergência acima).
5. No primeiro deploy, confira DNS e certificado (`docs/runbooks/bootstrap-aws.md`, passos 7 e 9).

Se o `terraform apply` falhar, o site não é publicado: leia o erro no passo e corrija por PR. Se um job cancelado deixou o lock do estado preso (`Error acquiring the state lock`) e nenhum outro deploy está rodando, libere com `infra/tf live <env> force-unlock <LOCK_ID>`, usando o perfil da conta.
