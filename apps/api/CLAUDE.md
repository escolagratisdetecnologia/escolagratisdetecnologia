# apps/api — API Hono

- **Composição:** `createApp(deps)` em `src/app.ts` recebe `AppDeps` e monta middlewares e rotas. As dependências são: config, logger, repositórios de progresso e de perfil, catálogo de progresso, `checkDatabase`, `identity` e `now`. Cada recurso fica em `src/routes/<recurso>.ts` (`health`, `auth`, `me`, `progress`), exportando uma função que recebe só as dependências que usa e devolve um `Hono`.
- **Entradas finas:** elas só montam as dependências.
  - `src/lambda.ts`: na AWS, com DynamoDB e Cognito.
  - `src/server.ts`: no ambiente local, com DynamoDB Local ou memória (via `src/local.ts`) e o provedor de identidade local. Antes de conectar a qualquer coisa, chama `requireLocal`: o servidor local nunca roda fora de `APP_ENV=local`, e `requireLocal` também recusa um endpoint de DynamoDB que não seja loopback; o servidor escuta só em `localhost`.
  - `src/triggers.ts`: os gatilhos do Cognito, em outra Lambda do mesmo build. O gatilho de pré-cadastro vincula o Google à conta do e-mail; o de mensagem escreve os e-mails dos códigos em pt-BR.
- **Configuração:** só `src/config.ts` lê `process.env` (`loadConfig`). Fora do local, são obrigatórias `APP_VERSION`, `TABLE_NAME`, `SITE_ORIGIN`, `ORIGIN_VERIFY_SECRET`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `USER_POOL_CLIENT_SECRET` e `AUTH_DOMAIN`. Localmente, `MAILPIT_URL` e `FAKE_GOOGLE_ISSUER` têm como padrão os endereços do `docker-compose.yml`. O resto do código recebe `AppConfig` por parâmetro.
- **Identidade (ADR 0024):** as rotas falam com `IdentityProvider` (`src/identity.ts`), nunca com o Cognito direto. Há duas implementações:
  - `src/identity/cognito.ts`: na AWS, com chamadas `Admin*` e SECRET_HASH. Para um e-mail novo, faz o `SignUp` sem senha; para um e-mail que já tem conta, pede o código de login. Os refresh tokens giram.
  - `src/identity/local.ts`: códigos no Mailpit e no terminal, Google de mentira (mock-oauth2-server) e tokens assinados com uma chave em memória.

  Mudou o login? Mude as duas implementações e os testes de cada uma.

- **Sessão:** os cookies são os de `src/session.ts` (`egt_at`, `egt_rt`, `egt_hint`, `egt_login`, `egt_oauth`). Sempre `SameSite=Lax`, sem `Domain` e `Secure` fora do local. Tokens nunca vão no corpo das respostas nem nos logs.
- **Erros:** sempre `{ error: { code, message } }` (`apiError` em `src/errors.ts`), com `code` em snake_case inglês e `message` em pt-BR no tom da Escola. Os códigos são:
  - 400: `invalid_request` (zod), `invalid_origin`, `invalid_code`, `login_expired` e `too_young`.
  - 401 `unauthenticated` e 404 `not_found`.
  - 409: `profile_required` e `profile_exists`.
  - 413 `payload_too_large`, 429 `rate_limited` e 500 `internal_error`.
  - O health responde 503 quando o banco não responde.
- **Nunca 403 pelo CloudFront:** a borda troca qualquer 403 pela página 404 do site (ADR 0022). Só o acesso direto sem `x-origin-verify` recebe 403. Para recusar algo, use 400, 401, 404 ou 409.
- **Segurança:** mudanças (tudo que não é GET, HEAD ou OPTIONS) exigem `Origin` igual ao site (CSRF). O corpo vai até 8 KB, o limite do WAF. As respostas levam `Cache-Control: no-store`.
- **Login:** as rotas pessoais usam `requireIdentity(identity)` (cookie `egt_at`) e leem `c.var.identity.sub`. As de estudo usam também `requireProfile(profiles)`: o cadastro tem de estar completo, com a idade conferida e os termos aceitos.
- **Dados:** pelos repositórios de `@egt/db` (ElectroDB), nunca o SDK do DynamoDB direto nas rotas.
  - O progresso só guarda cursos e aulas do catálogo: `catalog`, embutido no build a partir de `content/`, e `keepKnownProgress` de `@egt/core`.
  - Precisa de outra ação no DynamoDB ou no Cognito? Atualize a política da Lambda e o teste dela em `infra/modules/api/` no mesmo PR.
- **Testes:** Vitest com `app.request()`, um arquivo por rota em `test/`, nada de rede real.
  - `testApp()` (`test/helpers.ts`) usa memória e `createFakeIdentity` (`test/fake-identity.ts`). O cookie `egt_at=access.<sub>` faz o papel do login, e Ana e Bia já têm cadastro.
  - O adaptador do Cognito é testado com um cliente falso do SDK e tokens assinados no teste.
  - `test/bundle.test.ts` carrega o bundle de verdade num Node separado.
  - Os testes com DynamoDB Local rodam com `DYNAMODB_ENDPOINT` (na CI, sempre).
- **Logs:** Powertools Logger (`src/logger.ts`), JSON em inglês. Nunca registre corpo de requisição, e-mail, IP, código de login ou token.
- **Bundle:** `node scripts/build.ts` (esbuild) gera, para Node 24, em ESM, minificados e com source map:
  - `dist/lambda.mjs`: a API, com o catálogo de progresso.
  - `dist/triggers.mjs`: os gatilhos do Cognito.

  Os dois **incluem o AWS SDK**, na versão do lockfile. O banner com `createRequire` existe porque o ElectroDB é CommonJS. O Terraform empacota `dist/` para as duas Lambdas. Mantenha as dependências enxutas, porque o tamanho do bundle afeta o cold start: hoje são ~1,4 MB (~360 KB em gzip), e a ADR 0005 manda revisar acima de 5 MB.
