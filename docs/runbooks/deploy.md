# Deploy, reexecução e rollback

Como a aplicação chega a dev e prod, e o que fazer quando algo dá errado.

## Como funciona

Antes do primeiro deploy das contas de alunos (Fase 1C), prepare o Google e o GitHub como em `docs/runbooks/contas.md`: sem `GOOGLE_CLIENT_ID_*` e `GOOGLE_CLIENT_SECRET_*`, o plano e o deploy falham.

1. Toda mudança entra por PR na `main`. O merge dispara o workflow `deploy` quando muda algo que vai para a AWS (`apps/web/`, `apps/api/`, `content/`, `packages/`, `infra/`, `tools/deploy-site.sh`, `tools/smoke.sh`, dependências ou os próprios workflows de deploy). Mudança só de documentação não publica nada.
2. Job `dev` (environment `dev`, sem aprovação): build da API (`apps/api/dist`, que o Terraform empacota na Lambda), `terraform apply` da raiz `live`, build e publicação do site (`tools/deploy-site.sh`, que espera a invalidação do CloudFront terminar; dev mostra os cursos em rascunho, `SITE_DRAFTS=true`, e prod mostra só os publicados) e smoke tests (`tools/smoke.sh`, que também confere a API). Por fim, confere que o endereço direto do API Gateway recusa o acesso (403).
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

## Service worker: reverter

O site instala um service worker (`/sw.js`, gerado no build) que guarda o app e as páginas visitadas. Se um deploy publicar um service worker com defeito, quem já o instalou continua com ele até receber outro, então reverter o código nem sempre basta. Abra um PR que, por um deploy, troque o `sw.js` gerado por um que se desinstala e apaga os caches (por exemplo, fazendo a integração `apps/web/integrations/service-worker.ts` escrever este arquivo no lugar do gerado pelo Workbox):

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })) {
        client.navigate(client.url);
      }
    })(),
  );
});
```

Depois que o deploy chegar a prod (e o CloudFront invalidar), os aparelhos trocam para esse arquivo na próxima visita e voltam a carregar tudo da rede. Corrija o service worker por PR e volte ao gerado.

O navegador precisa buscar o novo `sw.js` sem cache: o `tools/deploy-site.sh` já o publica com `max-age=0` e o deploy invalida o CloudFront.

Limitação conhecida: uma página salva para uso offline antes de um deploy de código pode abrir sem estilos offline depois dele, porque o precache troca os arquivos antigos de `_astro/` (nomes com hash). Deploys só de conteúdo mantêm os hashes e não causam isso.

## Onde ver logs

- GitHub → Actions → **deploy** → execução → job `dev` ou `prod`. Os passos `terraform apply`, `tools/deploy-site.sh` e `tools/smoke.sh` mostram o que aconteceu.
- O plano Terraform de cada PR de infra fica no resumo do job `plan` do workflow `infra`.
- Na AWS (conta do ambiente): métricas do CloudFront e do WAF (`egt-<env>-edge-waf`) no console.
- Logs da API (CloudWatch → Log groups): `/aws/lambda/egt-<env>-api-handler` (JSON do Powertools) e `/aws/apigateway/egt-<env>-api-http` (acessos, sem IP). Ficam 30 dias.
- Logs dos gatilhos do Cognito (vínculo do Google e e-mails com código): `/aws/lambda/egt-<env>-auth-triggers`. Problemas de login: `docs/runbooks/contas.md`.

## Alarmes da API

Os alarmes `egt-<env>-api-5xx`, `egt-<env>-api-lambda-errors` e `egt-<env>-api-lambda-throttles` disparam com uma ocorrência em 5 minutos e avisam por e-mail os endereços do Secret `ALERT_EMAILS` (tópico SNS `egt-<env>-observability-alerts`, ADR 0023).

Depois do primeiro deploy da Fase 1B, e sempre que o Secret mudar, cada endereço recebe da AWS dois e-mails "AWS Notification - Subscription Confirmation": um da conta de dev e um da de prod. Clique em **Confirm subscription**: sem isso, nenhum alarme chega. Para conferir, no console da conta: SNS → Topics → `egt-<env>-observability-alerts` → Subscriptions (status **Confirmed**).

Chegou um alarme? Abra os logs da Lambda no horário do alarme (CloudWatch → Logs Insights, log group `/aws/lambda/egt-<env>-api-handler`, filtro `level = "ERROR"`), corrija por PR e, se for urgente, faça o rollback.

## Trocar o segredo de origem da API

O CloudFront envia à API o cabeçalho `x-origin-verify` com um segredo gerado pelo Terraform (ADR 0022). Para trocá-lo (por exemplo, se aparecer num log ou print), abra um PR que aumenta `origin_verify_version` no `module "api"` de `infra/live/main.tf`. O deploy gera um segredo novo e atualiza a Lambda e o CloudFront. Até o CloudFront propagar, por alguns minutos, a API pode responder com a página 404: prefira um horário de pouco uso.

## Se o smoke falhar

O `tools/smoke.sh` confere: a página inicial responde com o nome da Escola (até 6 tentativas, 20 s entre elas), `/nao-existe` devolve 404, `/api/health` responde `status: ok` com a versão do commit publicado, `/api/nao-existe` devolve 404 em JSON, `/api/me` sem sessão devolve 401 em JSON, `/api/auth/google` redireciona para o `/authorize` do domínio de login e os cabeçalhos HSTS e CSP estão presentes. A mensagem no log diz qual conferência falhou.

Se a falha for na API:

- `/api/health` com `"database":"unavailable"` (503): a Lambda não conseguiu ler a tabela. Veja os logs da API.
- `/api/nao-existe` em HTML: a borda voltou a trocar erros da API pela página 404 (ADR 0022). Confira o `custom_error_response` do módulo `edge`.
- `/api/me` ou `/api/auth/google` falhando: a Lambda não recebeu as configurações do Cognito (variáveis `USER_POOL_*` e `AUTH_DOMAIN`) ou o deploy rodou sem os valores do Google (`docs/runbooks/contas.md`).

1. Abra a URL no navegador ou rode `tools/smoke.sh https://dev.escolagratisdetecnologia.com` (ou a de prod) no seu terminal.
2. Falha passageira (rede, timeout)? **Re-run failed jobs** uma vez.
3. Falha real no `dev`: o `prod` não roda, então produção está protegida. Corrija por PR.
4. Falha real no `prod`: produção pode estar quebrada. Faça o rollback (PR de revert; se for urgente, a restauração de emergência acima).
5. No primeiro deploy, confira DNS e certificado (`docs/runbooks/bootstrap-aws.md`, passos 7 e 9).

Se o `terraform apply` falhar, o site não é publicado: leia o erro no passo e corrija por PR. Se um job cancelado deixou o lock do estado preso (`Error acquiring the state lock`) e nenhum outro deploy está rodando, libere com `infra/tf live <env> force-unlock <LOCK_ID>`, usando o perfil da conta.
