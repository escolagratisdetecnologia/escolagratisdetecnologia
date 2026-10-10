# Fase 1C — Contas de alunos: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o login de verdade dos alunos (código por e-mail e Google, sem senha) no Cognito Essentials, atrás da API, com cadastro (idade mínima e aceite dos termos), progresso sincronizado entre aparelhos, área Eu com baixar e excluir os dados, e rascunhos de termos de uso e política de privacidade.

**Architecture:**
- **API (BFF, ADR 0024):** a API Hono faz o login sem expor tokens ao navegador. As rotas `/api/auth/*` falam com uma interface `IdentityProvider`, que tem duas implementações:
  - Cognito na Lambda: chamadas `Admin*`, `SignUp` sem senha para e-mail novo e refresh tokens que giram.
  - Provedor local: códigos no Mailpit e no terminal, um Google de mentira (mock-oauth2-server) e tokens assinados em memória.
- **Sessão:** em cookies HttpOnly, sem `Domain`. Rotas de estudo exigem cadastro completo. O progresso só guarda aulas do catálogo, embutido no build a partir de `content/`.
- **Gatilhos do Cognito:** uma Lambda no mesmo build vincula o primeiro login com Google à conta do mesmo e-mail (criando-a se preciso) e escreve os e-mails dos códigos em pt-BR.
- **Infra:**
  - O módulo `auth` cria o user pool, o cliente, o Google, o SES do domínio (DKIM, MAIL FROM e DMARC) e a Lambda dos gatilhos.
  - O `edge` ganha o domínio `auth.<domínio>` e um limite do WAF só para `/api/auth/*`.
- **Site:** sincroniza o progresso um curso por pedido. Ganha as páginas `/entrar/`, `/entrar/cadastro/`, `/termos/` e `/privacidade/`, e a seção da conta na aba Eu.

**Tech Stack:** Hono 4, zod 4, AWS SDK v3 (`@aws-sdk/client-cognito-identity-provider`), `aws-jwt-verify` 5, `jose` 6 (só local e testes), ElectroDB 3, Preact 10 / Astro 7, Vitest 5, Playwright, Mailpit e mock-oauth2-server (Docker), Terraform 1.16 (providers `aws` ~> 6.67 e `archive` ~> 2.8).

**Spec:** `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md` (§3.4–§3.6, §5, §13 e §14), mais os portões do 1C registrados na revisão final da Fase 1B. Escopo decidido pelo mantenedor em 2026-10-10:
- **Entram:** contas de alunos (e-mail e Google), com rascunhos de termos e privacidade.
- **Ficam para o plano seguinte:** o pool da equipe com SMS MFA e as verificações R1 e R2.
- **Regra de idade:** só o ano de nascimento, com a regra conservadora (só entra quem nasceu até `ano atual − 13`).
- **Ao sair:** sair da conta apaga o progresso do aparelho.

## Global Constraints

**Versões e imagens**
- Node `24.21.0`; pnpm `10.34.6`; TypeScript `~6.0.3`.
- API: `hono` `^4.13.13`, `zod` `^4.6.5`, `@aws-sdk/client-cognito-identity-provider` `^3.1149.0` (a mesma linha do SDK do DynamoDB), `aws-jwt-verify` `^5.2.1`. `jose` `^6.2.12` só como devDependency da API.
- Imagens Docker (as mesmas no `docker-compose.yml` e na CI):
  - `amazon/dynamodb-local:3.3.1@sha256:ff89bd48ff32cd8d9be5fee8873b65b8854dc408f1afe881be6eb00247bc0dab`
  - `axllent/mailpit:v1.31.2@sha256:74d609a42ec279aa63c6b4622a6fa9b5408d1ad5b1d76a1c4be40a265ce0863d`
  - `ghcr.io/navikt/mock-oauth2-server:6.0.3@sha256:250e04413e2fc7877d4cb38ecd74d3ecb1a40aae3a9bdad96d1c593e59fee95e`
- Terraform `1.16.5`; providers `hashicorp/aws` `~> 6.67` e `hashicorp/archive` `~> 2.8`.

**Nomes e regras da AWS**
- Nomes:
  - pool `egt-<env>-auth-learners`, cliente `egt-<env>-auth-web`;
  - Lambda, role e log group `egt-<env>-auth-triggers` (`/aws/lambda/egt-<env>-auth-triggers`);
  - domínio de login `auth.<domínio do site>`;
  - regra do WAF `rate-limit-auth`, prioridade 35, 50 requisições por IP a cada 5 minutos em `/api/auth/*`, 429 em JSON.
- Tags: `Component = "auth"` em todo recurso tagueável do módulo `auth`, e o user pool também com `DataClassification = "personal"`. Metadados que vão para a AWS (`description`, `comment`, remetente do e-mail) em inglês e só ASCII.

**Sessão, idade e erros**
- Cookies (spec §5.2, ADR 0024), todos `SameSite=Lax`, sem `Domain`, `Secure` fora do local:
  - `egt_at`: `Path=/api`, `Max-Age` = validade do access token (3600), HttpOnly.
  - `egt_rt`: `Path=/api/auth`, 30 dias, HttpOnly.
  - `egt_hint=1`: `Path=/`, 30 dias, legível pelo JavaScript.
  - `egt_login`: `Path=/api/auth`, 15 minutos, HttpOnly.
  - `egt_oauth`: `Path=/api/auth`, 10 minutos, HttpOnly.
- Idade: `MIN_AGE = 12`. `latestBirthYear(now) = ano UTC de now − 13`; só se cadastra quem nasceu até esse ano. `TERMS_VERSION = '2026-10-10'`.
- Erros da API sempre `{ error: { code, message } }`, `message` em pt-BR. **A API nunca responde 403 pelo CloudFront** (a borda troca 403 pela página 404). Os códigos são:
  - 400: `invalid_request`, `invalid_origin`, `invalid_code`, `login_expired` e `too_young`.
  - 401 `unauthenticated` e 404 `not_found`.
  - 409: `profile_required` e `profile_exists`.
  - 413 `payload_too_large`, 429 `rate_limited` e 500 `internal_error`.
- Corpo até 8 KB; mudanças exigem `Origin` do site; respostas `no-store` (já na Fase 1B).
- Privacidade: nada de IP, e-mail, corpo de requisição, código de login ou token nos logs. Os valores do Google nunca vão para o repositório: o Client ID vem das GitHub Variables `GOOGLE_CLIENT_ID_DEV`/`_PROD`, e o secret dos Secrets `GOOGLE_CLIENT_SECRET_DEV`/`_PROD`.

**Terraform e testes**
- Ninguém aplica Terraform neste plano: as tarefas só rodam `fmt`, `validate`, `test`, `tflint` e `trivy`. O `apply` acontece no deploy, depois do merge.
- `terraform` vem do mise (`$(mise which terraform)` a partir da raiz do repositório). `validate` e `test` sempre com dados isolados: `export TF_DATA_DIR="$(mktemp -d)" AWS_PROFILE= AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null` antes do `init -backend=false`. Para reaproveitar providers: `export TF_PLUGIN_CACHE_DIR="$HOME/.cache/terraform-plugins"`.
- Testes com DynamoDB Local: `pnpm db:up` e `DYNAMODB_ENDPOINT=http://localhost:8000`. Os testes e2e de login pedem `pnpm db:up` (Mailpit e Google de mentira). Sem os serviços, os dois tipos de teste são pulados localmente; na CI (`CI=true`), sempre rodam.

**Idioma e processo**
- Idioma: docs, commits e PRs em pt-BR; identificadores, comentários técnicos, logs e mensagens de exceção em inglês; texto exibido a pessoas (respostas da API, páginas, e-mails, saída do servidor local) em pt-BR, no tom da Escola.
- TDD em toda lógica (teste que falha → implementação mínima → passa → commit). Commits em Conventional Commits pt-BR.
- Antes de `pnpm lint`, rode `pnpm format`. Para Terraform, `terraform fmt -recursive infra`.
- Em shells não interativos: `export PATH="$HOME/.local/share/mise/shims:$PATH"`. Os comandos assumem a raiz do repositório como diretório atual.

## Mapa de arquivos

| Caminho | Responsabilidade |
|---|---|
| `packages/core/src/progress.ts` | Ganha `ProgressCatalog`, `isKnownLesson` e `keepKnownProgress` |
| `packages/core/src/account.ts` | `MIN_AGE`, `TERMS_VERSION`, `latestBirthYear` |
| `packages/db/src/profile-repository.ts`, `memory-profile.ts`, `dynamo-profile.ts` | Perfil do aluno (`USER#<sub>` / `PROFILE`) |
| `packages/db/src/*-progress.ts` | Ganham `deleteAll` (exclusão da conta) |
| `apps/api/src/catalog.ts` | Catálogo de progresso lido de `content/` (build e servidor local) |
| `apps/api/src/identity.ts` | Interface `IdentityProvider`, `Tokens`, `RateLimitedError` |
| `apps/api/src/identity/cognito.ts` | Cognito na AWS (códigos, Google, sessões, e-mail, exclusão) |
| `apps/api/src/identity/local.ts` | Provedor local: Mailpit, Google de mentira, tokens em memória |
| `apps/api/src/session.ts` | Cookies da sessão |
| `apps/api/src/auth.ts` | `requireIdentity` e `requireProfile` |
| `apps/api/src/routes/auth.ts`, `routes/me.ts` | Login, renovação e saída; conta (cadastro, exportar, excluir) |
| `apps/api/src/triggers.ts` | Gatilhos do Cognito (vínculo do Google, e-mails em pt-BR) |
| `apps/api/src/local.ts`, `server.ts` | `requireLocal` (trava do servidor local) e o provedor local |
| `docker-compose.yml` | Ganha Mailpit e o Google de mentira |
| `infra/modules/auth/` | User pool, cliente, Google, SES do domínio, Lambda dos gatilhos |
| `infra/modules/edge/` | Ganha o domínio `auth.<domínio>` e o limite do WAF para o login |
| `infra/modules/api/` | Ganha as variáveis do Cognito e as permissões novas |
| `infra/live/` | Liga o `auth` e passa o Google (variáveis obrigatórias) |
| `.github/workflows/` | Google nos planos e deploys; Mailpit e Google de mentira na CI |
| `apps/web/src/lib/api.ts`, `session.ts`, `progress-sync.ts`, `sign-in.ts` | Cliente da API, sessão, sincronização, fim do login |
| `apps/web/src/islands/Login.tsx`, `CompleteProfile.tsx`, `Account.tsx` | Entrar, cadastro e a conta na aba Eu |
| `apps/web/src/pages/entrar/`, `termos.astro`, `privacidade.astro` | Páginas novas |
| `apps/web/e2e/account.spec.ts` | Login, cadastro, sincronização, sair, exportar e excluir |
| `docs/adr/0024-contas-de-alunos.md`, `docs/runbooks/contas.md` | Decisão e operação das contas |

## Rotas da API

| Rota | Quem pode | Resposta |
|---|---|---|
| `POST /api/auth/email/start` `{ email }` | qualquer um (do site) | 200 `{ status: 'code_sent' }`, igual para conta nova ou existente; cookie `egt_login` |
| `POST /api/auth/email/verify` `{ code }` (6 a 8 dígitos) | quem pediu o código | 200 `{ profileComplete }` e a sessão; 400 `invalid_code` ou `login_expired` |
| `GET /api/auth/google?next=<caminho>` | qualquer um | 302 para o Google (state e PKCE no cookie `egt_oauth`) |
| `GET /api/auth/callback` | volta do Google | 302 para `/entrar/?entrou=google&next=…`, para `/api/auth/google` (uma nova tentativa, quando o Cognito acabou de vincular) ou para `/entrar/?erro=google` |
| `POST /api/auth/refresh` | com `egt_rt` | 200 e tokens novos; 401 limpa a sessão |
| `POST /api/auth/logout` | qualquer um | 200, revoga o refresh token e limpa os cookies |
| `GET /api/me` | logado | `{ email, profile }` (`profile` é `null` antes do cadastro) |
| `PATCH /api/me` `{ birthYear, acceptTerms: true }` | logado, sem cadastro | 201 `{ profile }`; 400 `too_young` (apaga a conta); 409 `profile_exists` |
| `GET /api/me/export` | logado | JSON para download (conta, perfil, progresso) |
| `DELETE /api/me` | logado | 200, apaga progresso, perfil e conta, e limpa os cookies |
| `GET`/`PUT`/`POST /api/progress…` | logado **com cadastro** | como na 1B; 409 `profile_required` sem cadastro; 404 para aula fora do catálogo; a mescla descarta o que o catálogo não conhece |

## Pré-requisitos do mantenedor (antes de abrir o PR)

As tarefas de código não precisam deles, mas o plano Terraform do PR e o deploy precisam. A hora é depois da Task 15, que cria o `docs/runbooks/contas.md` com o passo a passo, e antes de abrir o PR. Quem executa o plano avisa o mantenedor quando chegar esse momento. Resumo:

1. Clientes OAuth do Google (dev e prod) com as URIs `https://auth.dev.escolagratisdetecnologia.com/oauth2/idpresponse` e `https://auth.escolagratisdetecnologia.com.br/oauth2/idpresponse`, e o app do Google publicado.
2. GitHub: Variables `GOOGLE_CLIENT_ID_DEV` e `GOOGLE_CLIENT_ID_PROD`, Secrets `GOOGLE_CLIENT_SECRET_DEV` e `GOOGLE_CLIENT_SECRET_PROD`.
3. SES no sandbox: verificar o próprio e-mail nas contas dev e prod (região São Paulo) para testar o código por e-mail. A saída do sandbox é portão do lançamento (spec §20) e pode esperar.

## Fora deste plano

- Pool da equipe com SMS MFA e as verificações R1 (celular de usuário federado) e R2 (SMS para o Brasil): próximo plano.
- Nome no certificado, celular verificado e UTM de primeiro toque no perfil: Fases 2 e 5.
- Saída do sandbox do SES e verificação do app do Google: portões do lançamento (spec §20).
- Canal de atendimento e controladora dos dados nos textos legais: definidos antes do lançamento (os rascunhos já dizem isso).

---

### Task 1: Progresso limitado às aulas do catálogo

Portão da revisão da 1B: hoje um aluno pode gravar slugs inventados sem limite. A API passa a conhecer as aulas e o número de perguntas de cada curso, embutidos no bundle no build a partir de `content/`. Daí em diante, só guarda o que o catálogo conhece.

**Files:**
- Modify: `packages/core/src/progress.ts`, `packages/core/test/progress.test.ts`
- Create: `apps/api/src/catalog.ts`, `apps/api/test/catalog.test.ts`
- Modify: `apps/api/package.json`, `apps/api/scripts/build.ts`, `apps/api/src/app.ts`, `apps/api/src/lambda.ts`, `apps/api/src/server.ts`, `apps/api/src/routes/progress.ts`, `apps/api/test/helpers.ts`, `apps/api/test/progress.test.ts`

**Interfaces:**
- Consumes: `loadCatalog(contentDir)` de `@egt/content` (curso → `modules[].lessons[]` com `slug` e `frontmatter.quiz`); `CourseProgress` de `@egt/core`.
- Produces:
  - Em `@egt/core`:
    - `type ProgressCatalog = Record<string, Record<string, number>>` (curso → aula → número de perguntas);
    - `isKnownLesson(catalog, course, lesson): boolean`;
    - `keepKnownProgress(courses, catalog): Record<string, CourseProgress>`.
  - Na API:
    - `loadProgressCatalog(contentDir): Promise<ProgressCatalog>` (`src/catalog.ts`);
    - `AppDeps.catalog: ProgressCatalog`;
    - `ProgressDeps.catalog`;
    - `CATALOG` em `test/helpers.ts`;
    - o global de build `__PROGRESS_CATALOG__` (só no `lambda.ts`).

- [ ] **Step 1: Teste das regras do catálogo**

Em `packages/core/test/progress.test.ts`, importe `isKnownLesson`, `keepKnownProgress` e o tipo `ProgressCatalog`, e acrescente os blocos no fim:

```diff
--- a/packages/core/test/progress.test.ts
+++ b/packages/core/test/progress.test.ts
@@ -3,11 +3,14 @@ import {
   completeLesson,
   courseStatus,
   emptyProgress,
+  isKnownLesson,
+  keepKnownProgress,
   mostRecentCourse,
   parseProgress,
   recordCorrectAnswer,
   visitLesson,
   type CourseOutline,
+  type ProgressCatalog,
 } from '../src/index.ts';
 
 const NOW = new Date('2026-10-09T12:00:00.000Z');
@@ -168,3 +171,70 @@ describe('mostRecentCourse', () => {
     expect(mostRecentCourse(emptyProgress(), [outline])).toBeUndefined();
   });
 });
+
+describe('keepKnownProgress', () => {
+  const catalog: ProgressCatalog = { 'site-com-ia': { 'boas-vindas': 1, escolha: 3 } };
+
+  it('drops unknown courses, lessons and answers', () => {
+    const kept = keepKnownProgress(
+      {
+        'site-com-ia': {
+          completedLessons: ['boas-vindas', 'aula-removida'],
+          correctAnswers: ['boas-vindas#0', 'boas-vindas#1', 'escolha#2', 'aula-removida#0'],
+          lastLesson: 'aula-removida',
+          updatedAt: NOW.toISOString(),
+        },
+        'curso-removido': {
+          completedLessons: ['x'],
+          correctAnswers: [],
+          updatedAt: NOW.toISOString(),
+        },
+      },
+      catalog,
+    );
+
+    expect(kept).toEqual({
+      'site-com-ia': {
+        completedLessons: ['boas-vindas'],
+        correctAnswers: ['boas-vindas#0', 'escolha#2'],
+        updatedAt: NOW.toISOString(),
+      },
+    });
+  });
+
+  it('keeps a known last lesson and ignores inherited object keys', () => {
+    const kept = keepKnownProgress(
+      {
+        'site-com-ia': {
+          completedLessons: ['constructor'],
+          correctAnswers: ['toString#0'],
+          lastLesson: 'escolha',
+          updatedAt: NOW.toISOString(),
+        },
+        constructor: { completedLessons: [], correctAnswers: [], updatedAt: NOW.toISOString() },
+      },
+      catalog,
+    );
+
+    expect(kept).toEqual({
+      'site-com-ia': {
+        completedLessons: [],
+        correctAnswers: [],
+        lastLesson: 'escolha',
+        updatedAt: NOW.toISOString(),
+      },
+    });
+  });
+});
+
+describe('isKnownLesson', () => {
+  it('knows only the catalog lessons of each course', () => {
+    const catalog: ProgressCatalog = { 'site-com-ia': { 'boas-vindas': 1 } };
+
+    expect(isKnownLesson(catalog, 'site-com-ia', 'boas-vindas')).toBe(true);
+    expect(isKnownLesson(catalog, 'site-com-ia', 'escolha')).toBe(false);
+    expect(isKnownLesson(catalog, 'python', 'boas-vindas')).toBe(false);
+    expect(isKnownLesson(catalog, 'site-com-ia', 'hasOwnProperty')).toBe(false);
+    expect(isKnownLesson(catalog, '__proto__', 'boas-vindas')).toBe(false);
+  });
+});
```

Run: `pnpm exec vitest run --project core`
Expected: FAIL (`keepKnownProgress` e `isKnownLesson` não existem).

- [ ] **Step 2: Implementar no `@egt/core`**

Em `packages/core/src/progress.ts`, logo antes de `visitLesson`:

```diff
--- a/packages/core/src/progress.ts
+++ b/packages/core/src/progress.ts
@@ -68,6 +68,50 @@ function update(
   };
 }
 
+/**
+ * What progress may hold: for each course, its lessons and how many quiz questions each one has.
+ * Built from content/ (the API embeds it at build time).
+ */
+export type ProgressCatalog = Record<string, Record<string, number>>;
+
+const ANSWER = /^(.+)#(\d{1,3})$/;
+
+const lessonsOf = (catalog: ProgressCatalog, course: string) =>
+  Object.hasOwn(catalog, course) ? catalog[course] : undefined;
+
+export function isKnownLesson(catalog: ProgressCatalog, course: string, lesson: string): boolean {
+  const lessons = lessonsOf(catalog, course);
+  return lessons !== undefined && Object.hasOwn(lessons, lesson);
+}
+
+/**
+ * Keeps only courses, lessons and quiz answers the catalog knows. Renamed or removed content and
+ * junk sent by a client are dropped, which also bounds how much a learner can store.
+ */
+export function keepKnownProgress(
+  courses: Record<string, CourseProgress>,
+  catalog: ProgressCatalog,
+): Record<string, CourseProgress> {
+  const known: Record<string, CourseProgress> = {};
+  for (const [slug, course] of Object.entries(courses)) {
+    const lessons = lessonsOf(catalog, slug);
+    if (lessons === undefined) continue;
+    const isLesson = (lesson: string) => Object.hasOwn(lessons, lesson);
+    known[slug] = {
+      completedLessons: course.completedLessons.filter(isLesson),
+      correctAnswers: course.correctAnswers.filter((answer) => {
+        const match = ANSWER.exec(answer);
+        return match !== null && isLesson(match[1]!) && Number(match[2]) < lessons[match[1]!]!;
+      }),
+      ...(course.lastLesson !== undefined && isLesson(course.lastLesson)
+        ? { lastLesson: course.lastLesson }
+        : {}),
+      updatedAt: course.updatedAt,
+    };
+  }
+  return known;
+}
+
 export function visitLesson(
   progress: Progress,
   course: string,
```

Run: `pnpm exec vitest run --project core`
Expected: PASS (14 testes).

- [ ] **Step 3: Dependências da API**

`apps/api/package.json` (o `@egt/core` vira dependência direta; o `@egt/content` só é usado no build e no servidor local):

```json
{
  "name": "@egt/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch --env-file-if-exists=../../.env src/server.ts",
    "build": "node scripts/build.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@aws-lambda-powertools/logger": "^2.36.0",
    "@egt/core": "workspace:*",
    "@egt/db": "workspace:*",
    "@hono/node-server": "^2.1.3",
    "hono": "^4.13.13",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@egt/content": "workspace:*",
    "@types/node": "^24.19.1",
    "esbuild": "^0.28.2",
    "typescript": "~6.0.3"
  }
}
```

Run: `pnpm install`
Expected: termina sem erro.

- [ ] **Step 4: Testes da API**

`apps/api/test/catalog.test.ts` (usa a pasta de exemplo do `@egt/content`):

```ts
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProgressCatalog } from '../src/catalog.ts';

const FIXTURE = fileURLToPath(
  new URL('../../../packages/content/test/fixtures/valid', import.meta.url),
);

describe('loadProgressCatalog', () => {
  it('lists the lessons of each course with their number of quiz questions', async () => {
    expect(await loadProgressCatalog(FIXTURE)).toEqual({
      'curso-teste': { 'boas-vindas': 1, 'no-seu-aparelho': 1, 'primeiro-passo': 1 },
    });
  });

  it('refuses content with problems', async () => {
    const broken = mkdtempSync(join(tmpdir(), 'egt-content-'));
    cpSync(FIXTURE, broken, { recursive: true });
    writeFileSync(join(broken, 'courses/curso-teste/course.yaml'), 'title: 1\n');

    await expect(loadProgressCatalog(broken)).rejects.toThrow(/content:check/);
  });
});
```

`apps/api/test/helpers.ts` ganha o catálogo de teste e o passa ao `createApp`:

```diff
--- a/apps/api/test/helpers.ts
+++ b/apps/api/test/helpers.ts
@@ -1,4 +1,5 @@
 import { Logger } from '@aws-lambda-powertools/logger';
+import type { ProgressCatalog } from '@egt/core';
 import { createMemoryProgressRepository } from '@egt/db';
 import { createApp, type AppDeps } from '../src/app.ts';
 import type { AppConfig } from '../src/config.ts';
@@ -6,6 +7,12 @@ import type { AppConfig } from '../src/config.ts';
 export const SITE = 'http://localhost:4321';
 export const NOW = new Date('2026-10-09T12:00:00.000Z');
 
+/** The courses and lessons the test app knows. */
+export const CATALOG: ProgressCatalog = {
+  site: { 'o-que-e-um-site': 1, a: 1, b: 1 },
+  planilhas: { x: 0 },
+};
+
 export const config: AppConfig = {
   environment: 'local',
   version: '9.9.9',
@@ -19,6 +26,7 @@ export function testApp(overrides: Partial<AppDeps> = {}) {
     config,
     logger: new Logger({ logLevel: 'SILENT' }),
     progress: createMemoryProgressRepository(),
+    catalog: CATALOG,
     checkDatabase: async () => {},
     authenticate: async (request) => {
       const sub = request.headers.get('x-test-user');
```

`apps/api/test/progress.test.ts` ganha dois testes, antes de `POST /merge joins the device progress…`:

```diff
--- a/apps/api/test/progress.test.ts
+++ b/apps/api/test/progress.test.ts
@@ -84,6 +84,42 @@ describe('progress routes', () => {
     });
   });
 
+  it('PUT answers 404 for lessons that are not in the catalog', async () => {
+    const app = testApp();
+
+    for (const path of ['/api/progress/site/lessons/aula-nova', '/api/progress/outro/lessons/a']) {
+      const res = await app.request(path, { method: 'PUT', headers: learner() });
+
+      expect(res.status).toBe(404);
+      expect(await res.json()).toEqual({
+        error: { code: 'not_found', message: 'Aula não encontrada.' },
+      });
+    }
+  });
+
+  it('POST /merge keeps only courses, lessons and answers of the catalog', async () => {
+    const res = await testApp().request('/api/progress/merge', {
+      method: 'POST',
+      headers: learner(),
+      body: JSON.stringify({
+        version: 1,
+        courses: {
+          site: {
+            ...course(['a', 'aula-removida'], NOW.toISOString(), 'aula-removida'),
+            correctAnswers: ['a#0', 'a#1', 'aula-removida#0'],
+          },
+          'curso-removido': course(['x'], NOW.toISOString()),
+        },
+      }),
+    });
+
+    expect(res.status).toBe(200);
+    expect(await res.json()).toEqual({
+      version: 1,
+      courses: { site: { ...course(['a'], NOW.toISOString()), correctAnswers: ['a#0'] } },
+    });
+  });
+
   it('POST /merge joins the device progress with the account and returns everything', async () => {
     const app = testApp();
     await app.request('/api/progress/site/lessons/a', { method: 'PUT', headers: learner() });
```

Run: `pnpm exec vitest run --project api`
Expected: FAIL (`src/catalog.ts` não existe; o PUT de aula desconhecida ainda responde 200).

- [ ] **Step 5: Implementar na API**

`apps/api/src/catalog.ts`:

```ts
import { loadCatalog } from '@egt/content';
import type { ProgressCatalog } from '@egt/core';

/**
 * Lessons and quiz sizes of every course in content/, drafts included: the only progress the API
 * stores. Used by the bundle build and by the local server; the Lambda never reads content/.
 */
export async function loadProgressCatalog(contentDir: string): Promise<ProgressCatalog> {
  const { catalog, problems } = await loadCatalog(contentDir);
  if (problems.length > 0) {
    throw new Error(`content/ has ${problems.length} problem(s); run pnpm content:check.`);
  }
  return Object.fromEntries(
    catalog.courses.map((course) => [
      course.slug,
      Object.fromEntries(
        course.modules.flatMap((module) =>
          module.lessons.map((lesson) => [lesson.slug, lesson.frontmatter.quiz.length]),
        ),
      ),
    ]),
  );
}
```

`apps/api/scripts/build.ts` (o catálogo entra no bundle como `__PROGRESS_CATALOG__`):

```ts
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { loadProgressCatalog } from '../src/catalog.ts';

const CONTENT_DIR = fileURLToPath(new URL('../../../content', import.meta.url));

/**
 * Bundles the Lambda handler with every dependency, AWS SDK included (versions from our lockfile),
 * and the progress catalog read from content/.
 */
export async function buildLambda(outdir: string): Promise<void> {
  const catalog = await loadProgressCatalog(CONTENT_DIR);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/lambda.ts', import.meta.url))],
    outfile: `${outdir}/lambda.mjs`,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    minify: true,
    sourcemap: true,
    sourcesContent: false,
    define: { __PROGRESS_CATALOG__: JSON.stringify(catalog) },
    // ElectroDB is CommonJS and calls require(): give the ESM bundle a real one.
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });
}

if (import.meta.main) {
  await buildLambda(fileURLToPath(new URL('../dist', import.meta.url)));
}
```

`apps/api/src/app.ts`:

```ts
import type { Logger } from '@aws-lambda-powertools/logger';
import type { ProgressCatalog } from '@egt/core';
import type { ProgressRepository } from '@egt/db';
import { Hono } from 'hono';
import type { Authenticate } from './auth.ts';
import type { AppConfig } from './config.ts';
import { apiError } from './errors.ts';
import { healthRoutes } from './routes/health.ts';
import { progressRoutes } from './routes/progress.ts';
import { limitBody, noStore, requireOriginVerify, requireSiteOrigin } from './security.ts';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  progress: ProgressRepository;
  /** Courses and lessons the progress may hold (built from content/). */
  catalog: ProgressCatalog;
  checkDatabase: () => Promise<void>;
  authenticate: Authenticate;
  now?: () => Date;
}

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath('/api');
  app.use(requireOriginVerify(deps.config.originVerifySecret));
  app.use(noStore);
  app.use(requireSiteOrigin(deps.config.siteOrigin));
  app.use(limitBody);
  app.route('/health', healthRoutes(deps));
  app.route('/progress', progressRoutes(deps));
  app.notFound((c) => c.json(apiError('not_found', 'Rota não encontrada.'), 404));
  app.onError((error, c) => {
    deps.logger.error('unhandled_error', { error });
    return c.json(
      apiError('internal_error', 'Algo deu errado do nosso lado. Tenta de novo daqui a pouco.'),
      500,
    );
  });
  return app;
}
```

`apps/api/src/routes/progress.ts`:

```ts
import { isKnownLesson, keepKnownProgress, type ProgressCatalog } from '@egt/core';
import type { ProgressRepository } from '@egt/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireIdentity, type Authenticate, type AuthEnv } from '../auth.ts';
import { apiError } from '../errors.ts';

// Same slug rule as packages/content (course folders and lesson files).
const slug = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const answer = z
  .string()
  .max(110)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*#\d{1,3}$/);

const courseProgress = z.object({
  completedLessons: z.array(slug).max(200),
  correctAnswers: z.array(answer).max(1000),
  lastLesson: slug.optional(),
  updatedAt: z.iso.datetime(),
});

const mergeBody = z.object({
  version: z.literal(1),
  courses: z.record(slug, courseProgress).refine((courses) => Object.keys(courses).length <= 50),
});

const lessonParams = z.object({ course: slug, lesson: slug });

const invalidRequest = apiError(
  'invalid_request',
  'Os dados enviados não estão no formato esperado.',
);

export interface ProgressDeps {
  progress: ProgressRepository;
  authenticate: Authenticate;
  catalog: ProgressCatalog;
  now?: () => Date;
}

export function progressRoutes({
  progress,
  authenticate,
  catalog,
  now = () => new Date(),
}: ProgressDeps) {
  return new Hono<AuthEnv>()
    .use(requireIdentity(authenticate))
    .get('/', async (c) => c.json(await progress.get(c.var.identity.sub)))
    .put('/:course/lessons/:lesson', async (c) => {
      const params = lessonParams.safeParse(c.req.param());
      if (!params.success) return c.json(invalidRequest, 400);
      const { course, lesson } = params.data;
      if (!isKnownLesson(catalog, course, lesson)) {
        return c.json(apiError('not_found', 'Aula não encontrada.'), 404);
      }
      const at = now();
      const completed = {
        completedLessons: [lesson],
        correctAnswers: [],
        lastLesson: lesson,
        updatedAt: at.toISOString(),
      };
      return c.json(await progress.merge(c.var.identity.sub, { [course]: completed }, at));
    })
    .post('/merge', async (c) => {
      const body = mergeBody.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json(invalidRequest, 400);
      // Unknown courses and lessons (renamed content, junk) are dropped, not refused: a device
      // with old progress must still sync the rest.
      const courses = keepKnownProgress(body.data.courses, catalog);
      return c.json(await progress.merge(c.var.identity.sub, courses, now()));
    });
}
```

`apps/api/src/lambda.ts`:

```ts
import type { ProgressCatalog } from '@egt/core';
import { checkDatabase, connect, createDynamoProgressRepository } from '@egt/db';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { noAuthentication } from './auth.ts';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';

/** Lessons of every course, from content/ (scripts/build.ts). */
declare const __PROGRESS_CATALOG__: ProgressCatalog;

const config = loadConfig();
const logger = createLogger(config);
const db = connect({ table: config.tableName });
const handleRequest = handle(
  createApp({
    config,
    logger,
    progress: createDynamoProgressRepository(db),
    catalog: __PROGRESS_CATALOG__,
    checkDatabase: () => checkDatabase(db),
    authenticate: noAuthentication,
  }),
);

export const handler: typeof handleRequest = async (event, context) => {
  logger.addContext(context);
  return handleRequest(event, context);
};
```

`apps/api/src/server.ts` (lê o catálogo de `content/` ao iniciar):

```ts
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createDevAuthenticator } from './auth.ts';
import { loadProgressCatalog } from './catalog.ts';
import { loadConfig } from './config.ts';
import { connectLocalStorage } from './local.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const port = Number(process.env.PORT ?? 3001);
const catalog = await loadProgressCatalog(
  fileURLToPath(new URL('../../../content', import.meta.url)),
);
const storage = await connectLocalStorage(config);
if (storage.mode === 'memory') {
  console.warn(
    'DynamoDB Local fora do ar: o progresso fica na memória e some ao reiniciar. Para usar o banco, rode pnpm db:up.',
  );
}

const app = createApp({
  config,
  logger: createLogger(config),
  progress: storage.progress,
  catalog,
  checkDatabase: storage.checkDatabase,
  authenticate: createDevAuthenticator(config),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API local em http://localhost:${info.port}/api/health`);
});
```

Run: `pnpm exec vitest run --project api`
Expected: PASS. O `test/bundle.test.ts` também passa, o que confirma que o bundle carrega com o catálogo embutido.

- [ ] **Step 6: Conferir e fazer o commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: sem erros.

```bash
git add packages/core apps/api pnpm-lock.yaml
git commit -m "feat(api): progresso limitado às aulas do catálogo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Perfil do aluno e exclusão dos dados (`@egt/db`)

**Files:**
- Create: `packages/db/src/profile-repository.ts`, `packages/db/src/memory-profile.ts`, `packages/db/src/dynamo-profile.ts`, `packages/db/src/errors.ts`, `packages/db/test/profile-contract.ts`, `packages/db/test/memory-profile.test.ts`
- Modify: `packages/db/src/index.ts`, `packages/db/src/progress-repository.ts`, `packages/db/src/memory-progress.ts`, `packages/db/src/dynamo-progress.ts`, `packages/db/test/progress-contract.ts`, `packages/db/test/dynamo.test.ts`, `apps/api/test/progress.test.ts`

**Interfaces:**
- Consumes: `Database` e `connect` (Fase 1B).
- Produces:
  - `interface Profile { birthYear: number; termsVersion: string; termsAcceptedAt: string; createdAt: string }`.
  - `interface ProfileRepository { get(sub): Promise<Profile | null>; create(sub, profile): Promise<'created' | 'exists'>; delete(sub): Promise<void> }`.
  - `createMemoryProfileRepository(initial?: Record<string, Profile>)` e `createDynamoProfileRepository(db)`.
  - `ProgressRepository.deleteAll(sub): Promise<void>`.

- [ ] **Step 1: Testes de contrato**

`packages/db/test/profile-contract.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Profile, ProfileRepository } from '../src/index.ts';

const profile: Profile = {
  birthYear: 2008,
  termsVersion: '2026-10-10',
  termsAcceptedAt: '2026-10-10T12:00:00.000Z',
  createdAt: '2026-10-10T12:00:00.000Z',
};

/** Behavior every ProfileRepository must have (memory and DynamoDB run the same tests). */
export function describeProfileRepository(name: string, create: () => ProfileRepository): void {
  describe(`${name}: ProfileRepository`, () => {
    const learner = () => `learner-${randomUUID()}`;

    it('has no profile before the learner creates one', async () => {
      expect(await create().get(learner())).toBeNull();
    });

    it('creates the profile once and never overwrites it', async () => {
      const repository = create();
      const sub = learner();

      expect(await repository.create(sub, profile)).toBe('created');
      expect(await repository.create(sub, { ...profile, birthYear: 2000 })).toBe('exists');
      expect(await repository.get(sub)).toEqual(profile);
    });

    it('deletes one learner only, even when there is nothing to delete', async () => {
      const repository = create();
      const ana = learner();
      const bia = learner();
      await repository.create(ana, profile);
      await repository.create(bia, profile);

      await repository.delete(ana);
      await repository.delete(learner());

      expect(await repository.get(ana)).toBeNull();
      expect(await repository.get(bia)).toEqual(profile);
    });
  });
}
```

`packages/db/test/memory-profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryProfileRepository } from '../src/index.ts';
import { describeProfileRepository } from './profile-contract.ts';

describeProfileRepository('memory', () => createMemoryProfileRepository());

describe('createMemoryProfileRepository', () => {
  it('starts with the seeded learners', async () => {
    const profile = {
      birthYear: 2008,
      termsVersion: '2026-10-10',
      termsAcceptedAt: '2026-10-10T12:00:00.000Z',
      createdAt: '2026-10-10T12:00:00.000Z',
    };
    const repository = createMemoryProfileRepository({ ana: profile });

    expect(await repository.get('ana')).toEqual(profile);
    expect(await repository.create('ana', profile)).toBe('exists');
  });
});
```

`packages/db/test/progress-contract.ts` ganha o teste de `deleteAll` no fim:

```diff
--- a/packages/db/test/progress-contract.ts
+++ b/packages/db/test/progress-contract.ts
@@ -169,5 +169,24 @@ export function describeProgressRepository(name: string, create: () => ProgressR
       ]);
       expect((await repository.get(bia)).courses).toEqual({ site: lesson('b') });
     });
+
+    it('deleteAll removes every course of one learner only', async () => {
+      const repository = create();
+      const ana = learner();
+      const bia = learner();
+      const lesson = (slug: string) => ({
+        completedLessons: [slug],
+        correctAnswers: [],
+        updatedAt: '2026-10-09T10:00:00.000Z',
+      });
+      await repository.merge(ana, { site: lesson('a'), planilhas: lesson('x') }, NOW);
+      await repository.merge(bia, { site: lesson('b') }, NOW);
+
+      await repository.deleteAll(ana);
+      await repository.deleteAll(learner());
+
+      expect(await repository.get(ana)).toEqual({ version: 1, courses: {} });
+      expect((await repository.get(bia)).courses).toEqual({ site: lesson('b') });
+    });
   });
 }
```

`packages/db/test/dynamo.test.ts` roda o contrato do perfil no DynamoDB Local e confere que perfil e progresso ficam na mesma partição:

```diff
--- a/packages/db/test/dynamo.test.ts
+++ b/packages/db/test/dynamo.test.ts
@@ -1,12 +1,15 @@
 import { randomUUID } from 'node:crypto';
+import { QueryCommand } from '@aws-sdk/lib-dynamodb';
 import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import {
   checkDatabase,
   connect,
+  createDynamoProfileRepository,
   createDynamoProgressRepository,
   deleteTable,
   ensureTable,
 } from '../src/index.ts';
+import { describeProfileRepository } from './profile-contract.ts';
 import { describeProgressRepository } from './progress-contract.ts';
 
 // DynamoDB Local: `pnpm db:up` locally (export DYNAMODB_ENDPOINT=http://localhost:8000); the CI
@@ -35,4 +38,30 @@ describe.skipIf(endpoint === undefined)('DynamoDB Local', () => {
   });
 
   describeProgressRepository('dynamodb', () => createDynamoProgressRepository(db));
+  describeProfileRepository('dynamodb', () => createDynamoProfileRepository(db));
+
+  it('keeps a learner profile and progress under the same partition', async () => {
+    const sub = `learner-${randomUUID()}`;
+    await createDynamoProfileRepository(db).create(sub, {
+      birthYear: 2008,
+      termsVersion: '2026-10-10',
+      termsAcceptedAt: '2026-10-10T12:00:00.000Z',
+      createdAt: '2026-10-10T12:00:00.000Z',
+    });
+    await createDynamoProgressRepository(db).merge(
+      sub,
+      { site: { completedLessons: ['a'], correctAnswers: [], updatedAt: '2026-10-10T12:00:00Z' } },
+      new Date('2026-10-10T12:00:00.000Z'),
+    );
+
+    const { Items } = await db.document.send(
+      new QueryCommand({
+        TableName: db.table,
+        KeyConditionExpression: 'PK = :pk',
+        ExpressionAttributeValues: { ':pk': `USER#${sub}` },
+      }),
+    );
+
+    expect(Items?.map((item) => item.SK).sort()).toEqual(['COURSE#site', 'PROFILE']);
+  });
 });
```

Run: `pnpm db:up && DYNAMODB_ENDPOINT=http://localhost:8000 pnpm exec vitest run --project db`
Expected: FAIL (as implementações ainda não existem).

- [ ] **Step 2: Implementar**

`packages/db/src/profile-repository.ts`:

```ts
/** What the learner tells us when the account is created (spec §3.5 and §5.5). */
export interface Profile {
  /** Only the year: enough to keep children under 12 out, without the full birth date. */
  birthYear: number;
  /** Version of the terms of use and privacy policy the learner accepted. */
  termsVersion: string;
  termsAcceptedAt: string;
  createdAt: string;
}

/** The learner profile (PK USER#<sub> · SK PROFILE). */
export interface ProfileRepository {
  get(sub: string): Promise<Profile | null>;
  /** Creates the profile once; answers 'exists' (and changes nothing) when there is one. */
  create(sub: string, profile: Profile): Promise<'created' | 'exists'>;
  delete(sub: string): Promise<void>;
}
```

`packages/db/src/memory-profile.ts`:

```ts
import type { Profile, ProfileRepository } from './profile-repository.ts';

/**
 * In-memory profiles: for tests and for `pnpm dev` without Docker (lost on restart). `initial`
 * seeds learners who already finished sign-up.
 */
export function createMemoryProfileRepository(
  initial: Record<string, Profile> = {},
): ProfileRepository {
  const profiles = new Map<string, Profile>(Object.entries(structuredClone(initial)));
  return {
    async get(sub) {
      const profile = profiles.get(sub);
      return profile === undefined ? null : structuredClone(profile);
    },
    async create(sub, profile) {
      if (profiles.has(sub)) return 'exists';
      profiles.set(sub, structuredClone(profile));
      return 'created';
    },
    async delete(sub) {
      profiles.delete(sub);
    },
  };
}
```

`packages/db/src/errors.ts` (o teste de condição que o progresso já usava, agora compartilhado):

```ts
/** ElectroDB wraps AWS SDK errors: the DynamoDB error is the cause. */
export const isConditionalCheckFailure = (error: unknown): boolean =>
  error instanceof Error &&
  (error.cause as { name?: string } | undefined)?.name === 'ConditionalCheckFailedException';
```

`packages/db/src/dynamo-profile.ts`:

```ts
import { Entity } from 'electrodb';
import type { Database } from './client.ts';
import { isConditionalCheckFailure } from './errors.ts';
import type { ProfileRepository } from './profile-repository.ts';

/** PK USER#<sub> · SK PROFILE (spec §3.5). */
function profileEntity(db: Database) {
  return new Entity(
    {
      model: { entity: 'profile', version: '1', service: 'egt' },
      attributes: {
        sub: { type: 'string', required: true },
        birthYear: { type: 'number', required: true },
        termsVersion: { type: 'string', required: true },
        termsAcceptedAt: { type: 'string', required: true },
        createdAt: { type: 'string', required: true },
      },
      indexes: {
        byUser: {
          pk: { field: 'PK', composite: ['sub'], template: 'USER#${sub}', casing: 'none' },
          sk: { field: 'SK', composite: [], template: 'PROFILE', casing: 'none' },
        },
      },
    },
    { client: db.document, table: db.table },
  );
}

export function createDynamoProfileRepository(db: Database): ProfileRepository {
  const entity = profileEntity(db);
  return {
    async get(sub) {
      const { data } = await entity.get({ sub }).go({ consistent: true });
      if (data === null) return null;
      const { birthYear, termsVersion, termsAcceptedAt, createdAt } = data;
      return { birthYear, termsVersion, termsAcceptedAt, createdAt };
    },
    async create(sub, profile) {
      try {
        await entity.create({ sub, ...profile }).go();
        return 'created';
      } catch (error) {
        if (isConditionalCheckFailure(error)) return 'exists';
        throw error;
      }
    },
    async delete(sub) {
      await entity.delete({ sub }).go();
    },
  };
}
```

`packages/db/src/progress-repository.ts`, `memory-progress.ts` e `dynamo-progress.ts` ganham `deleteAll`, e o `dynamo-progress.ts` passa a importar `isConditionalCheckFailure` de `errors.ts`:

```diff
--- a/packages/db/src/progress-repository.ts
+++ b/packages/db/src/progress-repository.ts
@@ -9,6 +9,8 @@ export interface ProgressRepository {
    * Returns the learner's whole progress.
    */
   merge(sub: string, courses: Record<string, CourseProgress>, now: Date): Promise<Progress>;
+  /** Removes every course of the learner (account deletion). */
+  deleteAll(sub: string): Promise<void>;
 }
 
 export const sortedUnique = (values: Iterable<string>): string[] => [...new Set(values)].sort();
```

```diff
--- a/packages/db/src/memory-progress.ts
+++ b/packages/db/src/memory-progress.ts
@@ -44,5 +44,8 @@ export function createMemoryProgressRepository(): ProgressRepository {
       }
       return read(sub);
     },
+    async deleteAll(sub) {
+      learners.delete(sub);
+    },
   };
 }
```

```diff
--- a/packages/db/src/dynamo-progress.ts
+++ b/packages/db/src/dynamo-progress.ts
@@ -1,6 +1,7 @@
 import type { CourseProgress, Progress } from '@egt/core';
 import { Entity } from 'electrodb';
 import type { Database } from './client.ts';
+import { isConditionalCheckFailure } from './errors.ts';
 import {
   normalizeTimestamp,
   sortedUnique,
@@ -31,10 +32,6 @@ function courseProgressEntity(db: Database) {
   );
 }
 
-const isConditionalCheckFailure = (error: unknown): boolean =>
-  error instanceof Error &&
-  (error.cause as { name?: string } | undefined)?.name === 'ConditionalCheckFailedException';
-
 /**
  * Two writes per course, both safe to run concurrently from several devices: ADD unions the
  * sets, and the conditional SET only moves lastLesson/updatedAt forward. No read-modify-write.
@@ -91,5 +88,11 @@ export function createDynamoProgressRepository(db: Database): ProgressRepository
       }
       return get(sub);
     },
+    async deleteAll(sub) {
+      const { data } = await entity.query
+        .byUser({ sub })
+        .go({ pages: 'all', attributes: ['course'] });
+      await Promise.all(data.map(({ course }) => entity.delete({ sub, course }).go()));
+    },
   };
 }
```

`packages/db/src/index.ts`:

```ts
export * from './client.ts';
export * from './dynamo-profile.ts';
export * from './dynamo-progress.ts';
export * from './memory-profile.ts';
export * from './memory-progress.ts';
export * from './profile-repository.ts';
export * from './progress-repository.ts';
export * from './table.ts';
```

O repositório falso do teste de erro da API precisa do método novo:

```diff
--- a/apps/api/test/progress.test.ts
+++ b/apps/api/test/progress.test.ts
@@ -13,7 +13,7 @@ describe('progress routes', () => {
     const broken = async () => {
       throw new Error('boom');
     };
-    const app = testApp({ progress: { get: broken, merge: broken } });
+    const app = testApp({ progress: { get: broken, merge: broken, deleteAll: broken } });
 
     const res = await app.request('/api/progress', { headers: learner() });
 
```

Run: `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm exec vitest run --project db --project api`
Expected: PASS.

- [ ] **Step 3: Conferir e fazer o commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: sem erros.

```bash
git add packages/db apps/api/test/progress.test.ts
git commit -m "feat(db): perfil do aluno e exclusão dos dados" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sessão por cookies, provedor de identidade e cadastro obrigatório

A API passa a reconhecer o aluno pelo cookie `egt_at`, por meio de uma interface `IdentityProvider`. As implementações de verdade chegam nas Tasks 6 (Cognito) e 7 (local); até lá, a Lambda e o servidor local usam `noAccounts`, que recusa todo token. O login falso por `x-dev-user` sai. Dois portões da revisão da 1B entram aqui:
- as rotas de estudo exigem o cadastro completo;
- um teste confere que um PUT autenticado sem `Origin` é recusado.

**Files:**
- Create: `apps/api/src/identity.ts`, `apps/api/src/session.ts`, `apps/api/test/fake-identity.ts`, `apps/api/test/session.test.ts`
- Modify: `apps/api/src/auth.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/progress.ts`, `apps/api/src/lambda.ts`, `apps/api/src/local.ts`, `apps/api/src/server.ts`, `apps/api/test/auth.test.ts`, `apps/api/test/helpers.ts`, `apps/api/test/progress.test.ts`

**Interfaces:**
- Consumes: `ProfileRepository`, `createMemoryProfileRepository(initial)`, `createDynamoProfileRepository` (Task 2).
- Produces:
  - `interface Identity { sub: string }`.
  - `interface Tokens { accessToken: string; refreshToken?: string; expiresIn: number }`.
  - `type CodeCheck = { tokens: Tokens } | { error: 'invalid_code' }`.
  - `class RateLimitedError`.
  - `interface IdentityProvider`, com os métodos:
    - `startEmailLogin(email): Promise<string>` e `finishEmailLogin(state, code): Promise<CodeCheck>`;
    - `googleAuthorizeUrl({ state, codeChallenge, redirectUri }): string` e `finishGoogleLogin({ code, codeVerifier, redirectUri }): Promise<Tokens>`;
    - `refresh(refreshToken): Promise<Tokens | null>` e `revoke(refreshToken): Promise<void>`;
    - `verifyAccessToken(token): Promise<Identity | null>`;
    - `email(sub): Promise<string | null>` e `deleteUser(sub): Promise<void>`.
  - `noAccounts: IdentityProvider` (temporário, sai na Task 7).
  - Em `src/session.ts`: `COOKIES`, `cookieOptions(secure, path, maxAge, httpOnly?)`, `setSession(c, tokens, secure)` e `clearSession(c, secure)`.
  - `requireIdentity(identity)` e `requireProfile(profiles)`.
  - `AppDeps` agora: `{ config, logger, progress, profiles, catalog, checkDatabase, identity, now? }`.
  - `LocalStorage.profiles`.
  - Nos testes:
    - `createFakeIdentity(accounts?)`: o access token `access.<sub>`, o refresh token `refresh.<sub>.<n>` e o código `123456` (`CODE`); o Google falso devolve `google:<e-mail>:<challenge>`;
    - `s256(verifier)`;
    - `PROFILE` e `learner(sub)`, com o cookie `egt_at=access.<sub>`, `origin` e `content-type`.

- [ ] **Step 1: Testes**

`apps/api/test/fake-identity.ts`:

```ts
import { createHash } from 'node:crypto';
import { RateLimitedError, type IdentityProvider, type Tokens } from '../src/identity.ts';

/** The only code the fake accepts. */
export const CODE = '123456';

export const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/** Identity provider for route tests: codes are always 123456 and tokens say whose they are. */
export interface FakeIdentity extends IdentityProvider {
  /** e-mail → sub of every account. */
  accounts: Map<string, string>;
  /** While true, starting a sign-in fails with RateLimitedError. */
  rateLimited: boolean;
  /** Refresh tokens ended by logout. */
  revoked: string[];
}

/**
 * Accounts are created on the first sign-in with the part of the e-mail before the @ as `sub`.
 * The fake Google sends back the code `google:<e-mail>:<PKCE challenge>`.
 */
export function createFakeIdentity(accounts: Record<string, string> = {}): FakeIdentity {
  const refreshTokens = new Map<string, string>();
  const pending = new Map<string, string>();
  let counter = 0;

  const subOf = (email: string) => {
    const existing = fake.accounts.get(email);
    if (existing !== undefined) return existing;
    const sub = email.slice(0, email.indexOf('@'));
    fake.accounts.set(email, sub);
    return sub;
  };
  const tokensFor = (sub: string): Tokens => {
    const refreshToken = `refresh.${sub}.${++counter}`;
    refreshTokens.set(refreshToken, sub);
    return { accessToken: `access.${sub}`, refreshToken, expiresIn: 3600 };
  };

  const fake: FakeIdentity = {
    accounts: new Map(Object.entries(accounts)),
    rateLimited: false,
    revoked: [],
    async startEmailLogin(email) {
      if (fake.rateLimited) throw new RateLimitedError();
      const state = `state.${++counter}`;
      pending.set(state, email);
      return state;
    },
    async finishEmailLogin(state, code) {
      const email = pending.get(state);
      if (email === undefined || code !== CODE) return { error: 'invalid_code' };
      pending.delete(state);
      return { tokens: tokensFor(subOf(email)) };
    },
    googleAuthorizeUrl({ state, codeChallenge, redirectUri }) {
      const query = new URLSearchParams({
        state,
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
      });
      return `https://google.example/authorize?${query}`;
    },
    async finishGoogleLogin({ code, codeVerifier }) {
      const [, email = '', challenge] = code.split(':');
      if (challenge !== s256(codeVerifier)) throw new Error('PKCE mismatch');
      return tokensFor(subOf(email));
    },
    async refresh(refreshToken) {
      const sub = refreshTokens.get(refreshToken);
      if (sub === undefined) return null;
      refreshTokens.delete(refreshToken);
      return tokensFor(sub);
    },
    async revoke(refreshToken) {
      refreshTokens.delete(refreshToken);
      fake.revoked.push(refreshToken);
    },
    // Like Cognito, a signed access token stays valid until it expires, even after deletion.
    async verifyAccessToken(token) {
      return token.startsWith('access.') ? { sub: token.slice('access.'.length) } : null;
    },
    async email(sub) {
      for (const [email, owner] of fake.accounts) if (owner === sub) return email;
      return null;
    },
    async deleteUser(sub) {
      for (const [email, owner] of fake.accounts) if (owner === sub) fake.accounts.delete(email);
    },
  };
  return fake;
}
```

`apps/api/test/helpers.ts` (Ana e Bia já têm conta e cadastro):

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import type { ProgressCatalog } from '@egt/core';
import {
  createMemoryProfileRepository,
  createMemoryProgressRepository,
  type Profile,
} from '@egt/db';
import { createApp, type AppDeps } from '../src/app.ts';
import type { AppConfig } from '../src/config.ts';
import { createFakeIdentity } from './fake-identity.ts';

export const SITE = 'http://localhost:4321';
export const NOW = new Date('2026-10-09T12:00:00.000Z');

/** The courses and lessons the test app knows. */
export const CATALOG: ProgressCatalog = {
  site: { 'o-que-e-um-site': 1, a: 1, b: 1 },
  planilhas: { x: 0 },
};

export const config: AppConfig = {
  environment: 'local',
  version: '9.9.9',
  tableName: 'egt-test-data-main',
  siteOrigin: SITE,
};

export const PROFILE: Profile = {
  birthYear: 2008,
  termsVersion: '2026-10-10',
  termsAcceptedAt: '2026-10-09T10:00:00.000Z',
  createdAt: '2026-10-09T10:00:00.000Z',
};

/**
 * The app with in-memory storage and the fake identity provider. Ana and Bia have accounts and
 * finished sign-up; anyone else signs up on the first sign-in.
 */
export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    config,
    logger: new Logger({ logLevel: 'SILENT' }),
    progress: createMemoryProgressRepository(),
    profiles: createMemoryProfileRepository({ ana: PROFILE, bia: PROFILE }),
    catalog: CATALOG,
    checkDatabase: async () => {},
    identity: createFakeIdentity({ 'ana@example.com': 'ana', 'bia@example.com': 'bia' }),
    now: () => NOW,
    ...overrides,
  });
}

/** Headers of a logged-in learner sending a change from the site. */
export const learner = (sub = 'ana') => ({
  cookie: `egt_at=access.${sub}`,
  origin: SITE,
  'content-type': 'application/json',
});
```

`apps/api/test/auth.test.ts` (substitui os testes do login falso):

```ts
import { describe, expect, it } from 'vitest';
import { learner, SITE, testApp } from './helpers.ts';

describe('personal routes', () => {
  it('know the learner by the egt_at cookie', async () => {
    const res = await testApp().request('/api/progress', { headers: learner('ana') });

    expect(res.status).toBe(200);
  });

  it('answer 401 without a valid access token', async () => {
    for (const cookie of [undefined, 'egt_at=lixo', 'egt_rt=refresh.ana.1']) {
      const headers: Record<string, string> = cookie === undefined ? {} : { cookie };

      const res = await testApp().request('/api/progress', { headers });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: 'unauthenticated', message: 'Entre na sua conta para continuar.' },
      });
    }
  });

  it('answer 409 until the learner finishes sign-up', async () => {
    const res = await testApp().request('/api/progress', {
      headers: { cookie: 'egt_at=access.cris', origin: SITE },
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'profile_required', message: 'Complete seu cadastro para continuar.' },
    });
  });
});
```

`apps/api/test/session.test.ts`:

```ts
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../src/session.ts';

async function cookiesOf(secure: boolean, action: 'set' | 'clear'): Promise<string[]> {
  const app = new Hono().get('/', (c) => {
    if (action === 'set') {
      setSession(c, { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 }, secure);
    } else {
      clearSession(c, secure);
    }
    return c.body(null, 204);
  });
  const res = await app.request('/');
  return res.headers.getSetCookie();
}

describe('session cookies', () => {
  it('keep the tokens away from scripts, each on the narrowest path', async () => {
    expect(await cookiesOf(true, 'set')).toEqual([
      'egt_at=at; Max-Age=3600; Path=/api; HttpOnly; Secure; SameSite=Lax',
      'egt_rt=rt; Max-Age=2592000; Path=/api/auth; HttpOnly; Secure; SameSite=Lax',
      'egt_hint=1; Max-Age=2592000; Path=/; Secure; SameSite=Lax',
    ]);
  });

  it('leave Secure out locally (plain http://localhost)', async () => {
    expect((await cookiesOf(false, 'set')).some((cookie) => cookie.includes('Secure'))).toBe(false);
  });

  it('are all removed on logout', async () => {
    const cookies = await cookiesOf(true, 'clear');

    expect(cookies.map((cookie) => cookie.split(';')[0])).toEqual([
      'egt_at=',
      'egt_rt=',
      'egt_hint=',
    ]);
    expect(cookies.every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  });
});
```

`apps/api/test/progress.test.ts` ganha o portão do PUT sem `Origin`:

```diff
--- a/apps/api/test/progress.test.ts
+++ b/apps/api/test/progress.test.ts
@@ -43,6 +43,18 @@ describe('progress routes', () => {
     }
   });
 
+  it('refuse changes without the site Origin, even from a logged-in learner', async () => {
+    const { origin: _origin, ...withoutOrigin } = learner();
+
+    const res = await testApp().request('/api/progress/site/lessons/a', {
+      method: 'PUT',
+      headers: withoutOrigin,
+    });
+
+    expect(res.status).toBe(400);
+    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_origin');
+  });
+
   it('GET starts empty', async () => {
     const res = await testApp().request('/api/progress', { headers: learner() });
 
```

Run: `pnpm exec vitest run --project api`
Expected: FAIL (`src/identity.ts` e `src/session.ts` não existem).

- [ ] **Step 2: Implementar**

`apps/api/src/identity.ts`:

```ts
/** Who is calling: the learner id (Cognito `sub`; locally, derived from the e-mail). */
export interface Identity {
  sub: string;
}

export interface Tokens {
  accessToken: string;
  /** Present after a sign-in and after each refresh (refresh tokens rotate). */
  refreshToken?: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

/** `invalid_code` covers wrong and expired codes alike. */
export type CodeCheck = { tokens: Tokens } | { error: 'invalid_code' };

/** The provider refuses for now (too many codes or attempts): the API answers 429. */
export class RateLimitedError extends Error {
  constructor() {
    super('Identity provider rate limit');
    this.name = 'RateLimitedError';
  }
}

/**
 * Accounts and sessions (spec §5). In AWS, Cognito (identity/cognito.ts); locally, an in-process
 * stand-in with Mailpit and a fake Google (identity/local.ts).
 */
export interface IdentityProvider {
  /**
   * Sends a code to the e-mail: sign-in when the account exists, sign-up otherwise, with the same
   * observable behavior (spec §5.1). Returns the state the second step needs.
   */
  startEmailLogin(email: string): Promise<string>;
  finishEmailLogin(state: string, code: string): Promise<CodeCheck>;
  /** Where the browser goes to sign in with Google (authorization code with PKCE). */
  googleAuthorizeUrl(request: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  /** Exchanges the code that the Google sign-in sent back to /api/auth/callback. */
  finishGoogleLogin(request: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<Tokens>;
  /** New tokens, or null when the refresh token no longer works. */
  refresh(refreshToken: string): Promise<Tokens | null>;
  /** Ends the session of this refresh token (logout). */
  revoke(refreshToken: string): Promise<void>;
  /** The learner behind a valid access token, or null. */
  verifyAccessToken(accessToken: string): Promise<Identity | null>;
  /** The account e-mail (Eu page and data export); null when the account is gone. */
  email(sub: string): Promise<string | null>;
  /** Deletes the account, Google link included. */
  deleteUser(sub: string): Promise<void>;
}

const unavailable = async (): Promise<never> => {
  throw new Error('No identity provider wired yet');
};

/** No accounts yet: every token is refused. Replaced when the Cognito and local providers are wired. */
export const noAccounts: IdentityProvider = {
  startEmailLogin: unavailable,
  finishEmailLogin: unavailable,
  googleAuthorizeUrl: () => {
    throw new Error('No identity provider wired yet');
  },
  finishGoogleLogin: unavailable,
  refresh: async () => null,
  revoke: async () => {},
  verifyAccessToken: async () => null,
  email: async () => null,
  deleteUser: unavailable,
};
```

`apps/api/src/session.ts`:

```ts
import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import type { Tokens } from './identity.ts';

/** Session cookies (spec §5.2). Host-only (no Domain): other host names never get them. */
export const COOKIES = {
  /** Access token, sent to the whole API. */
  access: 'egt_at',
  /** Refresh token, only to /api/auth. */
  refresh: 'egt_rt',
  /** Readable by the site: only says "logged in" so the pages know when to sync. */
  hint: 'egt_hint',
  /** E-mail sign-in in progress (between asking for the code and typing it). */
  login: 'egt_login',
  /** Google sign-in in progress (state, PKCE verifier, where to go back). */
  oauth: 'egt_oauth',
} as const;

const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60;

/** Secure everywhere except local http://localhost (some browsers drop Secure cookies there). */
export const cookieOptions = (
  secure: boolean,
  path: string,
  maxAge: number,
  httpOnly = true,
): CookieOptions => ({ path, maxAge, httpOnly, secure, sameSite: 'Lax' });

export function setSession(c: Context, tokens: Tokens, secure: boolean): void {
  setCookie(c, COOKIES.access, tokens.accessToken, cookieOptions(secure, '/api', tokens.expiresIn));
  if (tokens.refreshToken !== undefined) {
    setCookie(
      c,
      COOKIES.refresh,
      tokens.refreshToken,
      cookieOptions(secure, '/api/auth', SESSION_DAYS * DAY),
    );
  }
  setCookie(c, COOKIES.hint, '1', cookieOptions(secure, '/', SESSION_DAYS * DAY, false));
}

export function clearSession(c: Context, secure: boolean): void {
  deleteCookie(c, COOKIES.access, { path: '/api', secure });
  deleteCookie(c, COOKIES.refresh, { path: '/api/auth', secure });
  deleteCookie(c, COOKIES.hint, { path: '/', secure });
}
```

`apps/api/src/auth.ts`:

```ts
import type { ProfileRepository } from '@egt/db';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { apiError } from './errors.ts';
import type { Identity, IdentityProvider } from './identity.ts';
import { COOKIES } from './session.ts';

export type AuthEnv = { Variables: { identity: Identity } };

/** Personal routes: the access token cookie must be valid. */
export function requireIdentity(identity: IdentityProvider): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const token = getCookie(c, COOKIES.access);
    const found = token === undefined ? null : await identity.verifyAccessToken(token);
    if (found === null) {
      return c.json(apiError('unauthenticated', 'Entre na sua conta para continuar.'), 401);
    }
    c.set('identity', found);
    await next();
  };
}

/** Learning data only after sign-up is complete (age check and terms, spec §5.5). */
export function requireProfile(profiles: ProfileRepository): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    if ((await profiles.get(c.var.identity.sub)) === null) {
      return c.json(apiError('profile_required', 'Complete seu cadastro para continuar.'), 409);
    }
    await next();
  };
}
```

`apps/api/src/app.ts`:

```ts
import type { Logger } from '@aws-lambda-powertools/logger';
import type { ProgressCatalog } from '@egt/core';
import type { ProfileRepository, ProgressRepository } from '@egt/db';
import { Hono } from 'hono';
import type { AppConfig } from './config.ts';
import { apiError } from './errors.ts';
import type { IdentityProvider } from './identity.ts';
import { healthRoutes } from './routes/health.ts';
import { progressRoutes } from './routes/progress.ts';
import { limitBody, noStore, requireOriginVerify, requireSiteOrigin } from './security.ts';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  progress: ProgressRepository;
  profiles: ProfileRepository;
  /** Courses and lessons the progress may hold (built from content/). */
  catalog: ProgressCatalog;
  checkDatabase: () => Promise<void>;
  identity: IdentityProvider;
  now?: () => Date;
}

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath('/api');
  app.use(requireOriginVerify(deps.config.originVerifySecret));
  app.use(noStore);
  app.use(requireSiteOrigin(deps.config.siteOrigin));
  app.use(limitBody);
  app.route('/health', healthRoutes(deps));
  app.route('/progress', progressRoutes(deps));
  app.notFound((c) => c.json(apiError('not_found', 'Rota não encontrada.'), 404));
  app.onError((error, c) => {
    deps.logger.error('unhandled_error', { error });
    return c.json(
      apiError('internal_error', 'Algo deu errado do nosso lado. Tenta de novo daqui a pouco.'),
      500,
    );
  });
  return app;
}
```

`apps/api/src/routes/progress.ts`:

```ts
import { isKnownLesson, keepKnownProgress, type ProgressCatalog } from '@egt/core';
import type { ProfileRepository, ProgressRepository } from '@egt/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireIdentity, requireProfile, type AuthEnv } from '../auth.ts';
import { apiError } from '../errors.ts';
import type { IdentityProvider } from '../identity.ts';

// Same slug rule as packages/content (course folders and lesson files).
const slug = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const answer = z
  .string()
  .max(110)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*#\d{1,3}$/);

const courseProgress = z.object({
  completedLessons: z.array(slug).max(200),
  correctAnswers: z.array(answer).max(1000),
  lastLesson: slug.optional(),
  updatedAt: z.iso.datetime(),
});

const mergeBody = z.object({
  version: z.literal(1),
  courses: z.record(slug, courseProgress).refine((courses) => Object.keys(courses).length <= 50),
});

const lessonParams = z.object({ course: slug, lesson: slug });

const invalidRequest = apiError(
  'invalid_request',
  'Os dados enviados não estão no formato esperado.',
);

export interface ProgressDeps {
  progress: ProgressRepository;
  profiles: ProfileRepository;
  identity: IdentityProvider;
  catalog: ProgressCatalog;
  now?: () => Date;
}

export function progressRoutes({
  progress,
  profiles,
  identity,
  catalog,
  now = () => new Date(),
}: ProgressDeps) {
  return new Hono<AuthEnv>()
    .use(requireIdentity(identity))
    .use(requireProfile(profiles))
    .get('/', async (c) => c.json(await progress.get(c.var.identity.sub)))
    .put('/:course/lessons/:lesson', async (c) => {
      const params = lessonParams.safeParse(c.req.param());
      if (!params.success) return c.json(invalidRequest, 400);
      const { course, lesson } = params.data;
      if (!isKnownLesson(catalog, course, lesson)) {
        return c.json(apiError('not_found', 'Aula não encontrada.'), 404);
      }
      const at = now();
      const completed = {
        completedLessons: [lesson],
        correctAnswers: [],
        lastLesson: lesson,
        updatedAt: at.toISOString(),
      };
      return c.json(await progress.merge(c.var.identity.sub, { [course]: completed }, at));
    })
    .post('/merge', async (c) => {
      const body = mergeBody.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json(invalidRequest, 400);
      // Unknown courses and lessons (renamed content, junk) are dropped, not refused: a device
      // with old progress must still sync the rest.
      const courses = keepKnownProgress(body.data.courses, catalog);
      return c.json(await progress.merge(c.var.identity.sub, courses, now()));
    });
}
```

`apps/api/src/local.ts` também devolve o repositório de perfis:

```ts
import {
  checkDatabase,
  connect,
  createDynamoProfileRepository,
  createDynamoProgressRepository,
  createMemoryProfileRepository,
  createMemoryProgressRepository,
  ensureTable,
  type ProfileRepository,
  type ProgressRepository,
} from '@egt/db';
import type { AppConfig } from './config.ts';

export interface LocalStorage {
  mode: 'dynamodb' | 'memory';
  progress: ProgressRepository;
  profiles: ProfileRepository;
  checkDatabase: () => Promise<void>;
}

/** DynamoDB Local when it is up (the table is created on the way); otherwise memory. */
export async function connectLocalStorage(config: AppConfig): Promise<LocalStorage> {
  const db = connect({ table: config.tableName, endpoint: config.dynamodbEndpoint });
  try {
    await ensureTable(db);
    return {
      mode: 'dynamodb',
      progress: createDynamoProgressRepository(db),
      profiles: createDynamoProfileRepository(db),
      checkDatabase: () => checkDatabase(db),
    };
  } catch {
    return {
      mode: 'memory',
      progress: createMemoryProgressRepository(),
      profiles: createMemoryProfileRepository(),
      checkDatabase: async () => {},
    };
  }
}
```

`apps/api/src/lambda.ts`:

```ts
import type { ProgressCatalog } from '@egt/core';
import {
  checkDatabase,
  connect,
  createDynamoProfileRepository,
  createDynamoProgressRepository,
} from '@egt/db';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { noAccounts } from './identity.ts';
import { createLogger } from './logger.ts';

/** Lessons of every course, from content/ (scripts/build.ts). */
declare const __PROGRESS_CATALOG__: ProgressCatalog;

const config = loadConfig();
const logger = createLogger(config);
const db = connect({ table: config.tableName });
const handleRequest = handle(
  createApp({
    config,
    logger,
    progress: createDynamoProgressRepository(db),
    profiles: createDynamoProfileRepository(db),
    catalog: __PROGRESS_CATALOG__,
    checkDatabase: () => checkDatabase(db),
    identity: noAccounts,
  }),
);

export const handler: typeof handleRequest = async (event, context) => {
  logger.addContext(context);
  return handleRequest(event, context);
};
```

`apps/api/src/server.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadProgressCatalog } from './catalog.ts';
import { loadConfig } from './config.ts';
import { noAccounts } from './identity.ts';
import { connectLocalStorage } from './local.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const port = Number(process.env.PORT ?? 3001);
const catalog = await loadProgressCatalog(
  fileURLToPath(new URL('../../../content', import.meta.url)),
);
const storage = await connectLocalStorage(config);
if (storage.mode === 'memory') {
  console.warn(
    'DynamoDB Local fora do ar: o progresso fica na memória e some ao reiniciar. Para usar o banco, rode pnpm db:up.',
  );
}

const app = createApp({
  config,
  logger: createLogger(config),
  progress: storage.progress,
  profiles: storage.profiles,
  catalog,
  checkDatabase: storage.checkDatabase,
  identity: noAccounts,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API local em http://localhost:${info.port}/api/health`);
});
```

Run: `pnpm exec vitest run --project api`
Expected: PASS.

- [ ] **Step 3: Conferir e fazer o commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: sem erros.

```bash
git add apps/api
git commit -m "feat(api): sessão por cookies, provedor de identidade e cadastro obrigatório" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rotas de login (código por e-mail, Google, renovação e saída)

**Files:**
- Create: `apps/api/src/routes/auth.ts`, `apps/api/test/auth-routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `IdentityProvider`, `RateLimitedError`, `COOKIES`, `cookieOptions`, `setSession`, `clearSession` (Task 3); `ProfileRepository` (Task 2).
- Produces:
  - `authRoutes({ config, logger, identity, profiles })`, montado em `/api/auth`.
  - O callback do Google redireciona para `/entrar/?entrou=google&next=<next>`. Em caso de falha, para `/entrar/?erro=google`. Se a falha veio do vínculo (`error_description` contém `PreSignUp`), refaz o login no Google uma vez.
  - O `next` só aceita caminhos do próprio site (`/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/`, até 200 caracteres); o padrão é `/eu/`.

- [ ] **Step 1: Testes**

`apps/api/test/auth-routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CODE, createFakeIdentity, s256 } from './fake-identity.ts';
import { SITE, testApp } from './helpers.ts';

/** `name=value` pairs of the Set-Cookie headers, ready for a Cookie header. */
const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
const setCookie = (res: Response, name: string) =>
  res.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));

const json = (body: unknown, cookie?: string) => ({
  method: 'POST',
  headers: {
    origin: SITE,
    'content-type': 'application/json',
    ...(cookie === undefined ? {} : { cookie }),
  },
  body: JSON.stringify(body),
});

async function askForCode(app: ReturnType<typeof testApp>, email: string) {
  const res = await app.request('/api/auth/email/start', json({ email }));
  return cookieHeader(res);
}

describe('POST /api/auth/email/start', () => {
  it('sends a code and keeps the sign-in state in an HttpOnly cookie', async () => {
    const res = await testApp().request(
      '/api/auth/email/start',
      json({ email: 'Ana@Example.com' }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'code_sent' });
    expect(setCookie(res, 'egt_login')).toBe(
      'egt_login=state.1; Max-Age=900; Path=/api/auth; HttpOnly; SameSite=Lax',
    );
  });

  it('answers the same for new and existing accounts', async () => {
    const existing = await testApp().request(
      '/api/auth/email/start',
      json({ email: 'ana@example.com' }),
    );
    const brandNew = await testApp().request(
      '/api/auth/email/start',
      json({ email: 'novo@example.com' }),
    );

    expect([existing.status, await existing.json()]).toEqual([
      brandNew.status,
      await brandNew.json(),
    ]);
  });

  it('refuses what is not an e-mail', async () => {
    for (const body of [{ email: 'ana' }, { email: '' }, {}]) {
      const res = await testApp().request('/api/auth/email/start', json(body));

      expect(res.status).toBe(400);
    }
  });

  it('answers 429 when the provider asks to slow down', async () => {
    const identity = createFakeIdentity();
    identity.rateLimited = true;

    const res = await testApp({ identity }).request(
      '/api/auth/email/start',
      json({ email: 'ana@example.com' }),
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
      },
    });
  });
});

describe('POST /api/auth/email/verify', () => {
  it('signs in with the right code and tells the sign-up is complete', async () => {
    const app = testApp();
    const login = await askForCode(app, 'ana@example.com');

    const res = await app.request('/api/auth/email/verify', json({ code: CODE }, login));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profileComplete: true });
    expect(setCookie(res, 'egt_at')).toMatch(/^egt_at=access\.ana; Max-Age=3600; Path=\/api;/);
    expect(setCookie(res, 'egt_rt')).toMatch(/^egt_rt=refresh\.ana\.\d+; .*Path=\/api\/auth;/);
    expect(setCookie(res, 'egt_hint')).toMatch(/^egt_hint=1;/);
    expect(setCookie(res, 'egt_login')).toMatch(/^egt_login=; Max-Age=0;/);
  });

  it('asks a new learner to finish sign-up', async () => {
    const app = testApp();
    const login = await askForCode(app, 'cris@example.com');

    const res = await app.request('/api/auth/email/verify', json({ code: CODE }, login));

    expect(await res.json()).toEqual({ profileComplete: false });
  });

  it('refuses a wrong code and keeps the sign-in going', async () => {
    const app = testApp();
    const login = await askForCode(app, 'ana@example.com');

    const res = await app.request('/api/auth/email/verify', json({ code: '000000' }, login));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'invalid_code',
        message: 'Código incorreto ou vencido. Confira o e-mail ou peça um novo código.',
      },
    });
    expect(setCookie(res, 'egt_login')).toBeUndefined();
    const retry = await app.request('/api/auth/email/verify', json({ code: CODE }, login));
    expect(retry.status).toBe(200);
  });

  it('accepts codes with 6 to 8 digits only', async () => {
    const app = testApp();
    const login = await askForCode(app, 'ana@example.com');

    for (const code of ['12345', '123456789', 'abcdef']) {
      const res = await app.request('/api/auth/email/verify', json({ code }, login));

      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        'invalid_request',
      );
    }
  });

  it('asks for a new code when the sign-in state is gone', async () => {
    const res = await testApp().request('/api/auth/email/verify', json({ code: CODE }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'login_expired',
        message: 'O tempo para digitar o código acabou. Peça um novo código.',
      },
    });
  });
});

describe('Google sign-in', () => {
  async function goToGoogle(app: ReturnType<typeof testApp>, query = '') {
    const res = await app.request(`/api/auth/google${query}`);
    const location = new URL(res.headers.get('location') ?? '');
    return { res, location, cookie: cookieHeader(res) };
  }

  it('sends the browser to Google with state and PKCE', async () => {
    const { res, location } = await goToGoogle(testApp(), '?next=/cursos/');

    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe('https://google.example/authorize');
    expect(location.searchParams.get('redirect_uri')).toBe(`${SITE}/api/auth/callback`);
    expect(location.searchParams.get('state')).toMatch(/^[\w-]{22}$/);
    expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(setCookie(res, 'egt_oauth')).toMatch(
      /^egt_oauth=[\w-]+; Max-Age=600; Path=\/api\/auth; HttpOnly; SameSite=Lax$/,
    );
  });

  async function callback(app: ReturnType<typeof testApp>, email: string, next = '') {
    const { location, cookie } = await goToGoogle(app, next);
    const state = location.searchParams.get('state') ?? '';
    const challenge = location.searchParams.get('code_challenge') ?? '';
    const code = `google:${email}:${challenge}`;
    return app.request(`/api/auth/callback?code=${encodeURIComponent(code)}&state=${state}`, {
      headers: { cookie },
    });
  }

  it('signs in and lets the sign-in page finish, keeping where to go next', async () => {
    const res = await callback(testApp(), 'ana@example.com', '?next=/cursos/site/');

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/entrar/?entrou=google&next=%2Fcursos%2Fsite%2F');
    expect(setCookie(res, 'egt_at')).toMatch(/^egt_at=access\.ana;/);
    expect(setCookie(res, 'egt_oauth')).toMatch(/^egt_oauth=; Max-Age=0;/);
  });

  it('never goes back to another site', async () => {
    for (const next of ['//evil.example', 'https://evil.example', '/eu/?x=1', '/../x']) {
      const res = await callback(testApp(), 'ana@example.com', `?next=${encodeURIComponent(next)}`);

      expect(res.headers.get('location')).toBe('/entrar/?entrou=google&next=%2Feu%2F');
    }
  });

  it('refuses a callback without the matching state', async () => {
    const app = testApp();
    const { location, cookie } = await goToGoogle(app);
    const challenge = location.searchParams.get('code_challenge') ?? '';
    const code = encodeURIComponent(`google:ana@example.com:${challenge}`);

    for (const headers of [{}, { cookie }]) {
      const res = await app.request(`/api/auth/callback?code=${code}&state=outro`, { headers });

      expect(res.headers.get('location')).toBe('/entrar/?erro=google');
      expect(setCookie(res, 'egt_at')).toBeUndefined();
    }
  });

  it('tries once more when Cognito has just linked Google to an account', async () => {
    const app = testApp();
    const first = await goToGoogle(app, '?next=/cursos/');
    const state = first.location.searchParams.get('state') ?? '';
    const failure = `error=invalid_request&error_description=${encodeURIComponent('PreSignUp failed with error ACCOUNT_LINKED.')}`;

    const retry = await app.request(`/api/auth/callback?${failure}&state=${state}`, {
      headers: { cookie: first.cookie },
    });

    expect(retry.status).toBe(302);
    expect(new URL(retry.headers.get('location') ?? '').origin).toBe('https://google.example');
    const second = new URL(retry.headers.get('location') ?? '');
    const giveUp = await app.request(
      `/api/auth/callback?${failure}&state=${second.searchParams.get('state')}`,
      { headers: { cookie: cookieHeader(retry) } },
    );
    expect(giveUp.headers.get('location')).toBe('/entrar/?erro=google');
  });

  it('does not retry other Google errors', async () => {
    const app = testApp();
    const { location, cookie } = await goToGoogle(app);

    const res = await app.request(
      `/api/auth/callback?error=access_denied&state=${location.searchParams.get('state')}`,
      { headers: { cookie } },
    );

    expect(res.headers.get('location')).toBe('/entrar/?erro=google');
  });

  it('gives up when the code exchange fails', async () => {
    const app = testApp();
    const { location, cookie } = await goToGoogle(app);
    const code = encodeURIComponent(`google:ana@example.com:${s256('outro-verifier')}`);

    const res = await app.request(
      `/api/auth/callback?code=${code}&state=${location.searchParams.get('state')}`,
      { headers: { cookie } },
    );

    expect(res.headers.get('location')).toBe('/entrar/?erro=google');
  });
});

describe('session refresh and logout', () => {
  async function signedIn(app: ReturnType<typeof testApp>) {
    const login = await askForCode(app, 'ana@example.com');
    const res = await app.request('/api/auth/email/verify', json({ code: CODE }, login));
    return cookieHeader(res);
  }

  it('POST /refresh swaps the tokens', async () => {
    const app = testApp();
    const session = await signedIn(app);

    const res = await app.request('/api/auth/refresh', json({}, session));

    expect(res.status).toBe(200);
    expect(setCookie(res, 'egt_at')).toMatch(/^egt_at=access\.ana;/);
    expect(setCookie(res, 'egt_rt')).not.toBe(session.match(/egt_rt=[^;]+/)?.[0]);
  });

  it('POST /refresh signs out when the refresh token no longer works', async () => {
    const res = await testApp().request('/api/auth/refresh', json({}, 'egt_rt=velho'));

    expect(res.status).toBe(401);
    expect(setCookie(res, 'egt_hint')).toMatch(/^egt_hint=; Max-Age=0;/);
  });

  it('POST /logout ends the session and removes the cookies', async () => {
    const identity = createFakeIdentity();
    const app = testApp({ identity });
    const session = await signedIn(app);

    const res = await app.request('/api/auth/logout', json({}, session));

    expect(res.status).toBe(200);
    expect(identity.revoked).toEqual([session.match(/egt_rt=([^;]+)/)?.[1]]);
    expect(res.headers.getSetCookie().every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  });

  it('POST /logout works even without a session', async () => {
    const res = await testApp().request('/api/auth/logout', json({}));

    expect(res.status).toBe(200);
  });
});
```

Run: `pnpm exec vitest run --project api test/auth-routes.test.ts`
Expected: FAIL (as rotas `/api/auth/*` respondem 404).

- [ ] **Step 2: Implementar**

`apps/api/src/routes/auth.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import type { Logger } from '@aws-lambda-powertools/logger';
import type { ProfileRepository } from '@egt/db';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppConfig } from '../config.ts';
import { apiError } from '../errors.ts';
import { RateLimitedError, type IdentityProvider, type Tokens } from '../identity.ts';
import { clearSession, COOKIES, cookieOptions, setSession } from '../session.ts';

const LOGIN_MINUTES = 15;
const GOOGLE_MINUTES = 10;
const HOME = '/eu/';

const startBody = z.object({ email: z.email().max(254) });
const verifyBody = z.object({ code: z.string().regex(/^\d{6,8}$/) });
/** Only paths of the site itself (no other host, no query): where to go after signing in. */
const nextPath = z
  .string()
  .max(200)
  .regex(/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/);
const pendingGoogle = z.object({
  state: z.string(),
  verifier: z.string(),
  next: nextPath,
  retried: z.boolean(),
});
type PendingGoogle = z.infer<typeof pendingGoogle>;

const invalidRequest = apiError(
  'invalid_request',
  'Os dados enviados não estão no formato esperado.',
);
const rateLimited = apiError(
  'rate_limited',
  'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
);

const random = (bytes: number) => randomBytes(bytes).toString('base64url');
const encode = (value: PendingGoogle) => Buffer.from(JSON.stringify(value)).toString('base64url');

function decode(value: string | undefined): PendingGoogle | null {
  if (value === undefined) return null;
  try {
    const parsed = pendingGoogle.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface AuthDeps {
  config: AppConfig;
  logger: Logger;
  identity: IdentityProvider;
  profiles: ProfileRepository;
}

/** Sign-in with an e-mail code or Google, session refresh and logout (spec §3.4 and §5.2). */
export function authRoutes({ config, logger, identity, profiles }: AuthDeps) {
  const secure = config.environment !== 'local';
  const redirectUri = `${config.siteOrigin}/api/auth/callback`;

  /** Sets the session and tells whether the learner still has to finish sign-up. */
  async function signIn(c: Context, tokens: Tokens): Promise<boolean> {
    setSession(c, tokens, secure);
    const found = await identity.verifyAccessToken(tokens.accessToken);
    if (found === null) throw new Error('Identity provider issued an invalid access token');
    return (await profiles.get(found.sub)) !== null;
  }

  function startGoogle(c: Context, next: string, retried: boolean) {
    const pending = { state: random(16), verifier: random(32), next, retried };
    setCookie(
      c,
      COOKIES.oauth,
      encode(pending),
      cookieOptions(secure, '/api/auth', GOOGLE_MINUTES * 60),
    );
    const codeChallenge = createHash('sha256').update(pending.verifier).digest('base64url');
    return c.redirect(
      identity.googleAuthorizeUrl({ state: pending.state, codeChallenge, redirectUri }),
      302,
    );
  }

  return new Hono()
    .post('/email/start', async (c) => {
      const body = startBody.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json(invalidRequest, 400);
      try {
        const state = await identity.startEmailLogin(body.data.email.toLowerCase());
        setCookie(c, COOKIES.login, state, cookieOptions(secure, '/api/auth', LOGIN_MINUTES * 60));
        // Same answer for new and existing accounts: nobody learns who studies here.
        return c.json({ status: 'code_sent' });
      } catch (error) {
        if (error instanceof RateLimitedError) return c.json(rateLimited, 429);
        throw error;
      }
    })
    .post('/email/verify', async (c) => {
      const state = getCookie(c, COOKIES.login);
      if (state === undefined) {
        return c.json(
          apiError('login_expired', 'O tempo para digitar o código acabou. Peça um novo código.'),
          400,
        );
      }
      const body = verifyBody.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json(invalidRequest, 400);
      try {
        const result = await identity.finishEmailLogin(state, body.data.code);
        if ('error' in result) {
          return c.json(
            apiError(
              'invalid_code',
              'Código incorreto ou vencido. Confira o e-mail ou peça um novo código.',
            ),
            400,
          );
        }
        deleteCookie(c, COOKIES.login, { path: '/api/auth', secure });
        const profileComplete = await signIn(c, result.tokens);
        logger.info('signed_in', { method: 'email', profileComplete });
        return c.json({ profileComplete });
      } catch (error) {
        if (error instanceof RateLimitedError) return c.json(rateLimited, 429);
        throw error;
      }
    })
    .get('/google', (c) => {
      const next = nextPath.safeParse(c.req.query('next'));
      return startGoogle(c, next.success ? next.data : HOME, c.req.query('retry') === '1');
    })
    .get('/callback', async (c) => {
      const pending = decode(getCookie(c, COOKIES.oauth));
      deleteCookie(c, COOKIES.oauth, { path: '/api/auth', secure });
      const failed = () => c.redirect('/entrar/?erro=google', 302);
      if (pending === null || c.req.query('state') !== pending.state) return failed();

      const error = c.req.query('error');
      if (error !== undefined) {
        // The first Google sign-in of someone who already has an account links the two and
        // fails once on purpose (pre sign-up trigger): try again, only once (ADR 0024).
        if (!pending.retried && c.req.query('error_description')?.includes('PreSignUp')) {
          return startGoogle(c, pending.next, true);
        }
        logger.warn('google_sign_in_failed', { error });
        return failed();
      }

      const code = c.req.query('code');
      if (code === undefined) return failed();
      let tokens: Tokens;
      try {
        tokens = await identity.finishGoogleLogin({
          code,
          codeVerifier: pending.verifier,
          redirectUri,
        });
      } catch (exchangeError) {
        logger.warn('google_code_exchange_failed', { error: exchangeError });
        return failed();
      }
      const profileComplete = await signIn(c, tokens);
      logger.info('signed_in', { method: 'google', profileComplete });
      // The sign-in page finishes: sign-up when needed, then this device's progress.
      return c.redirect(`/entrar/?entrou=google&next=${encodeURIComponent(pending.next)}`, 302);
    })
    .post('/refresh', async (c) => {
      const refreshToken = getCookie(c, COOKIES.refresh);
      const tokens = refreshToken === undefined ? null : await identity.refresh(refreshToken);
      if (tokens === null) {
        clearSession(c, secure);
        return c.json(apiError('unauthenticated', 'Entre na sua conta para continuar.'), 401);
      }
      setSession(c, tokens, secure);
      return c.json({ status: 'refreshed' });
    })
    .post('/logout', async (c) => {
      const refreshToken = getCookie(c, COOKIES.refresh);
      if (refreshToken !== undefined) {
        try {
          await identity.revoke(refreshToken);
        } catch (error) {
          // The cookies go away anyway; the refresh token expires on its own.
          logger.warn('revoke_failed', { error });
        }
      }
      clearSession(c, secure);
      return c.json({ status: 'signed_out' });
    });
}
```

Em `apps/api/src/app.ts`, monte as rotas:

```diff
--- a/apps/api/src/app.ts
+++ b/apps/api/src/app.ts
@@ -5,6 +5,7 @@ import { Hono } from 'hono';
 import type { AppConfig } from './config.ts';
 import { apiError } from './errors.ts';
 import type { IdentityProvider } from './identity.ts';
+import { authRoutes } from './routes/auth.ts';
 import { healthRoutes } from './routes/health.ts';
 import { progressRoutes } from './routes/progress.ts';
 import { limitBody, noStore, requireOriginVerify, requireSiteOrigin } from './security.ts';
@@ -28,6 +29,7 @@ export function createApp(deps: AppDeps) {
   app.use(requireSiteOrigin(deps.config.siteOrigin));
   app.use(limitBody);
   app.route('/health', healthRoutes(deps));
+  app.route('/auth', authRoutes(deps));
   app.route('/progress', progressRoutes(deps));
   app.notFound((c) => c.json(apiError('not_found', 'Rota não encontrada.'), 404));
   app.onError((error, c) => {
```

Run: `pnpm exec vitest run --project api`
Expected: PASS.

- [ ] **Step 3: Conferir e fazer o commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: sem erros.

```bash
git add apps/api
git commit -m "feat(api): login por código no e-mail e com Google, renovação e saída" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Conta do aluno: cadastro com idade mínima, exportar e excluir

**Files:**
- Create: `packages/core/src/account.ts`, `packages/core/test/account.test.ts`, `apps/api/src/routes/me.ts`, `apps/api/test/me.test.ts`
- Modify: `packages/core/src/index.ts`, `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `requireIdentity` e `clearSession` (Task 3); `ProfileRepository` e `ProgressRepository.deleteAll` (Task 2).
- Produces:
  - Em `@egt/core`: `MIN_AGE = 12`, `TERMS_VERSION = '2026-10-10'` e `latestBirthYear(now): number`, que dá o ano UTC menos 13.
  - Na API: `meRoutes({ config, logger, identity, profiles, progress, now? })`, montado em `/api/me`.
  - Um token de conta já apagada é tratado como sessão encerrada (401 e cookies limpos), e o `PATCH` não recria a conta.

- [ ] **Step 1: Teste da regra de idade**

`packages/core/test/account.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { latestBirthYear } from '../src/index.ts';

describe('latestBirthYear', () => {
  it('keeps out everyone who may still be under 12', () => {
    expect(latestBirthYear(new Date('2026-10-10T12:00:00Z'))).toBe(2013);
    expect(latestBirthYear(new Date('2027-01-01T00:00:00Z'))).toBe(2014);
  });
});
```

Run: `pnpm exec vitest run --project core`
Expected: FAIL (`latestBirthYear` não existe).

- [ ] **Step 2: Implementar a regra**

`packages/core/src/account.ts`:

```ts
/** Spec §5.5: children under 12 cannot have an account (LGPD art. 14). */
export const MIN_AGE = 12;

/** Version of the terms of use and privacy policy the sign-up accepts (dates of the texts). */
export const TERMS_VERSION = '2026-10-10';

/**
 * Last birth year that may sign up. Only the year is known, so someone born in
 * `currentYear - 12` may still be 11: the rule keeps them out until the next year.
 */
export function latestBirthYear(now: Date): number {
  return now.getUTCFullYear() - MIN_AGE - 1;
}
```

`packages/core/src/index.ts`:

```ts
export * from './account.ts';
export * from './progress.ts';
```

Run: `pnpm exec vitest run --project core`
Expected: PASS.

- [ ] **Step 3: Testes das rotas da conta**

`apps/api/test/me.test.ts`. A data dos testes é `2026-10-09`, então quem nasceu em 2014 é recusado e quem nasceu em 2013 entra:

```ts
import { createMemoryProfileRepository, createMemoryProgressRepository } from '@egt/db';
import { describe, expect, it } from 'vitest';
import { createFakeIdentity } from './fake-identity.ts';
import { learner, NOW, PROFILE, testApp } from './helpers.ts';

const patch = (body: unknown, sub = 'cris') => ({
  method: 'PATCH',
  headers: learner(sub),
  body: JSON.stringify(body),
});

/** Cris has an account but has not finished sign-up yet. */
function appWithCris() {
  const identity = createFakeIdentity({
    'ana@example.com': 'ana',
    'cris@example.com': 'cris',
  });
  const profiles = createMemoryProfileRepository({ ana: PROFILE });
  return { app: testApp({ identity, profiles }), identity, profiles };
}

describe('GET /api/me', () => {
  it('shows the account e-mail and profile', async () => {
    const res = await testApp().request('/api/me', { headers: learner('ana') });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'ana@example.com', profile: PROFILE });
  });

  it('shows no profile before sign-up is complete', async () => {
    const { app } = appWithCris();

    const res = await app.request('/api/me', { headers: learner('cris') });

    expect(await res.json()).toEqual({ email: 'cris@example.com', profile: null });
  });

  it('signs out a token whose account was deleted', async () => {
    const res = await testApp().request('/api/me', { headers: learner('quem') });

    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().some((cookie) => cookie.startsWith('egt_hint=;'))).toBe(true);
  });

  it('needs a session', async () => {
    const res = await testApp().request('/api/me');

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/me', () => {
  it('finishes sign-up with the birth year and the accepted terms', async () => {
    const { app, profiles } = appWithCris();

    const res = await app.request('/api/me', patch({ birthYear: 2013, acceptTerms: true }));

    const profile = {
      birthYear: 2013,
      termsVersion: '2026-10-10',
      termsAcceptedAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    };
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ profile });
    expect(await profiles.get('cris')).toEqual(profile);
  });

  it('refuses anyone who may be under 12 and deletes the account', async () => {
    const { app, identity, profiles } = appWithCris();

    const res = await app.request('/api/me', patch({ birthYear: 2014, acceptTerms: true }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'too_young',
        message:
          'Por enquanto, a Escola é para quem nasceu até 2013. Apagamos o cadastro que você começou.',
      },
    });
    expect(identity.accounts.has('cris@example.com')).toBe(false);
    expect(await profiles.get('cris')).toBeNull();
    expect(res.headers.getSetCookie().some((cookie) => cookie.startsWith('egt_at=;'))).toBe(true);
  });

  it('needs the terms accepted and a real birth year', async () => {
    const { app } = appWithCris();

    for (const body of [
      { birthYear: 2000 },
      { birthYear: 2000, acceptTerms: false },
      { birthYear: '2000', acceptTerms: true },
      { birthYear: 2027, acceptTerms: true },
      { birthYear: 1899, acceptTerms: true },
    ]) {
      const res = await app.request('/api/me', patch(body));

      expect(res.status).toBe(400);
    }
  });

  it('never changes a finished sign-up', async () => {
    const res = await testApp().request(
      '/api/me',
      patch({ birthYear: 1990, acceptTerms: true }, 'ana'),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'profile_exists', message: 'Seu cadastro já está completo.' },
    });
  });

  it('does not bring a deleted account back', async () => {
    const { app, profiles } = appWithCris();

    const res = await app.request('/api/me', patch({ birthYear: 2000, acceptTerms: true }, 'quem'));

    expect(res.status).toBe(401);
    expect(await profiles.get('quem')).toBeNull();
  });
});

describe('GET /api/me/export', () => {
  it('downloads everything the school keeps about the learner', async () => {
    const progress = createMemoryProgressRepository();
    await progress.merge(
      'ana',
      { site: { completedLessons: ['a'], correctAnswers: [], updatedAt: NOW.toISOString() } },
      NOW,
    );

    const res = await testApp({ progress }).request('/api/me/export', { headers: learner('ana') });

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="meus-dados-escola-gratis.json"',
    );
    expect(await res.json()).toEqual({
      exportedAt: NOW.toISOString(),
      account: { email: 'ana@example.com' },
      profile: PROFILE,
      progress: {
        version: 1,
        courses: {
          site: { completedLessons: ['a'], correctAnswers: [], updatedAt: NOW.toISOString() },
        },
      },
    });
  });
});

describe('DELETE /api/me', () => {
  it('deletes the progress, the profile and the account, and signs out', async () => {
    const identity = createFakeIdentity({ 'ana@example.com': 'ana' });
    const progress = createMemoryProgressRepository();
    const profiles = createMemoryProfileRepository({ ana: PROFILE });
    await progress.merge(
      'ana',
      { site: { completedLessons: ['a'], correctAnswers: [], updatedAt: NOW.toISOString() } },
      NOW,
    );
    const app = testApp({ identity, progress, profiles });

    const res = await app.request('/api/me', { method: 'DELETE', headers: learner('ana') });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'deleted' });
    expect(await progress.get('ana')).toEqual({ version: 1, courses: {} });
    expect(await profiles.get('ana')).toBeNull();
    expect(identity.accounts.size).toBe(0);
    expect(res.headers.getSetCookie().every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  });

  it('needs the request to come from the site', async () => {
    const identity = createFakeIdentity({ 'ana@example.com': 'ana' });

    const res = await testApp({ identity }).request('/api/me', {
      method: 'DELETE',
      headers: { cookie: 'egt_at=access.ana', origin: 'https://outro.example' },
    });

    expect(res.status).toBe(400);
    expect(identity.accounts.has('ana@example.com')).toBe(true);
  });
});
```

Run: `pnpm exec vitest run --project api test/me.test.ts`
Expected: FAIL (`/api/me` responde 404).

- [ ] **Step 4: Implementar**

`apps/api/src/routes/me.ts`:

```ts
import type { Logger } from '@aws-lambda-powertools/logger';
import { latestBirthYear, TERMS_VERSION } from '@egt/core';
import type { ProfileRepository, ProgressRepository } from '@egt/db';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireIdentity, type AuthEnv } from '../auth.ts';
import type { AppConfig } from '../config.ts';
import { apiError } from '../errors.ts';
import type { IdentityProvider } from '../identity.ts';
import { clearSession } from '../session.ts';

const profileBody = z.object({
  birthYear: z.number().int().min(1900),
  acceptTerms: z.literal(true),
});

export interface MeDeps {
  config: AppConfig;
  logger: Logger;
  identity: IdentityProvider;
  profiles: ProfileRepository;
  progress: ProgressRepository;
  now?: () => Date;
}

/** The learner's own account: profile, sign-up, data export and deletion (spec §5.5). */
export function meRoutes({
  config,
  logger,
  identity,
  profiles,
  progress,
  now = () => new Date(),
}: MeDeps) {
  const secure = config.environment !== 'local';

  /** A token outlives a deleted account until it expires: treat that as signed out. */
  function accountGone(c: Context) {
    clearSession(c, secure);
    return c.json(apiError('unauthenticated', 'Entre na sua conta para continuar.'), 401);
  }

  return new Hono<AuthEnv>()
    .use(requireIdentity(identity))
    .get('/', async (c) => {
      const { sub } = c.var.identity;
      const email = await identity.email(sub);
      if (email === null) return accountGone(c);
      return c.json({ email, profile: await profiles.get(sub) });
    })
    .patch('/', async (c) => {
      const body = profileBody.safeParse(await c.req.json().catch(() => undefined));
      const today = now();
      if (!body.success || body.data.birthYear > today.getUTCFullYear()) {
        return c.json(
          apiError('invalid_request', 'Os dados enviados não estão no formato esperado.'),
          400,
        );
      }
      const { sub } = c.var.identity;
      if ((await identity.email(sub)) === null) return accountGone(c);

      const limit = latestBirthYear(today);
      if (body.data.birthYear > limit) {
        // Nothing else was stored: learning data needs a complete sign-up.
        await identity.deleteUser(sub);
        clearSession(c, secure);
        logger.info('sign_up_refused_age');
        return c.json(
          apiError(
            'too_young',
            `Por enquanto, a Escola é para quem nasceu até ${limit}. Apagamos o cadastro que você começou.`,
          ),
          400,
        );
      }

      const at = today.toISOString();
      const profile = {
        birthYear: body.data.birthYear,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: at,
        createdAt: at,
      };
      if ((await profiles.create(sub, profile)) === 'exists') {
        return c.json(apiError('profile_exists', 'Seu cadastro já está completo.'), 409);
      }
      logger.info('sign_up_completed');
      return c.json({ profile }, 201);
    })
    .get('/export', async (c) => {
      const { sub } = c.var.identity;
      const email = await identity.email(sub);
      if (email === null) return accountGone(c);
      const [profile, learning] = await Promise.all([profiles.get(sub), progress.get(sub)]);
      c.header('content-disposition', 'attachment; filename="meus-dados-escola-gratis.json"');
      return c.json({
        exportedAt: now().toISOString(),
        account: { email },
        profile,
        progress: learning,
      });
    })
    .delete('/', async (c) => {
      const { sub } = c.var.identity;
      // Data first: if the account deletion fails, a retry finds the account and finishes.
      await progress.deleteAll(sub);
      await profiles.delete(sub);
      await identity.deleteUser(sub);
      clearSession(c, secure);
      logger.info('account_deleted');
      return c.json({ status: 'deleted' });
    });
}
```

Em `apps/api/src/app.ts`:

```diff
--- a/apps/api/src/app.ts
+++ b/apps/api/src/app.ts
@@ -7,6 +7,7 @@ import { apiError } from './errors.ts';
 import type { IdentityProvider } from './identity.ts';
 import { authRoutes } from './routes/auth.ts';
 import { healthRoutes } from './routes/health.ts';
+import { meRoutes } from './routes/me.ts';
 import { progressRoutes } from './routes/progress.ts';
 import { limitBody, noStore, requireOriginVerify, requireSiteOrigin } from './security.ts';
 
@@ -30,6 +31,7 @@ export function createApp(deps: AppDeps) {
   app.use(limitBody);
   app.route('/health', healthRoutes(deps));
   app.route('/auth', authRoutes(deps));
+  app.route('/me', meRoutes(deps));
   app.route('/progress', progressRoutes(deps));
   app.notFound((c) => c.json(apiError('not_found', 'Rota não encontrada.'), 404));
   app.onError((error, c) => {
```

Run: `pnpm exec vitest run --project api`
Expected: PASS.

- [ ] **Step 5: Conferir e fazer o commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: sem erros.

```bash
git add packages/core apps/api
git commit -m "feat(api): conta do aluno com idade mínima no cadastro, exportar e excluir" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cognito na Lambda

O adaptador do Cognito (ADR 0024):
- **Código por e-mail:** um e-mail novo recebe `SignUp` sem senha; um e-mail que já tem conta recebe `AdminInitiateAuth` com `USER_AUTH` e `EMAIL_OTP`. A resposta é a mesma nos dois casos.
- **Google:** pelo domínio do pool (`/oauth2/authorize` e `/oauth2/token`, com PKCE e o segredo do cliente).
- **Sessão:** refresh tokens que giram (`GetTokensFromRefreshToken`) e revogação no logout.
- **Conta:** e-mail lido com `AdminGetUser`; exclusão que desvincula o Google antes.
- **Tokens:** conferidos com `aws-jwt-verify`.

Tudo testado com um cliente falso do SDK e tokens assinados no próprio teste.

**Files:**
- Create: `apps/api/src/identity/cognito.ts`, `apps/api/test/cognito.test.ts`
- Modify: `apps/api/package.json`, `apps/api/src/config.ts`, `apps/api/src/lambda.ts`, `apps/api/test/config.test.ts`, `apps/api/test/bundle.test.ts`

**Interfaces:**
- Consumes: `IdentityProvider`, `RateLimitedError`, `Tokens`, `CodeCheck` (Task 3).
- Produces:
  - `interface CognitoSettings { userPoolId; clientId; clientSecret; domain }`.
  - `createCognitoIdentity(settings, { client?, fetch?, jwks? }): IdentityProvider`.
  - `AppConfig.cognito?: CognitoSettings`, obrigatório fora do local, com as variáveis `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `USER_POOL_CLIENT_SECRET` e `AUTH_DOMAIN`.

- [ ] **Step 1: Dependências**

Run: `pnpm --filter @egt/api add @aws-sdk/client-cognito-identity-provider@^3.1149.0 aws-jwt-verify@^5.2.1 && pnpm --filter @egt/api add -D jose@^6.2.12`
Expected: `apps/api/package.json` fica assim:

```json
{
  "name": "@egt/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch --env-file-if-exists=../../.env src/server.ts",
    "build": "node scripts/build.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@aws-lambda-powertools/logger": "^2.36.0",
    "@aws-sdk/client-cognito-identity-provider": "^3.1149.0",
    "@egt/core": "workspace:*",
    "@egt/db": "workspace:*",
    "@hono/node-server": "^2.1.3",
    "aws-jwt-verify": "^5.2.1",
    "hono": "^4.13.13",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@egt/content": "workspace:*",
    "@types/node": "^24.19.1",
    "esbuild": "^0.28.2",
    "jose": "^6.2.12",
    "typescript": "~6.0.3"
  }
}
```

- [ ] **Step 2: Testes**

`apps/api/test/cognito.test.ts`:

```ts
import { createHmac } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { RateLimitedError } from '../src/identity.ts';
import { createCognitoIdentity, type CognitoSettings } from '../src/identity/cognito.ts';

const settings: CognitoSettings = {
  userPoolId: 'sa-east-1_Teste123',
  clientId: 'cliente-teste',
  clientSecret: 'segredo-do-cliente',
  domain: 'auth.example.com',
};
const hash = (username: string) =>
  createHmac('sha256', settings.clientSecret)
    .update(username + settings.clientId)
    .digest('base64');
const result = { AccessToken: 'at', RefreshToken: 'rt', ExpiresIn: 3600 };

type Reply = (input: Record<string, unknown>) => unknown;

/** Cognito stand-in: answers each command by name and remembers what was sent. */
function fakeClient(replies: Record<string, Reply>) {
  const sent: { command: string; input: Record<string, unknown> }[] = [];
  return {
    sent,
    async send(command: { constructor: { name: string }; input: unknown }) {
      const name = command.constructor.name.replace(/Command$/, '');
      const input = command.input as Record<string, unknown>;
      sent.push({ command: name, input });
      const reply = replies[name];
      if (reply === undefined) throw new Error(`Unexpected ${name}`);
      return reply(input);
    },
  };
}

const failure = (name: string) => () => {
  const error = new Error(name);
  error.name = name;
  throw error;
};

function provider(replies: Record<string, Reply>, extra = {}) {
  const client = fakeClient(replies);
  // The fake only implements send(); the adapter uses nothing else.
  const identity = createCognitoIdentity(settings, { client: client as never, ...extra });
  return { identity, sent: client.sent };
}

describe('Cognito e-mail sign-in', () => {
  it('signs up a new e-mail without a password', async () => {
    const { identity, sent } = provider({ SignUp: () => ({ Session: 's1' }) });

    const state = await identity.startEmailLogin('ana@example.com');

    expect(sent).toEqual([
      {
        command: 'SignUp',
        input: {
          ClientId: 'cliente-teste',
          Username: 'ana@example.com',
          SecretHash: hash('ana@example.com'),
          UserAttributes: [{ Name: 'email', Value: 'ana@example.com' }],
        },
      },
    ]);
    expect(JSON.parse(Buffer.from(state, 'base64url').toString())).toEqual({
      kind: 'signup',
      username: 'ana@example.com',
      session: 's1',
    });
  });

  it('asks for a sign-in code when the account exists', async () => {
    const { identity, sent } = provider({
      SignUp: failure('UsernameExistsException'),
      AdminInitiateAuth: () => ({
        ChallengeName: 'EMAIL_OTP',
        ChallengeParameters: { USERNAME: 'uuid-da-ana' },
        Session: 's2',
      }),
    });

    const state = await identity.startEmailLogin('ana@example.com');

    expect(sent[1]).toEqual({
      command: 'AdminInitiateAuth',
      input: {
        UserPoolId: 'sa-east-1_Teste123',
        ClientId: 'cliente-teste',
        AuthFlow: 'USER_AUTH',
        AuthParameters: {
          USERNAME: 'ana@example.com',
          PREFERRED_CHALLENGE: 'EMAIL_OTP',
          SECRET_HASH: hash('ana@example.com'),
        },
      },
    });
    expect(JSON.parse(Buffer.from(state, 'base64url').toString())).toEqual({
      kind: 'signin',
      username: 'uuid-da-ana',
      session: 's2',
    });
  });

  it('starts over a sign-up that was never confirmed', async () => {
    let signUps = 0;
    const { identity, sent } = provider({
      SignUp: (input) => {
        signUps += 1;
        if (signUps === 1) failure('UsernameExistsException')();
        return { Session: `s-${input.Username}` };
      },
      AdminInitiateAuth: failure('UserNotConfirmedException'),
      AdminDeleteUser: () => ({}),
    });

    await identity.startEmailLogin('ana@example.com');

    expect(sent.map(({ command }) => command)).toEqual([
      'SignUp',
      'AdminInitiateAuth',
      'AdminDeleteUser',
      'SignUp',
    ]);
  });

  it('turns Cognito throttling into RateLimitedError', async () => {
    const { identity } = provider({ SignUp: failure('LimitExceededException') });

    await expect(identity.startEmailLogin('ana@example.com')).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  const state = (kind: 'signup' | 'signin', username = 'ana@example.com') =>
    Buffer.from(JSON.stringify({ kind, username, session: 's1' })).toString('base64url');

  it('confirms a sign-up and signs in with the confirmation session', async () => {
    const { identity, sent } = provider({
      ConfirmSignUp: () => ({ Session: 's3' }),
      AdminInitiateAuth: () => ({ AuthenticationResult: result }),
    });

    expect(await identity.finishEmailLogin(state('signup'), '123456')).toEqual({
      tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 },
    });
    expect(sent).toEqual([
      {
        command: 'ConfirmSignUp',
        input: {
          ClientId: 'cliente-teste',
          Username: 'ana@example.com',
          ConfirmationCode: '123456',
          SecretHash: hash('ana@example.com'),
          Session: 's1',
        },
      },
      {
        command: 'AdminInitiateAuth',
        input: {
          UserPoolId: 'sa-east-1_Teste123',
          ClientId: 'cliente-teste',
          AuthFlow: 'USER_AUTH',
          AuthParameters: { USERNAME: 'ana@example.com', SECRET_HASH: hash('ana@example.com') },
          Session: 's3',
        },
      },
    ]);
  });

  it('answers the sign-in challenge with the code', async () => {
    const { identity, sent } = provider({
      AdminRespondToAuthChallenge: () => ({ AuthenticationResult: result }),
    });

    await identity.finishEmailLogin(state('signin', 'uuid-da-ana'), '12345678');

    expect(sent[0]).toEqual({
      command: 'AdminRespondToAuthChallenge',
      input: {
        UserPoolId: 'sa-east-1_Teste123',
        ClientId: 'cliente-teste',
        ChallengeName: 'EMAIL_OTP',
        Session: 's1',
        ChallengeResponses: {
          USERNAME: 'uuid-da-ana',
          EMAIL_OTP_CODE: '12345678',
          SECRET_HASH: hash('uuid-da-ana'),
        },
      },
    });
  });

  it('treats wrong, expired and broken codes alike', async () => {
    for (const name of [
      'CodeMismatchException',
      'ExpiredCodeException',
      'NotAuthorizedException',
    ]) {
      const { identity } = provider({ AdminRespondToAuthChallenge: failure(name) });

      expect(await identity.finishEmailLogin(state('signin'), '123456')).toEqual({
        error: 'invalid_code',
      });
    }
    const { identity } = provider({});
    expect(await identity.finishEmailLogin('lixo', '123456')).toEqual({ error: 'invalid_code' });
  });

  it('slows down after too many wrong codes', async () => {
    const { identity } = provider({
      AdminRespondToAuthChallenge: failure('TooManyFailedAttemptsException'),
    });

    await expect(identity.finishEmailLogin(state('signin'), '123456')).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });
});

describe('Cognito Google sign-in', () => {
  it('goes to Google through the pool domain, with PKCE', () => {
    const { identity } = provider({});

    const url = new URL(
      identity.googleAuthorizeUrl({
        state: 'estado',
        codeChallenge: 'desafio',
        redirectUri: 'https://example.com/api/auth/callback',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://auth.example.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'cliente-teste',
      redirect_uri: 'https://example.com/api/auth/callback',
      identity_provider: 'Google',
      scope: 'openid email',
      prompt: 'select_account',
      state: 'estado',
      code_challenge: 'desafio',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges the code at the token endpoint with the client secret', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
    };
    const { identity } = provider({}, { fetch: fakeFetch });

    const tokens = await identity.finishGoogleLogin({
      code: 'codigo',
      codeVerifier: 'verificador',
      redirectUri: 'https://example.com/api/auth/callback',
    });

    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 });
    expect(calls[0]?.url).toBe('https://auth.example.com/oauth2/token');
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('cliente-teste:segredo-do-cliente').toString('base64')}`,
    );
    expect(Object.fromEntries(calls[0]?.init.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      client_id: 'cliente-teste',
      code: 'codigo',
      redirect_uri: 'https://example.com/api/auth/callback',
      code_verifier: 'verificador',
    });
  });

  it('fails when the token endpoint refuses the code', async () => {
    const fakeFetch = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const { identity } = provider({}, { fetch: fakeFetch });

    await expect(
      identity.finishGoogleLogin({ code: 'x', codeVerifier: 'y', redirectUri: 'z' }),
    ).rejects.toThrow('Cognito token endpoint answered 400');
  });
});

describe('Cognito sessions', () => {
  it('refreshes with rotation and gives up on dead refresh tokens', async () => {
    const { identity, sent } = provider({
      GetTokensFromRefreshToken: () => ({ AuthenticationResult: result }),
    });

    expect(await identity.refresh('rt-velho')).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
    });
    expect(sent[0]?.input).toEqual({
      ClientId: 'cliente-teste',
      ClientSecret: 'segredo-do-cliente',
      RefreshToken: 'rt-velho',
    });

    for (const name of ['NotAuthorizedException', 'RefreshTokenReuseException']) {
      const dead = provider({ GetTokensFromRefreshToken: failure(name) });
      expect(await dead.identity.refresh('rt-velho')).toBeNull();
    }
  });

  it('revokes the refresh token on logout', async () => {
    const { identity, sent } = provider({ RevokeToken: () => ({}) });

    await identity.revoke('rt');

    expect(sent).toEqual([
      {
        command: 'RevokeToken',
        input: { Token: 'rt', ClientId: 'cliente-teste', ClientSecret: 'segredo-do-cliente' },
      },
    ]);
  });
});

describe('Cognito access tokens', () => {
  const issuer = `https://cognito-idp.sa-east-1.amazonaws.com/${settings.userPoolId}`;
  let sign: (claims: Record<string, unknown>, expiresIn?: string) => Promise<string>;
  let identity: ReturnType<typeof createCognitoIdentity>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const { kty = 'RSA', n = '', e = '' } = await exportJWK(publicKey);
    const jwk = { kty, n, e, kid: 'chave-1', alg: 'RS256', use: 'sig' };
    sign = (claims, expiresIn = '1h') =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'chave-1' })
        .setIssuer(issuer)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(privateKey);
    identity = createCognitoIdentity(settings, {
      client: fakeClient({}) as never,
      jwks: { keys: [jwk] },
    });
  });

  const claims = { sub: 'uuid-da-ana', token_use: 'access', client_id: 'cliente-teste' };

  it('accepts access tokens of this pool and client', async () => {
    expect(await identity.verifyAccessToken(await sign(claims))).toEqual({ sub: 'uuid-da-ana' });
  });

  it('refuses ID tokens, other clients, expired tokens and junk', async () => {
    for (const token of [
      await sign({ ...claims, token_use: 'id' }),
      await sign({ ...claims, client_id: 'outro' }),
      await sign(claims, '-1m'),
      'lixo',
    ]) {
      expect(await identity.verifyAccessToken(token)).toBeNull();
    }
  });
});

describe('Cognito accounts', () => {
  const ana = {
    Username: 'uuid-da-ana',
    UserAttributes: [
      { Name: 'email', Value: 'ana@example.com' },
      { Name: 'identities', Value: JSON.stringify([{ providerName: 'Google', userId: '1098' }]) },
    ],
  };

  it('finds the e-mail of an account', async () => {
    const { identity, sent } = provider({ AdminGetUser: () => ana });

    expect(await identity.email('uuid-da-ana')).toBe('ana@example.com');
    expect(sent[0]?.input).toEqual({ UserPoolId: 'sa-east-1_Teste123', Username: 'uuid-da-ana' });

    const gone = provider({ AdminGetUser: failure('UserNotFoundException') });
    expect(await gone.identity.email('uuid-da-ana')).toBeNull();
  });

  it('unlinks Google before deleting the account', async () => {
    const { identity, sent } = provider({
      AdminGetUser: () => ana,
      AdminDisableProviderForUser: () => ({}),
      AdminDeleteUser: () => ({}),
    });

    await identity.deleteUser('uuid-da-ana');

    expect(sent.slice(1)).toEqual([
      {
        command: 'AdminDisableProviderForUser',
        input: {
          UserPoolId: 'sa-east-1_Teste123',
          User: {
            ProviderName: 'Google',
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: '1098',
          },
        },
      },
      {
        command: 'AdminDeleteUser',
        input: { UserPoolId: 'sa-east-1_Teste123', Username: 'uuid-da-ana' },
      },
    ]);
  });

  it('does nothing when the account is already gone', async () => {
    const { identity, sent } = provider({ AdminGetUser: failure('UserNotFoundException') });

    await identity.deleteUser('uuid-da-ana');

    expect(sent.map(({ command }) => command)).toEqual(['AdminGetUser']);
  });
});
```

`apps/api/test/config.test.ts` passa a exigir o Cognito fora do local:

```diff
--- a/apps/api/test/config.test.ts
+++ b/apps/api/test/config.test.ts
@@ -20,6 +20,10 @@ describe('loadConfig', () => {
         TABLE_NAME: 'egt-prod-data-main',
         SITE_ORIGIN: 'https://escolagratisdetecnologia.com.br',
         ORIGIN_VERIFY_SECRET: 'segredo',
+        USER_POOL_ID: 'sa-east-1_Abc',
+        USER_POOL_CLIENT_ID: 'cliente',
+        USER_POOL_CLIENT_SECRET: 'segredo-do-cliente',
+        AUTH_DOMAIN: 'auth.escolagratisdetecnologia.com.br',
       }),
     ).toEqual({
       environment: 'prod',
@@ -27,6 +31,12 @@ describe('loadConfig', () => {
       tableName: 'egt-prod-data-main',
       siteOrigin: 'https://escolagratisdetecnologia.com.br',
       originVerifySecret: 'segredo',
+      cognito: {
+        userPoolId: 'sa-east-1_Abc',
+        clientId: 'cliente',
+        clientSecret: 'segredo-do-cliente',
+        domain: 'auth.escolagratisdetecnologia.com.br',
+      },
     });
   });
 
@@ -34,6 +44,18 @@ describe('loadConfig', () => {
     expect(() =>
       loadConfig({ APP_ENV: 'dev', APP_VERSION: '1', SITE_ORIGIN: 'x', ORIGIN_VERIFY_SECRET: 'y' }),
     ).toThrow('Missing TABLE_NAME (required when APP_ENV is dev).');
+    expect(() =>
+      loadConfig({
+        APP_ENV: 'dev',
+        APP_VERSION: '1',
+        TABLE_NAME: 't',
+        SITE_ORIGIN: 'x',
+        ORIGIN_VERIFY_SECRET: 'y',
+        USER_POOL_ID: 'p',
+        USER_POOL_CLIENT_ID: 'c',
+        AUTH_DOMAIN: 'auth.example.com',
+      }),
+    ).toThrow('Missing USER_POOL_CLIENT_SECRET (required when APP_ENV is dev).');
   });
 
   it('rejects unknown environments', () => {
```

`apps/api/test/bundle.test.ts` recebe as variáveis novas e confere que a sessão passa pelo Cognito:

```diff
--- a/apps/api/test/bundle.test.ts
+++ b/apps/api/test/bundle.test.ts
@@ -36,6 +36,10 @@ function invoke(
       TABLE_NAME: 'egt-test-data-main',
       SITE_ORIGIN: 'https://example.com',
       ORIGIN_VERIFY_SECRET: 'segredo',
+      USER_POOL_ID: 'sa-east-1_Teste123',
+      USER_POOL_CLIENT_ID: 'cliente',
+      USER_POOL_CLIENT_SECRET: 'segredo-do-cliente',
+      AUTH_DOMAIN: 'auth.example.com',
       AWS_REGION: 'sa-east-1',
       POWERTOOLS_LOG_LEVEL: 'SILENT',
     },
@@ -60,4 +64,10 @@ describe('Lambda bundle', () => {
   it('refuses requests that skip CloudFront', () => {
     expect(invoke('/api/health', {}).statusCode).toBe(403);
   });
+
+  it('checks the session with Cognito', () => {
+    const response = invoke('/api/me', { 'x-origin-verify': 'segredo', cookie: 'egt_at=lixo' });
+
+    expect(response.statusCode).toBe(401);
+  });
 });
```

Run: `pnpm exec vitest run --project api`
Expected: FAIL (`src/identity/cognito.ts` não existe; `loadConfig` não lê o Cognito).

- [ ] **Step 3: Implementar**

`apps/api/src/identity/cognito.ts`:

```ts
import { createHmac } from 'node:crypto';
import {
  AdminDeleteUserCommand,
  AdminDisableProviderForUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  GetTokensFromRefreshTokenCommand,
  RevokeTokenCommand,
  SignUpCommand,
  type AuthenticationResultType,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { Jwks } from 'aws-jwt-verify/jwk';
import { z } from 'zod';
import {
  RateLimitedError,
  type CodeCheck,
  type IdentityProvider,
  type Tokens,
} from '../identity.ts';

export interface CognitoSettings {
  userPoolId: string;
  clientId: string;
  clientSecret: string;
  /** Domain of the user pool (auth.<site domain>): Google sign-in goes through it. */
  domain: string;
}

export interface CognitoOptions {
  client?: Pick<CognitoIdentityProviderClient, 'send'>;
  fetch?: typeof fetch;
  /** Signing keys to trust without downloading them (tests). */
  jwks?: Jwks;
}

/** E-mail sign-in in progress: sign-up (new account) or sign-in, and the Cognito session. */
const pendingLogin = z.object({
  kind: z.enum(['signup', 'signin']),
  username: z.string(),
  session: z.string(),
});
type PendingLogin = z.infer<typeof pendingLogin>;

const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

const linkedIdentity = z.array(z.object({ providerName: z.string(), userId: z.string() }));

/** Google identities linked to the account (the `identities` attribute, a JSON string). */
function linkedIdentities(value: string | undefined) {
  try {
    return linkedIdentity.parse(JSON.parse(value ?? '[]'));
  } catch {
    return [];
  }
}

const named = (error: unknown, ...names: string[]) =>
  error instanceof Error && names.includes(error.name);

const THROTTLED = ['TooManyRequestsException', 'LimitExceededException'];
const BAD_CODE = ['CodeMismatchException', 'ExpiredCodeException', 'NotAuthorizedException'];

/**
 * Learner accounts in the Cognito user pool (Essentials): passwordless e-mail codes through the
 * server-side (Admin*) API, Google through the pool domain, refresh tokens that rotate (ADR 0024).
 */
export function createCognitoIdentity(
  settings: CognitoSettings,
  options: CognitoOptions = {},
): IdentityProvider {
  const client = options.client ?? new CognitoIdentityProviderClient({});
  const fetchFn = options.fetch ?? fetch;
  const { userPoolId, clientId, clientSecret, domain } = settings;
  const verifier = CognitoJwtVerifier.create({ userPoolId, tokenUse: 'access', clientId });
  if (options.jwks !== undefined) verifier.cacheJwks(options.jwks);

  const secretHash = (username: string) =>
    createHmac('sha256', clientSecret)
      .update(username + clientId)
      .digest('base64');
  const encode = (pending: PendingLogin) =>
    Buffer.from(JSON.stringify(pending)).toString('base64url');
  const decode = (state: string): PendingLogin | null => {
    try {
      const parsed = pendingLogin.safeParse(
        JSON.parse(Buffer.from(state, 'base64url').toString('utf8')),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  function tokensOf(result: AuthenticationResultType | undefined): Tokens {
    if (result?.AccessToken === undefined || result.ExpiresIn === undefined) {
      throw new Error('Cognito answered without tokens');
    }
    return {
      accessToken: result.AccessToken,
      ...(result.RefreshToken === undefined ? {} : { refreshToken: result.RefreshToken }),
      expiresIn: result.ExpiresIn,
    };
  }

  async function signUp(email: string): Promise<string> {
    const out = await client.send(
      new SignUpCommand({
        ClientId: clientId,
        Username: email,
        SecretHash: secretHash(email),
        UserAttributes: [{ Name: 'email', Value: email }],
      }),
    );
    if (out.Session === undefined) throw new Error('Cognito sign-up answered without a session');
    return encode({ kind: 'signup', username: email, session: out.Session });
  }

  async function signIn(email: string): Promise<string> {
    const out = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: 'USER_AUTH',
        AuthParameters: {
          USERNAME: email,
          PREFERRED_CHALLENGE: 'EMAIL_OTP',
          SECRET_HASH: secretHash(email),
        },
      }),
    );
    if (out.Session === undefined) throw new Error('Cognito sign-in answered without a session');
    // Cognito may answer with the internal user name; the code check must use the same one.
    const username = out.ChallengeParameters?.USERNAME ?? email;
    return encode({ kind: 'signin', username, session: out.Session });
  }

  async function user(sub: string) {
    try {
      return await client.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: sub }));
    } catch (error) {
      if (named(error, 'UserNotFoundException')) return null;
      throw error;
    }
  }

  return {
    async startEmailLogin(email) {
      try {
        try {
          return await signUp(email);
        } catch (error) {
          if (!named(error, 'UsernameExistsException')) throw error;
        }
        try {
          return await signIn(email);
        } catch (error) {
          if (!named(error, 'UserNotConfirmedException')) throw error;
          // Signed up before but never typed the code: start that sign-up over.
          await client.send(
            new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: email }),
          );
          return await signUp(email);
        }
      } catch (error) {
        if (named(error, ...THROTTLED)) throw new RateLimitedError();
        throw error;
      }
    },

    async finishEmailLogin(state, code): Promise<CodeCheck> {
      const pending = decode(state);
      if (pending === null) return { error: 'invalid_code' };
      const { username, session } = pending;
      try {
        if (pending.kind === 'signup') {
          const confirmed = await client.send(
            new ConfirmSignUpCommand({
              ClientId: clientId,
              Username: username,
              ConfirmationCode: code,
              SecretHash: secretHash(username),
              Session: session,
            }),
          );
          // The session from the confirmation signs the new learner in, without a second code.
          const out = await client.send(
            new AdminInitiateAuthCommand({
              UserPoolId: userPoolId,
              ClientId: clientId,
              AuthFlow: 'USER_AUTH',
              AuthParameters: { USERNAME: username, SECRET_HASH: secretHash(username) },
              Session: confirmed.Session,
            }),
          );
          return { tokens: tokensOf(out.AuthenticationResult) };
        }
        const out = await client.send(
          new AdminRespondToAuthChallengeCommand({
            UserPoolId: userPoolId,
            ClientId: clientId,
            ChallengeName: 'EMAIL_OTP',
            Session: session,
            ChallengeResponses: {
              USERNAME: username,
              EMAIL_OTP_CODE: code,
              SECRET_HASH: secretHash(username),
            },
          }),
        );
        return { tokens: tokensOf(out.AuthenticationResult) };
      } catch (error) {
        if (named(error, ...BAD_CODE)) return { error: 'invalid_code' };
        if (named(error, 'TooManyFailedAttemptsException', ...THROTTLED)) {
          throw new RateLimitedError();
        }
        throw error;
      }
    },

    googleAuthorizeUrl({ state, codeChallenge, redirectUri }) {
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        identity_provider: 'Google',
        scope: 'openid email',
        prompt: 'select_account',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return `https://${domain}/oauth2/authorize?${query}`;
    },

    async finishGoogleLogin({ code, codeVerifier, redirectUri }) {
      const res = await fetchFn(`https://${domain}/oauth2/token`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      if (!res.ok) throw new Error(`Cognito token endpoint answered ${res.status}`);
      const body = tokenResponse.parse(await res.json());
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresIn: body.expires_in,
      };
    },

    async refresh(refreshToken) {
      try {
        const out = await client.send(
          new GetTokensFromRefreshTokenCommand({
            ClientId: clientId,
            ClientSecret: clientSecret,
            RefreshToken: refreshToken,
          }),
        );
        return tokensOf(out.AuthenticationResult);
      } catch (error) {
        if (named(error, 'NotAuthorizedException', 'RefreshTokenReuseException')) return null;
        throw error;
      }
    },

    async revoke(refreshToken) {
      await client.send(
        new RevokeTokenCommand({
          Token: refreshToken,
          ClientId: clientId,
          ClientSecret: clientSecret,
        }),
      );
    },

    async verifyAccessToken(accessToken) {
      try {
        const payload = await verifier.verify(accessToken);
        return { sub: payload.sub };
      } catch {
        return null;
      }
    },

    async email(sub) {
      const found = await user(sub);
      return found?.UserAttributes?.find((attribute) => attribute.Name === 'email')?.Value ?? null;
    },

    async deleteUser(sub) {
      const found = await user(sub);
      if (found === null) return;
      // Unlink Google first, so a later Google sign-in starts a new account instead of failing.
      const identities = found.UserAttributes?.find((attribute) => attribute.Name === 'identities');
      for (const { providerName, userId } of linkedIdentities(identities?.Value)) {
        await client.send(
          new AdminDisableProviderForUserCommand({
            UserPoolId: userPoolId,
            User: {
              ProviderName: providerName,
              ProviderAttributeName: 'Cognito_Subject',
              ProviderAttributeValue: userId,
            },
          }),
        );
      }
      await client.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: sub }));
    },
  };
}
```

`apps/api/src/config.ts`:

```ts
import type { CognitoSettings } from './identity/cognito.ts';

export type Environment = 'local' | 'dev' | 'prod';

export interface AppConfig {
  environment: Environment;
  version: string;
  /** DynamoDB table: egt-<env>-data-main. */
  tableName: string;
  /** DynamoDB Local URL; only when running locally. */
  dynamodbEndpoint?: string;
  /** The site's origin: the only one allowed to send changes (CSRF, spec §3.6). */
  siteOrigin: string;
  /** Value CloudFront sends in x-origin-verify (ADR 0022); absent locally. */
  originVerifySecret?: string;
  /** Learner user pool (ADR 0024); absent locally. */
  cognito?: CognitoSettings;
}

const ENVIRONMENTS: readonly string[] = ['local', 'dev', 'prod'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = env.APP_ENV ?? 'local';
  if (!isEnvironment(environment)) {
    throw new Error(`Invalid APP_ENV "${environment}". Expected local, dev or prod.`);
  }
  if (environment === 'local') {
    return {
      environment,
      version: env.APP_VERSION ?? '0.0.0-local',
      tableName: env.TABLE_NAME ?? 'egt-local-data-main',
      dynamodbEndpoint: env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
      siteOrigin: env.SITE_ORIGIN ?? 'http://localhost:4321',
    };
  }
  return {
    environment,
    version: required(env, 'APP_VERSION'),
    tableName: required(env, 'TABLE_NAME'),
    siteOrigin: required(env, 'SITE_ORIGIN'),
    originVerifySecret: required(env, 'ORIGIN_VERIFY_SECRET'),
    cognito: {
      userPoolId: required(env, 'USER_POOL_ID'),
      clientId: required(env, 'USER_POOL_CLIENT_ID'),
      clientSecret: required(env, 'USER_POOL_CLIENT_SECRET'),
      domain: required(env, 'AUTH_DOMAIN'),
    },
  };
}

function isEnvironment(value: string): value is Environment {
  return ENVIRONMENTS.includes(value);
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name} (required when APP_ENV is ${env.APP_ENV}).`);
  return value;
}
```

`apps/api/src/lambda.ts`:

```ts
import type { ProgressCatalog } from '@egt/core';
import {
  checkDatabase,
  connect,
  createDynamoProfileRepository,
  createDynamoProgressRepository,
} from '@egt/db';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createCognitoIdentity } from './identity/cognito.ts';
import { createLogger } from './logger.ts';

/** Lessons of every course, from content/ (scripts/build.ts). */
declare const __PROGRESS_CATALOG__: ProgressCatalog;

const config = loadConfig();
if (config.cognito === undefined) throw new Error('Cognito settings are required in AWS.');
const logger = createLogger(config);
const db = connect({ table: config.tableName });
const handleRequest = handle(
  createApp({
    config,
    logger,
    progress: createDynamoProgressRepository(db),
    profiles: createDynamoProfileRepository(db),
    catalog: __PROGRESS_CATALOG__,
    checkDatabase: () => checkDatabase(db),
    identity: createCognitoIdentity(config.cognito),
  }),
);

export const handler: typeof handleRequest = async (event, context) => {
  logger.addContext(context);
  return handleRequest(event, context);
};
```

Run: `pnpm exec vitest run --project api`
Expected: PASS (o bundle continua por volta de 1,4 MB; `ls -la apps/api/dist` depois de `pnpm --filter @egt/api build`).

- [ ] **Step 4: Conferir e fazer o commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: sem erros.

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): Cognito na Lambda (código por e-mail, Google e sessões)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Login local com Mailpit e Google de mentira

O provedor local faz o papel do Cognito no `pnpm dev` e nos testes e2e:
- **Códigos:** de 6 dígitos, mandados ao Mailpit pela API HTTP dele e também mostrados no terminal. Valem 15 minutos e aceitam até 5 erros.
- **Contas:** em memória, com o `sub` derivado do e-mail. Assim, o progresso no DynamoDB Local continua do mesmo aluno depois de reiniciar a API.
- **Tokens:** assinados com uma chave gerada ao iniciar.
- **Google:** o mock-oauth2-server, com PKCE; o e-mail vem do `id_token` ou do usuário digitado.

O portão da revisão da 1B entra aqui: `requireLocal` impede o servidor local de rodar fora de `APP_ENV=local`, antes de conectar a qualquer coisa.

**Files:**
- Create: `apps/api/src/identity/local.ts`, `apps/api/test/local-identity.test.ts`
- Modify: `apps/api/src/identity.ts` (remove `noAccounts`), `apps/api/src/config.ts`, `apps/api/src/local.ts`, `apps/api/src/server.ts`, `apps/api/test/config.test.ts`, `apps/api/test/local.test.ts`, `docker-compose.yml`, `package.json`

**Interfaces:**
- Consumes: `IdentityProvider` (Task 3), `AppConfig` (Task 6).
- Produces:
  - `interface LocalIdentitySettings { mailpitUrl; googleIssuer }`.
  - `createLocalIdentity(settings, { fetch?, print?, now? }): Promise<IdentityProvider>`.
  - `localSub(email): string`, um UUID derivado do SHA-256 do e-mail.
  - `AppConfig.local?: LocalIdentitySettings`. Os padrões são `http://localhost:8025` e `http://localhost:8080/google`; as variáveis `MAILPIT_URL` e `FAKE_GOOGLE_ISSUER` trocam.
  - `requireLocal(config): LocalIdentitySettings`.
  - `pnpm db:up` passa a subir os três serviços.

- [ ] **Step 1: Testes**

`apps/api/test/local-identity.test.ts`:

```ts
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLocalIdentity, localSub } from '../src/identity/local.ts';

const settings = {
  mailpitUrl: 'http://mailpit.test',
  googleIssuer: 'http://google.test/google',
};

/** Mailpit and the fake Google, answering from memory. */
function services(idToken?: () => Promise<string>, jwks?: unknown) {
  const mail: { To: { Email: string }[]; Subject: string; Text: string }[] = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    if (target === 'http://mailpit.test/api/v1/send') {
      mail.push(JSON.parse(String(init?.body)));
      return Response.json({ ID: 'x' });
    }
    if (target === 'http://google.test/google/token' && idToken !== undefined) {
      return Response.json({ id_token: await idToken() });
    }
    if (target === 'http://google.test/google/jwks') return Response.json(jwks);
    return new Response('not found', { status: 404 });
  };
  return { mail, fetch: fakeFetch as typeof fetch };
}

describe('local e-mail sign-in', () => {
  it('sends the code to Mailpit and the console, and signs in with it', async () => {
    const printed: string[] = [];
    const { mail, fetch } = services();
    const identity = await createLocalIdentity(settings, {
      fetch,
      print: (message) => printed.push(message),
    });

    const state = await identity.startEmailLogin('ana@example.com');
    const code = /(\d{6})/.exec(printed[0] ?? '')?.[1] ?? '';
    const result = await identity.finishEmailLogin(state, code);

    expect(mail[0]?.To).toEqual([{ Email: 'ana@example.com' }]);
    expect(mail[0]?.Subject).toBe(`Seu código para entrar: ${code}`);
    expect('tokens' in result).toBe(true);
    if (!('tokens' in result)) return;
    const sub = localSub('ana@example.com');
    expect(await identity.verifyAccessToken(result.tokens.accessToken)).toEqual({ sub });
    expect(await identity.email(sub)).toBe('ana@example.com');
  });

  it('works without Mailpit, with the code on the console', async () => {
    const printed: string[] = [];
    const identity = await createLocalIdentity(settings, {
      fetch: async () => {
        throw new Error('connection refused');
      },
      print: (message) => printed.push(message),
    });

    const state = await identity.startEmailLogin('ana@example.com');

    expect(printed[0]).toMatch(/^Código para entrar na Escola \(só no ambiente local\): \d{6}$/);
    expect(state).toMatch(/^[\w-]{36}$/);
  });

  it('refuses wrong codes, expired codes and codes after five mistakes', async () => {
    const printed: string[] = [];
    let clock = 0;
    const identity = await createLocalIdentity(settings, {
      fetch: services().fetch,
      print: (message) => printed.push(message),
      now: () => clock,
    });
    const codeOf = (index: number) => /(\d{6})/.exec(printed[index] ?? '')?.[1] ?? '';

    const expiring = await identity.startEmailLogin('ana@example.com');
    clock = 16 * 60_000;
    expect(await identity.finishEmailLogin(expiring, codeOf(0))).toEqual({ error: 'invalid_code' });

    const guessed = await identity.startEmailLogin('ana@example.com');
    const wrong = codeOf(1) === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await identity.finishEmailLogin(guessed, wrong)).toEqual({ error: 'invalid_code' });
    }
    expect(await identity.finishEmailLogin(guessed, codeOf(1))).toEqual({ error: 'invalid_code' });
  });

  it('gives the same learner to the same e-mail, and only trusts its own tokens', async () => {
    const other = await createLocalIdentity(settings, { fetch: services().fetch, print: () => {} });
    const printed: string[] = [];
    const identity = await createLocalIdentity(settings, {
      fetch: services().fetch,
      print: (message) => printed.push(message),
    });
    const state = await identity.startEmailLogin('ana@example.com');
    const result = await identity.finishEmailLogin(
      state,
      /(\d{6})/.exec(printed[0] ?? '')?.[1] ?? '',
    );
    if (!('tokens' in result)) throw new Error('sign-in failed');

    expect(localSub('ana@example.com')).toBe(localSub('ana@example.com'));
    expect(localSub('ana@example.com')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(await other.verifyAccessToken(result.tokens.accessToken)).toBeNull();
    expect(await identity.verifyAccessToken('lixo')).toBeNull();
  });
});

describe('local sessions', () => {
  it('rotates refresh tokens and ends them on logout and deletion', async () => {
    const printed: string[] = [];
    const identity = await createLocalIdentity(settings, {
      fetch: services().fetch,
      print: (message) => printed.push(message),
    });
    const signIn = async () => {
      const state = await identity.startEmailLogin('ana@example.com');
      const result = await identity.finishEmailLogin(
        state,
        /(\d{6})/.exec(printed.at(-1) ?? '')?.[1] ?? '',
      );
      if (!('tokens' in result)) throw new Error('sign-in failed');
      return result.tokens.refreshToken ?? '';
    };

    const first = await signIn();
    const refreshed = await identity.refresh(first);
    expect(refreshed?.refreshToken).not.toBe(first);
    expect(await identity.refresh(first)).toBeNull();

    await identity.revoke(refreshed?.refreshToken ?? '');
    expect(await identity.refresh(refreshed?.refreshToken ?? '')).toBeNull();

    const last = await signIn();
    await identity.deleteUser(localSub('ana@example.com'));
    expect(await identity.refresh(last)).toBeNull();
    expect(await identity.email(localSub('ana@example.com'))).toBeNull();
  });
});

describe('local Google sign-in', () => {
  let privateKey: CryptoKey;
  let jwks: unknown;

  beforeAll(async () => {
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;
    jwks = { keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'google', alg: 'RS256' }] };
  });

  const idToken =
    (claims: Record<string, unknown>, issuer = settings.googleIssuer) =>
    () =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'google' })
        .setIssuer(issuer)
        .setAudience('egt-local')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

  const request = {
    code: 'c',
    codeVerifier: 'v',
    redirectUri: 'http://localhost:4321/api/auth/callback',
  };

  it('goes to mock-oauth2-server with PKCE', async () => {
    const identity = await createLocalIdentity(settings, { fetch: services().fetch });

    const url = new URL(
      identity.googleAuthorizeUrl({ state: 'e', codeChallenge: 'd', redirectUri: 'http://x/cb' }),
    );

    expect(url.origin + url.pathname).toBe('http://google.test/google/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('client_id')).toBe('egt-local');
  });

  it('signs in with the e-mail Google confirms', async () => {
    const { fetch } = services(idToken({ sub: 'qualquer', email: 'Bia@Example.com' }), jwks);
    const identity = await createLocalIdentity(settings, { fetch });

    const tokens = await identity.finishGoogleLogin(request);

    expect(await identity.verifyAccessToken(tokens.accessToken)).toEqual({
      sub: localSub('bia@example.com'),
    });
  });

  it('takes the e-mail typed as user on the mock login page', async () => {
    const { fetch } = services(idToken({ sub: 'cris@example.com' }), jwks);
    const identity = await createLocalIdentity(settings, { fetch });

    const tokens = await identity.finishGoogleLogin(request);

    expect(await identity.email(localSub('cris@example.com'))).toBe('cris@example.com');
    expect(tokens.refreshToken).toBeDefined();
  });

  it('refuses tokens without an e-mail or from another issuer', async () => {
    for (const token of [
      idToken({ sub: 'sem-email' }),
      idToken({ sub: 'x', email: 'ana@example.com' }, 'http://outro.test'),
    ]) {
      const identity = await createLocalIdentity(settings, { fetch: services(token, jwks).fetch });

      await expect(identity.finishGoogleLogin(request)).rejects.toThrow();
    }
  });
});
```

`apps/api/test/local.test.ts` ganha a trava:

```diff
--- a/apps/api/test/local.test.ts
+++ b/apps/api/test/local.test.ts
@@ -1,6 +1,6 @@
 import { connect, deleteTable } from '@egt/db';
 import { describe, expect, it } from 'vitest';
-import { connectLocalStorage } from '../src/local.ts';
+import { connectLocalStorage, requireLocal } from '../src/local.ts';
 import { config } from './helpers.ts';
 
 const endpoint =
@@ -29,3 +29,18 @@ describe('connectLocalStorage', () => {
     }
   });
 });
+
+describe('requireLocal', () => {
+  it('lets the local server start only with APP_ENV=local', () => {
+    const local = {
+      mailpitUrl: 'http://localhost:8025',
+      googleIssuer: 'http://localhost:8080/google',
+    };
+
+    expect(requireLocal({ ...config, local })).toEqual(local);
+    expect(() => requireLocal({ ...config, environment: 'dev', local })).toThrow(
+      'The local server only runs with APP_ENV=local.',
+    );
+    expect(() => requireLocal(config)).toThrow('The local server only runs with APP_ENV=local.');
+  });
+});
```

`apps/api/test/config.test.ts` ganha os padrões locais:

```diff
--- a/apps/api/test/config.test.ts
+++ b/apps/api/test/config.test.ts
@@ -9,6 +9,10 @@ describe('loadConfig', () => {
       tableName: 'egt-local-data-main',
       dynamodbEndpoint: 'http://localhost:8000',
       siteOrigin: 'http://localhost:4321',
+      local: {
+        mailpitUrl: 'http://localhost:8025',
+        googleIssuer: 'http://localhost:8080/google',
+      },
     });
   });
 
```

Run: `pnpm exec vitest run --project api`
Expected: FAIL (`src/identity/local.ts` e `requireLocal` não existem).

- [ ] **Step 2: Implementar**

`apps/api/src/identity/local.ts`:

```ts
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, customFetch, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { CodeCheck, IdentityProvider, Tokens } from '../identity.ts';

export interface LocalIdentitySettings {
  /** Mailpit HTTP API, where the codes arrive (http://localhost:8025). */
  mailpitUrl: string;
  /** Issuer of the fake Google, mock-oauth2-server (http://localhost:8080/google). */
  googleIssuer: string;
}

export interface LocalIdentityOptions {
  fetch?: typeof fetch;
  /** Where the code is printed too, so sign-in works without Mailpit. */
  print?: (message: string) => void;
  now?: () => number;
}

const CLIENT_ID = 'egt-local';
const ISSUER = 'egt-local';
const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;

/** Same e-mail, same learner across restarts: the progress in DynamoDB Local stays theirs. */
export function localSub(email: string): string {
  const hex = createHash('sha256').update(email).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Cognito stand-in for `pnpm dev` and the e2e tests: codes go to Mailpit (and the console),
 * Google is mock-oauth2-server, and tokens are signed with a key that lives in this process.
 * Accounts live in memory: after a restart, everyone signs in again.
 */
export async function createLocalIdentity(
  { mailpitUrl, googleIssuer }: LocalIdentitySettings,
  options: LocalIdentityOptions = {},
): Promise<IdentityProvider> {
  const fetchFn = options.fetch ?? fetch;
  const print = options.print ?? console.log;
  const now = options.now ?? Date.now;
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const googleKeys = createRemoteJWKSet(new URL(`${googleIssuer}/jwks`), {
    [customFetch]: fetchFn,
  });
  const accounts = new Map<string, string>();
  const codes = new Map<
    string,
    { email: string; code: string; expiresAt: number; attempts: number }
  >();
  const refreshTokens = new Map<string, string>();

  async function tokensFor(email: string): Promise<Tokens> {
    const sub = localSub(email);
    accounts.set(sub, email);
    const accessToken = await new SignJWT({ token_use: 'access', client_id: CLIENT_ID })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(sub)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const refreshToken = randomBytes(32).toString('base64url');
    refreshTokens.set(refreshToken, sub);
    return { accessToken, refreshToken, expiresIn: 3600 };
  }

  async function sendCode(email: string, code: string) {
    print(`Código para entrar na Escola (só no ambiente local): ${code}`);
    try {
      await fetchFn(`${mailpitUrl}/api/v1/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          From: { Email: 'nao-responda@escola.local', Name: 'Escola Grátis de Tecnologia' },
          To: [{ Email: email }],
          Subject: `Seu código para entrar: ${code}`,
          Text: `Use o código ${code} para entrar na Escola Grátis de Tecnologia. Ele vale por ${CODE_MINUTES} minutos.`,
        }),
      });
    } catch {
      // Mailpit is down: the code is on the console.
    }
  }

  return {
    async startEmailLogin(email) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const state = randomUUID();
      codes.set(state, { email, code, expiresAt: now() + CODE_MINUTES * 60_000, attempts: 0 });
      await sendCode(email, code);
      return state;
    },

    async finishEmailLogin(state, code): Promise<CodeCheck> {
      const pending = codes.get(state);
      if (pending === undefined || pending.expiresAt < now()) return { error: 'invalid_code' };
      if (pending.code !== code) {
        pending.attempts += 1;
        if (pending.attempts >= MAX_ATTEMPTS) codes.delete(state);
        return { error: 'invalid_code' };
      }
      codes.delete(state);
      return { tokens: await tokensFor(pending.email) };
    },

    googleAuthorizeUrl({ state, codeChallenge, redirectUri }) {
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        scope: 'openid email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return `${googleIssuer}/authorize?${query}`;
    },

    async finishGoogleLogin({ code, codeVerifier, redirectUri }) {
      const res = await fetchFn(`${googleIssuer}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      if (!res.ok) throw new Error(`Fake Google token endpoint answered ${res.status}`);
      const { id_token: idToken } = z.object({ id_token: z.string() }).parse(await res.json());
      const { payload } = await jwtVerify(idToken, googleKeys, {
        issuer: googleIssuer,
        audience: CLIENT_ID,
      });
      // On the mock login page, type the e-mail as the user (or send an "email" claim).
      const email = typeof payload.email === 'string' ? payload.email : payload.sub;
      if (email === undefined || !email.includes('@')) {
        throw new Error('Fake Google sign-in without an e-mail');
      }
      return tokensFor(email.toLowerCase());
    },

    async refresh(refreshToken) {
      const sub = refreshTokens.get(refreshToken);
      refreshTokens.delete(refreshToken);
      const email = sub === undefined ? undefined : accounts.get(sub);
      return email === undefined ? null : tokensFor(email);
    },

    async revoke(refreshToken) {
      refreshTokens.delete(refreshToken);
    },

    async verifyAccessToken(accessToken) {
      try {
        const { payload } = await jwtVerify(accessToken, publicKey, { issuer: ISSUER });
        return payload.sub === undefined ? null : { sub: payload.sub };
      } catch {
        return null;
      }
    },

    async email(sub) {
      return accounts.get(sub) ?? null;
    },

    async deleteUser(sub) {
      accounts.delete(sub);
      for (const [token, owner] of refreshTokens) if (owner === sub) refreshTokens.delete(token);
    },
  };
}
```

`apps/api/src/identity.ts` perde o `noAccounts` (tudo depois da interface):

```diff
--- a/apps/api/src/identity.ts
+++ b/apps/api/src/identity.ts
@@ -56,22 +56,3 @@ export interface IdentityProvider {
   /** Deletes the account, Google link included. */
   deleteUser(sub: string): Promise<void>;
 }
-
-const unavailable = async (): Promise<never> => {
-  throw new Error('No identity provider wired yet');
-};
-
-/** No accounts yet: every token is refused. Replaced when the Cognito and local providers are wired. */
-export const noAccounts: IdentityProvider = {
-  startEmailLogin: unavailable,
-  finishEmailLogin: unavailable,
-  googleAuthorizeUrl: () => {
-    throw new Error('No identity provider wired yet');
-  },
-  finishGoogleLogin: unavailable,
-  refresh: async () => null,
-  revoke: async () => {},
-  verifyAccessToken: async () => null,
-  email: async () => null,
-  deleteUser: unavailable,
-};
```

`apps/api/src/config.ts`:

```ts
import type { CognitoSettings } from './identity/cognito.ts';
import type { LocalIdentitySettings } from './identity/local.ts';

export type Environment = 'local' | 'dev' | 'prod';

export interface AppConfig {
  environment: Environment;
  version: string;
  /** DynamoDB table: egt-<env>-data-main. */
  tableName: string;
  /** DynamoDB Local URL; only when running locally. */
  dynamodbEndpoint?: string;
  /** The site's origin: the only one allowed to send changes (CSRF, spec §3.6). */
  siteOrigin: string;
  /** Value CloudFront sends in x-origin-verify (ADR 0022); absent locally. */
  originVerifySecret?: string;
  /** Learner user pool (ADR 0024); absent locally. */
  cognito?: CognitoSettings;
  /** Mailpit and the fake Google (docker compose); only locally. */
  local?: LocalIdentitySettings;
}

const ENVIRONMENTS: readonly string[] = ['local', 'dev', 'prod'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = env.APP_ENV ?? 'local';
  if (!isEnvironment(environment)) {
    throw new Error(`Invalid APP_ENV "${environment}". Expected local, dev or prod.`);
  }
  if (environment === 'local') {
    return {
      environment,
      version: env.APP_VERSION ?? '0.0.0-local',
      tableName: env.TABLE_NAME ?? 'egt-local-data-main',
      dynamodbEndpoint: env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
      siteOrigin: env.SITE_ORIGIN ?? 'http://localhost:4321',
      local: {
        mailpitUrl: env.MAILPIT_URL ?? 'http://localhost:8025',
        googleIssuer: env.FAKE_GOOGLE_ISSUER ?? 'http://localhost:8080/google',
      },
    };
  }
  return {
    environment,
    version: required(env, 'APP_VERSION'),
    tableName: required(env, 'TABLE_NAME'),
    siteOrigin: required(env, 'SITE_ORIGIN'),
    originVerifySecret: required(env, 'ORIGIN_VERIFY_SECRET'),
    cognito: {
      userPoolId: required(env, 'USER_POOL_ID'),
      clientId: required(env, 'USER_POOL_CLIENT_ID'),
      clientSecret: required(env, 'USER_POOL_CLIENT_SECRET'),
      domain: required(env, 'AUTH_DOMAIN'),
    },
  };
}

function isEnvironment(value: string): value is Environment {
  return ENVIRONMENTS.includes(value);
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name} (required when APP_ENV is ${env.APP_ENV}).`);
  return value;
}
```

`apps/api/src/local.ts`:

```ts
import {
  checkDatabase,
  connect,
  createDynamoProfileRepository,
  createDynamoProgressRepository,
  createMemoryProfileRepository,
  createMemoryProgressRepository,
  ensureTable,
  type ProfileRepository,
  type ProgressRepository,
} from '@egt/db';
import type { AppConfig } from './config.ts';
import type { LocalIdentitySettings } from './identity/local.ts';

/**
 * The local server signs anyone in with codes it prints: it must never run against AWS. Called
 * before anything connects (ADR 0024).
 */
export function requireLocal(config: AppConfig): LocalIdentitySettings {
  if (config.environment !== 'local' || config.local === undefined) {
    throw new Error('The local server only runs with APP_ENV=local.');
  }
  return config.local;
}

export interface LocalStorage {
  mode: 'dynamodb' | 'memory';
  progress: ProgressRepository;
  profiles: ProfileRepository;
  checkDatabase: () => Promise<void>;
}

/** DynamoDB Local when it is up (the table is created on the way); otherwise memory. */
export async function connectLocalStorage(config: AppConfig): Promise<LocalStorage> {
  const db = connect({ table: config.tableName, endpoint: config.dynamodbEndpoint });
  try {
    await ensureTable(db);
    return {
      mode: 'dynamodb',
      progress: createDynamoProgressRepository(db),
      profiles: createDynamoProfileRepository(db),
      checkDatabase: () => checkDatabase(db),
    };
  } catch {
    return {
      mode: 'memory',
      progress: createMemoryProgressRepository(),
      profiles: createMemoryProfileRepository(),
      checkDatabase: async () => {},
    };
  }
}
```

`apps/api/src/server.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadProgressCatalog } from './catalog.ts';
import { loadConfig } from './config.ts';
import { createLocalIdentity } from './identity/local.ts';
import { connectLocalStorage, requireLocal } from './local.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const localSettings = requireLocal(config);
const port = Number(process.env.PORT ?? 3001);
const catalog = await loadProgressCatalog(
  fileURLToPath(new URL('../../../content', import.meta.url)),
);
const storage = await connectLocalStorage(config);
if (storage.mode === 'memory') {
  console.warn(
    'DynamoDB Local fora do ar: o progresso fica na memória e some ao reiniciar. Para usar o banco, rode pnpm db:up.',
  );
}

const app = createApp({
  config,
  logger: createLogger(config),
  progress: storage.progress,
  profiles: storage.profiles,
  catalog,
  checkDatabase: storage.checkDatabase,
  identity: await createLocalIdentity(localSettings),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API local em http://localhost:${info.port}/api/health`);
  console.log(
    `Códigos de login: ${localSettings.mailpitUrl} (Mailpit) e aqui no terminal. Google de mentira: ${localSettings.googleIssuer}.`,
  );
});
```

Run: `pnpm exec vitest run --project api`
Expected: PASS.

- [ ] **Step 3: Serviços locais**

`docker-compose.yml`:

```yaml
# Local services (spec §13). `pnpm db:up` starts them; the API creates its table on startup.
# In memory: data lasts while the containers run (`docker compose down` erases it).
services:
  dynamodb:
    image: amazon/dynamodb-local:3.3.1@sha256:ff89bd48ff32cd8d9be5fee8873b65b8854dc408f1afe881be6eb00247bc0dab
    command: ['-jar', 'DynamoDBLocal.jar', '-inMemory', '-sharedDb']
    ports:
      - '127.0.0.1:8000:8000'
    healthcheck:
      test: ['CMD-SHELL', 'bash -c "exec 3<>/dev/tcp/127.0.0.1/8000"']
      interval: 2s
      timeout: 2s
      retries: 15

  # Inbox for the sign-in codes: http://localhost:8025.
  mailpit:
    image: axllent/mailpit:v1.31.2@sha256:74d609a42ec279aa63c6b4622a6fa9b5408d1ad5b1d76a1c4be40a265ce0863d
    ports:
      - '127.0.0.1:8025:8025'

  # Fake Google (issuer http://localhost:8080/google): type any e-mail as the user.
  google:
    image: ghcr.io/navikt/mock-oauth2-server:6.0.3@sha256:250e04413e2fc7877d4cb38ecd74d3ecb1a40aae3a9bdad96d1c593e59fee95e
    ports:
      - '127.0.0.1:8080:8080'
```

No `package.json` da raiz, o `db:up` sobe todos os serviços:

```diff
--- a/package.json
+++ b/package.json
@@ -16,7 +16,7 @@
     "lint": "eslint . && prettier --check .",
     "format": "prettier --write .",
     "content:check": "node packages/content/src/cli.ts content",
-    "db:up": "docker compose up -d --wait dynamodb"
+    "db:up": "docker compose up -d --wait"
   },
   "devDependencies": {
     "@eslint/js": "^10.0.1",
```

- [ ] **Step 4: Conferir de ponta a ponta, localmente**

```bash
pnpm db:up
APP_ENV=local node apps/api/src/server.ts &
api=$!
sleep 3
jar="$(mktemp)"
curl -s -c "$jar" -b "$jar" -H 'origin: http://localhost:4321' -H 'content-type: application/json' \
  -X POST localhost:3001/api/auth/email/start -d '{"email":"teste@example.com"}'
code="$(curl -s 'localhost:8025/api/v1/search?query=to:teste@example.com' | grep -o 'entrar: [0-9]\{6\}' | head -1 | grep -o '[0-9]\{6\}')"
curl -s -c "$jar" -b "$jar" -H 'origin: http://localhost:4321' -H 'content-type: application/json' \
  -X POST localhost:3001/api/auth/email/verify -d "{\"code\":\"$code\"}"
curl -s -b "$jar" localhost:3001/api/me
kill "$api"
```

Expected: `{"status":"code_sent"}`, depois `{"profileComplete":false}` e `{"email":"teste@example.com","profile":null}`. O terminal da API também mostra o código.

Confira também a trava: `APP_ENV=dev node apps/api/src/server.ts` termina com o erro `Missing APP_VERSION`. Com todas as variáveis de AWS definidas, terminaria com `The local server only runs with APP_ENV=local.`, sem conectar a nada.

- [ ] **Step 5: Conferir e fazer o commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test`
Expected: sem erros; todos os testes passam.

```bash
git add apps/api docker-compose.yml package.json
git commit -m "feat(api): login local com Mailpit e Google de mentira" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Gatilhos do Cognito (vínculo do Google e e-mails em pt-BR)

Uma segunda Lambda, no mesmo build da API. Ela atende dois gatilhos:
- **Pré-cadastro (primeiro login com Google):**
  - recusa e-mail que o Google não confirmou;
  - acha a conta do mesmo e-mail, ou a cria sem senha e já verificada;
  - vincula o Google a ela;
  - falha com `ACCOUNT_LINKED`. A API refaz o login com Google uma vez (Task 4).
- **Mensagem:** escreve em pt-BR os e-mails de código do cadastro, do reenvio e do login.

**Files:**
- Create: `apps/api/src/triggers.ts`, `apps/api/test/triggers.test.ts`
- Modify: `apps/api/scripts/build.ts`, `apps/api/test/bundle.test.ts`

**Interfaces:**
- Consumes: o build da Task 1.
- Produces:
  - `ACCOUNT_LINKED`, `TriggerEvent`, `createTriggers(client, logger)` e `handler` (Lambda `triggers.handler`).
  - O build gera `dist/lambda.mjs` e `dist/triggers.mjs`.

- [ ] **Step 1: Testes**

`apps/api/test/triggers.test.ts`:

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_LINKED, createTriggers, type TriggerEvent } from '../src/triggers.ts';

type Reply = (input: Record<string, unknown>) => unknown;

function setup(replies: Record<string, Reply> = {}) {
  const sent: { command: string; input: Record<string, unknown> }[] = [];
  const client = {
    async send(command: { constructor: { name: string }; input: unknown }) {
      const name = command.constructor.name.replace(/Command$/, '');
      const input = command.input as Record<string, unknown>;
      sent.push({ command: name, input });
      const reply = replies[name];
      if (reply === undefined) throw new Error(`Unexpected ${name}`);
      return reply(input);
    },
  };
  // The fake only implements send(); the triggers use nothing else.
  const handler = createTriggers(client as never, new Logger({ logLevel: 'SILENT' }));
  return { handler, sent };
}

const event = (
  triggerSource: string,
  userAttributes: Record<string, string> = {},
  codeParameter?: string,
): TriggerEvent => ({
  triggerSource,
  userPoolId: 'sa-east-1_Teste123',
  userName: 'Google_1098',
  request: { userAttributes, ...(codeParameter === undefined ? {} : { codeParameter }) },
  response: {},
});

const google = { email: 'Ana@Example.com', email_verified: 'true' };

describe('pre sign-up trigger', () => {
  it('links a first Google sign-in to the account with the same e-mail', async () => {
    const { handler, sent } = setup({
      ListUsers: () => ({
        Users: [
          { Username: 'Google_555', UserStatus: 'EXTERNAL_PROVIDER' },
          { Username: 'uuid-da-ana', UserStatus: 'CONFIRMED' },
        ],
      }),
      AdminLinkProviderForUser: () => ({}),
    });

    await expect(handler(event('PreSignUp_ExternalProvider', google))).rejects.toThrow(
      ACCOUNT_LINKED,
    );
    expect(sent).toEqual([
      {
        command: 'ListUsers',
        input: { UserPoolId: 'sa-east-1_Teste123', Filter: 'email = "ana@example.com"' },
      },
      {
        command: 'AdminLinkProviderForUser',
        input: {
          UserPoolId: 'sa-east-1_Teste123',
          DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: 'uuid-da-ana' },
          SourceUser: {
            ProviderName: 'Google',
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: '1098',
          },
        },
      },
    ]);
  });

  it('creates the e-mail account first when there is none', async () => {
    const { handler, sent } = setup({
      ListUsers: () => ({ Users: [] }),
      AdminCreateUser: () => ({ User: { Username: 'uuid-nova' } }),
      AdminLinkProviderForUser: () => ({}),
    });

    await expect(handler(event('PreSignUp_ExternalProvider', google))).rejects.toThrow(
      ACCOUNT_LINKED,
    );
    expect(sent[1]).toEqual({
      command: 'AdminCreateUser',
      input: {
        UserPoolId: 'sa-east-1_Teste123',
        Username: 'ana@example.com',
        UserAttributes: [
          { Name: 'email', Value: 'ana@example.com' },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      },
    });
    expect(sent[2]?.input.DestinationUser).toEqual({
      ProviderName: 'Cognito',
      ProviderAttributeValue: 'uuid-nova',
    });
  });

  it('refuses Google accounts without a verified e-mail', async () => {
    const { handler, sent } = setup();

    const unverified: Record<string, string>[] = [
      {},
      { email: 'ana@example.com', email_verified: 'false' },
    ];
    for (const attributes of unverified) {
      await expect(handler(event('PreSignUp_ExternalProvider', attributes))).rejects.toThrow(
        'Google account without a verified e-mail',
      );
    }
    expect(sent).toEqual([]);
  });

  it('escapes the e-mail in the search filter', async () => {
    const { handler, sent } = setup({
      ListUsers: () => ({ Users: [{ Username: 'u', UserStatus: 'CONFIRMED' }] }),
      AdminLinkProviderForUser: () => ({}),
    });

    await expect(
      handler(
        event('PreSignUp_ExternalProvider', {
          email: 'a"b\\c@example.com',
          email_verified: 'true',
        }),
      ),
    ).rejects.toThrow(ACCOUNT_LINKED);
    expect(sent[0]?.input.Filter).toBe('email = "a\\"b\\\\c@example.com"');
  });

  it('leaves e-mail sign-ups alone', async () => {
    const { handler, sent } = setup();
    const signUp = event('PreSignUp_SignUp', { email: 'ana@example.com' });

    expect(await handler(signUp)).toBe(signUp);
    expect(sent).toEqual([]);
  });
});

describe('custom message trigger', () => {
  it('writes the code e-mails in pt-BR', async () => {
    const { handler } = setup();

    for (const source of [
      'CustomMessage_SignUp',
      'CustomMessage_ResendCode',
      'CustomMessage_Authentication',
    ]) {
      const result = await handler(event(source, {}, '{####}'));

      expect(result.response.emailSubject).toBe(
        'Seu código para entrar na Escola Grátis de Tecnologia',
      );
      expect(result.response.emailMessage).toContain('{####}');
      expect(result.response.emailMessage).toContain(
        'Use este código para entrar na Escola Grátis de Tecnologia:',
      );
    }
  });

  it('leaves other messages as they are', async () => {
    const { handler } = setup();

    const result = await handler(event('CustomMessage_ForgotPassword', {}, '{####}'));

    expect(result.response).toEqual({});
  });
});
```

`apps/api/test/bundle.test.ts` carrega também o `triggers.mjs`:

```diff
--- a/apps/api/test/bundle.test.ts
+++ b/apps/api/test/bundle.test.ts
@@ -47,6 +47,19 @@ function invoke(
   return JSON.parse(output) as { statusCode: number; body: string };
 }
 
+/** Loads the triggers bundle and hands it a Cognito event. */
+function trigger(event: Record<string, unknown>): Record<string, unknown> {
+  const script = `
+    const { handler } = await import(${JSON.stringify(pathToFileURL(join(outdir, 'triggers.mjs')).href)});
+    process.stdout.write(JSON.stringify(await handler(${JSON.stringify(event)})));
+  `;
+  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
+    encoding: 'utf8',
+    env: { PATH: process.env.PATH, AWS_REGION: 'sa-east-1', POWERTOOLS_LOG_LEVEL: 'SILENT' },
+  });
+  return JSON.parse(output) as Record<string, unknown>;
+}
+
 describe('Lambda bundle', () => {
   beforeAll(async () => {
     await buildLambda(outdir);
@@ -65,6 +78,20 @@ describe('Lambda bundle', () => {
     expect(invoke('/api/health', {}).statusCode).toBe(403);
   });
 
+  it('includes the Cognito triggers', () => {
+    const result = trigger({
+      triggerSource: 'CustomMessage_SignUp',
+      userPoolId: 'sa-east-1_Teste123',
+      userName: 'uuid',
+      request: { userAttributes: {}, codeParameter: '{####}' },
+      response: {},
+    });
+
+    expect(result.response).toMatchObject({
+      emailSubject: 'Seu código para entrar na Escola Grátis de Tecnologia',
+    });
+  });
+
   it('checks the session with Cognito', () => {
     const response = invoke('/api/me', { 'x-origin-verify': 'segredo', cookie: 'egt_at=lixo' });
 
```

Run: `pnpm exec vitest run --project api`
Expected: FAIL (`src/triggers.ts` não existe).

- [ ] **Step 2: Implementar**

`apps/api/src/triggers.ts`:

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import {
  AdminCreateUserCommand,
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/** The fields of the Cognito trigger events these handlers read and write. */
export interface TriggerEvent {
  triggerSource: string;
  userPoolId: string;
  userName: string;
  request: { userAttributes: Record<string, string>; codeParameter?: string };
  response: Record<string, unknown>;
}

/** Error text Cognito passes on to /api/auth/callback; the API then signs in again once. */
export const ACCOUNT_LINKED = 'ACCOUNT_LINKED';

const CODE_MESSAGES = new Set([
  'CustomMessage_SignUp',
  'CustomMessage_ResendCode',
  'CustomMessage_Authentication',
]);

function codeEmail(code: string): string {
  return [
    '<p>Olá!</p>',
    '<p>Use este código para entrar na Escola Grátis de Tecnologia:</p>',
    `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>`,
    '<p>Se não foi você que pediu, pode ignorar este e-mail: sem o código, ninguém entra na sua conta.</p>',
  ].join('');
}

/**
 * Cognito triggers of the learner pool (ADR 0024):
 * - pre sign-up: a first Google sign-in is linked to the account with the same e-mail (created
 *   when there is none), so every learner has one account and one `sub`;
 * - custom message: the e-mails with codes, in pt-BR.
 */
export function createTriggers(
  client: Pick<CognitoIdentityProviderClient, 'send'>,
  logger: Logger,
) {
  async function findAccount(userPoolId: string, email: string): Promise<string | undefined> {
    const { Users = [] } = await client.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${email.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
      }),
    );
    return Users.find((user) => user.UserStatus !== 'EXTERNAL_PROVIDER')?.Username;
  }

  async function linkGoogle(event: TriggerEvent): Promise<never> {
    const { email, email_verified: verified } = event.request.userAttributes;
    if (email === undefined || verified !== 'true') {
      throw new Error('Google account without a verified e-mail');
    }
    const separator = event.userName.indexOf('_');
    const providerName = event.userName.slice(0, separator);
    const providerUserId = event.userName.slice(separator + 1);

    let username = await findAccount(event.userPoolId, email.toLowerCase());
    const created = username === undefined;
    if (username === undefined) {
      // Google confirmed the e-mail, so the account is born verified and without a password.
      const { User } = await client.send(
        new AdminCreateUserCommand({
          UserPoolId: event.userPoolId,
          Username: email.toLowerCase(),
          UserAttributes: [
            { Name: 'email', Value: email.toLowerCase() },
            { Name: 'email_verified', Value: 'true' },
          ],
          MessageAction: 'SUPPRESS',
        }),
      );
      username = User?.Username;
      if (username === undefined) throw new Error('Cognito created a user without a username');
    }
    await client.send(
      new AdminLinkProviderForUserCommand({
        UserPoolId: event.userPoolId,
        DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: username },
        SourceUser: {
          ProviderName: providerName,
          ProviderAttributeName: 'Cognito_Subject',
          ProviderAttributeValue: providerUserId,
        },
      }),
    );
    logger.info('google_linked', { createdAccount: created });
    // Cognito cannot finish this sign-in as the linked account; the next attempt can.
    throw new Error(ACCOUNT_LINKED);
  }

  return async function handler(event: TriggerEvent): Promise<TriggerEvent> {
    if (event.triggerSource === 'PreSignUp_ExternalProvider') return linkGoogle(event);
    if (CODE_MESSAGES.has(event.triggerSource) && event.request.codeParameter !== undefined) {
      event.response.emailSubject = 'Seu código para entrar na Escola Grátis de Tecnologia';
      event.response.emailMessage = codeEmail(event.request.codeParameter);
    }
    return event;
  };
}

export const handler = createTriggers(
  new CognitoIdentityProviderClient({}),
  new Logger({ serviceName: 'auth-triggers' }),
);
```

`apps/api/scripts/build.ts` (duas entradas, mesma pasta):

```ts
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { loadProgressCatalog } from '../src/catalog.ts';

const CONTENT_DIR = fileURLToPath(new URL('../../../content', import.meta.url));

/**
 * Bundles the Lambda handlers with every dependency, AWS SDK included (versions from our
 * lockfile): the API (lambda.mjs, with the progress catalog read from content/) and the Cognito
 * triggers (triggers.mjs). Terraform zips the folder for both functions.
 */
export async function buildLambda(outdir: string): Promise<void> {
  const catalog = await loadProgressCatalog(CONTENT_DIR);
  await build({
    entryPoints: {
      lambda: fileURLToPath(new URL('../src/lambda.ts', import.meta.url)),
      triggers: fileURLToPath(new URL('../src/triggers.ts', import.meta.url)),
    },
    outdir,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    minify: true,
    sourcemap: true,
    sourcesContent: false,
    define: { __PROGRESS_CATALOG__: JSON.stringify(catalog) },
    // ElectroDB is CommonJS and calls require(): give the ESM bundle a real one.
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });
}

if (import.meta.main) {
  await buildLambda(fileURLToPath(new URL('../dist', import.meta.url)));
}
```

Run: `pnpm exec vitest run --project api && pnpm --filter @egt/api build && ls apps/api/dist`
Expected: PASS, e `dist/` com `lambda.mjs`, `triggers.mjs` e os dois `.map`.

- [ ] **Step 3: Conferir e fazer o commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: sem erros.

```bash
git add apps/api
git commit -m "feat(api): gatilhos do Cognito para vincular o Google e escrever os e-mails em pt-BR" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Terraform: módulo `auth` (user pool, Google, SES e gatilhos)

**Files:**
- Create: `infra/modules/auth/versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`, `tests/auth.tftest.hcl`

**Interfaces:**
- Consumes: o build `apps/api/dist` (com `triggers.mjs`, Task 8).
- Produces:
  - Variáveis: `name_prefix`, `domain_name`, `zone_id`, `package_dir`, `google_client_id`, `google_client_secret` (sensitive), `deletion_protection` e `log_retention_days` (padrão 30).
  - Outputs: `user_pool_id`, `user_pool_arn`, `client_id` e `client_secret` (sensitive).

O que o módulo cria:
- **SES** (identidade do domínio, na região do pool):
  - verificação TXT `_amazonses` com espera, porque o Cognito só aceita identidade já verificada;
  - três CNAMEs de DKIM;
  - MAIL FROM `bounce.<domínio>` (MX e SPF);
  - DMARC `p=quarantine`.
- **Lambda dos gatilhos:** log group de 30 dias, role e política só com `ListUsers`, `AdminCreateUser` e `AdminLinkProviderForUser`, e permissão para o pool chamá-la.
- **User pool** Essentials:
  - login por e-mail, sem senha (`EMAIL_OTP`) e sem MFA;
  - e-mails pelo SES como `Escola Gratis de Tecnologia <nao-responda@<domínio>>`;
  - gatilhos de pré-cadastro e de mensagem.
- **Provedor Google**, com o mapeamento de `email_verified`.
- **Cliente confidencial:**
  - `ALLOW_USER_AUTH`, code flow só com o Google, callback `https://<domínio>/api/auth/callback`;
  - proteção contra enumeração e revogação de tokens;
  - sessão de 15 minutos para digitar o código; access de 60 minutos e refresh de 30 dias, com rotação.

- [ ] **Step 1: Teste do módulo**

`infra/modules/auth/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }
}
```

`infra/modules/auth/variables.tf`:

```hcl
variable "name_prefix" {
  description = "Prefixo dos nomes: egt-<ambiente>."
  type        = string
}

variable "domain_name" {
  description = "Domínio do site; os e-mails saem de nao-responda@<domínio>."
  type        = string
}

variable "zone_id" {
  description = "Zona Route 53 do domínio, onde ficam os registros do SES (verificação, DKIM, MAIL FROM e DMARC)."
  type        = string
}

variable "package_dir" {
  description = "Pasta com o build da API (apps/api/dist), que traz também os gatilhos do Cognito (triggers.mjs)."
  type        = string
}

variable "google_client_id" {
  description = "ID do cliente OAuth do Google deste ambiente (Google Cloud Console)."
  type        = string
}

variable "google_client_secret" {
  description = "Segredo do cliente OAuth do Google deste ambiente."
  type        = string
  sensitive   = true
}

variable "deletion_protection" {
  description = "Impede apagar o user pool (ligue em prod)."
  type        = bool
}

variable "log_retention_days" {
  description = "Retenção dos logs dos gatilhos."
  type        = number
  default     = 30
}
```

`infra/modules/auth/tests/auth.tftest.hcl`:

```hcl
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_ses_domain_identity" {
    defaults = {
      arn                = "arn:aws:ses:sa-east-1:123456789012:identity/dev.example.com"
      verification_token = "token-de-verificacao"
    }
  }

  mock_resource "aws_ses_domain_dkim" {
    defaults = {
      dkim_tokens = ["dkim1", "dkim2", "dkim3"]
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:sa-east-1:123456789012:log-group:egt-test"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/egt-test-auth-triggers"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:sa-east-1:123456789012:function:egt-test-auth-triggers"
    }
  }

  mock_resource "aws_cognito_user_pool" {
    defaults = {
      id  = "sa-east-1_Teste123"
      arn = "arn:aws:cognito-idp:sa-east-1:123456789012:userpool/sa-east-1_Teste123"
    }
  }
}

mock_provider "archive" {
  mock_data "archive_file" {
    defaults = {
      output_path         = "auth-triggers.zip"
      output_base64sha256 = "aGFzaA=="
    }
  }
}

variables {
  name_prefix          = "egt-test"
  domain_name          = "dev.example.com"
  zone_id              = "Z123"
  package_dir          = "dist"
  google_client_id     = "cliente.apps.googleusercontent.com"
  google_client_secret = "segredo-do-google"
  deletion_protection  = false
}

run "passwordless_learner_pool" {
  command = apply

  assert {
    condition     = aws_cognito_user_pool.learners.name == "egt-test-auth-learners" && aws_cognito_user_pool.learners.user_pool_tier == "ESSENTIALS"
    error_message = "O pool dos alunos usa o plano Essentials."
  }

  assert {
    condition     = toset(aws_cognito_user_pool.learners.sign_in_policy[0].allowed_first_auth_factors) == toset(["EMAIL_OTP", "PASSWORD"]) && aws_cognito_user_pool.learners.mfa_configuration == "OFF"
    error_message = "Login por código no e-mail, sem MFA (o Cognito não junta MFA com login sem senha)."
  }

  assert {
    condition     = aws_cognito_user_pool.learners.username_attributes == toset(["email"]) && aws_cognito_user_pool.learners.deletion_protection == "INACTIVE"
    error_message = "O e-mail é o login; a proteção contra exclusão segue a variável."
  }

  assert {
    condition     = aws_cognito_user_pool.learners.tags["Component"] == "auth" && aws_cognito_user_pool.learners.tags["DataClassification"] == "personal"
    error_message = "O pool guarda dados pessoais."
  }

  assert {
    condition     = aws_cognito_user_pool.learners.email_configuration[0].email_sending_account == "DEVELOPER" && aws_cognito_user_pool.learners.email_configuration[0].from_email_address == "Escola Gratis de Tecnologia <nao-responda@dev.example.com>"
    error_message = "Os códigos saem pelo SES, do domínio do site."
  }

  assert {
    condition     = aws_cognito_user_pool.learners.lambda_config[0].pre_sign_up == aws_lambda_function.triggers.arn && aws_cognito_user_pool.learners.lambda_config[0].custom_message == aws_lambda_function.triggers.arn
    error_message = "Os gatilhos vinculam o Google e escrevem os e-mails em pt-BR."
  }
}

run "confidential_client_with_rotation" {
  command = apply

  assert {
    condition     = aws_cognito_user_pool_client.web.generate_secret && aws_cognito_user_pool_client.web.explicit_auth_flows == toset(["ALLOW_USER_AUTH"])
    error_message = "Cliente confidencial; com rotação, REFRESH_TOKEN_AUTH fica de fora."
  }

  assert {
    condition     = aws_cognito_user_pool_client.web.refresh_token_rotation[0].feature == "ENABLED" && aws_cognito_user_pool_client.web.refresh_token_validity == 30
    error_message = "Sessão de 30 dias com refresh token que gira."
  }

  assert {
    condition     = aws_cognito_user_pool_client.web.callback_urls == toset(["https://dev.example.com/api/auth/callback"]) && aws_cognito_user_pool_client.web.supported_identity_providers == toset(["Google"])
    error_message = "O Google volta para a API do próprio site."
  }

  assert {
    condition     = aws_cognito_user_pool_client.web.prevent_user_existence_errors == "ENABLED" && aws_cognito_user_pool_client.web.enable_token_revocation
    error_message = "Sem revelar quem tem conta; logout revoga o refresh token."
  }

  assert {
    condition     = aws_cognito_identity_provider.google.attribute_mapping["email_verified"] == "email_verified" && aws_cognito_identity_provider.google.provider_details["client_id"] == "cliente.apps.googleusercontent.com"
    error_message = "Sem email_verified, o Google nunca seria vinculado."
  }
}

run "triggers_with_least_privilege" {
  command = apply

  assert {
    condition     = aws_lambda_function.triggers.handler == "triggers.handler" && aws_lambda_function.triggers.timeout == 5 && aws_lambda_function.triggers.runtime == "nodejs24.x"
    error_message = "Os gatilhos vêm do mesmo build da API e respondem em até 5 segundos."
  }

  assert {
    condition = toset(flatten([for statement in data.aws_iam_policy_document.triggers.statement : statement.actions])) == toset([
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "cognito-idp:ListUsers",
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminLinkProviderForUser",
    ])
    error_message = "Os gatilhos só podem achar, criar e vincular contas (e escrever os próprios logs)."
  }

  assert {
    condition     = aws_lambda_permission.cognito.principal == "cognito-idp.amazonaws.com" && aws_lambda_permission.cognito.source_arn == aws_cognito_user_pool.learners.arn
    error_message = "Só este pool chama os gatilhos."
  }

  assert {
    condition     = aws_cloudwatch_log_group.triggers.name == "/aws/lambda/egt-test-auth-triggers" && aws_cloudwatch_log_group.triggers.retention_in_days == 30
    error_message = "Logs dos gatilhos com 30 dias."
  }
}

run "ses_domain_records" {
  command = apply

  assert {
    condition     = length(aws_route53_record.dkim) == 3 && aws_route53_record.dkim[0].name == "dkim1._domainkey.dev.example.com"
    error_message = "Easy DKIM pede três CNAMEs."
  }

  assert {
    condition     = aws_route53_record.mail_from_mx.records == toset(["10 feedback-smtp.sa-east-1.amazonses.com"]) && aws_route53_record.mail_from_mx.name == "bounce.dev.example.com"
    error_message = "Os retornos vão para bounce.<domínio>, na região do SES."
  }

  assert {
    condition     = aws_route53_record.dmarc.records == toset(["v=DMARC1; p=quarantine; adkim=s; aspf=r"])
    error_message = "DMARC manda para a quarentena o que não vem do SES."
  }
}
```

Run:

```bash
export TF_PLUGIN_CACHE_DIR="$HOME/.cache/terraform-plugins"
TF="$(mise which terraform)"
(cd infra/modules/auth && export TF_DATA_DIR="$(mktemp -d)" AWS_PROFILE= AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null && "$TF" init -backend=false -input=false >/dev/null && "$TF" test)
```

Expected: FAIL (os recursos citados nos testes não existem).

- [ ] **Step 2: Implementar**

`infra/modules/auth/main.tf`:

```hcl
locals {
  tags          = { Component = "auth" }
  function_name = "${var.name_prefix}-auth-triggers"
  site_origin   = "https://${var.domain_name}"
  mail_from     = "bounce.${var.domain_name}"
}

# --- E-mail (SES in sa-east-1, the pool's region; Cognito sends the codes through it) ---

resource "aws_ses_domain_identity" "mail" {
  domain = var.domain_name
}

resource "aws_route53_record" "ses_verification" {
  zone_id = var.zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.mail.verification_token]
}

# Cognito only accepts a verified identity: wait for it before the pool.
resource "aws_ses_domain_identity_verification" "mail" {
  domain     = aws_ses_domain_identity.mail.domain
  depends_on = [aws_route53_record.ses_verification]
}

resource "aws_ses_domain_dkim" "mail" {
  domain = aws_ses_domain_identity.mail.domain
}

resource "aws_route53_record" "dkim" {
  count = 3

  zone_id = var.zone_id
  name    = "${aws_ses_domain_dkim.mail.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.mail.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# Bounces come back to bounce.<domain>, aligned with the From domain (SPF and DMARC).
resource "aws_ses_domain_mail_from" "mail" {
  domain                 = aws_ses_domain_identity.mail.domain
  mail_from_domain       = local.mail_from
  behavior_on_mx_failure = "UseDefaultValue"
}

resource "aws_route53_record" "mail_from_mx" {
  zone_id = var.zone_id
  name    = local.mail_from
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.sa-east-1.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  zone_id = var.zone_id
  name    = local.mail_from
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# Only SES sends as this domain, DKIM-signed: anything else goes to spam.
resource "aws_route53_record" "dmarc" {
  zone_id = var.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=quarantine; adkim=s; aspf=r"]
}

# --- Cognito triggers (link Google to the e-mail account; code e-mails in pt-BR) ---

data "archive_file" "package" {
  type             = "zip"
  source_dir       = var.package_dir
  output_path      = "${path.root}/.terraform/build/auth-triggers.zip"
  output_file_mode = "0644"
}

resource "aws_cloudwatch_log_group" "triggers" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

data "aws_iam_policy_document" "assume_lambda" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "triggers" {
  name               = local.function_name
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
  tags               = local.tags
}

# Least privilege: find the account by e-mail, create it when missing, link Google to it.
data "aws_iam_policy_document" "triggers" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.triggers.arn}:*"]
  }

  statement {
    sid       = "LinkGoogleAccounts"
    actions   = ["cognito-idp:ListUsers", "cognito-idp:AdminCreateUser", "cognito-idp:AdminLinkProviderForUser"]
    resources = [aws_cognito_user_pool.learners.arn]
  }
}

resource "aws_iam_role_policy" "triggers" {
  name   = "least-privilege"
  role   = aws_iam_role.triggers.id
  policy = data.aws_iam_policy_document.triggers.json
}

resource "aws_lambda_function" "triggers" {
  function_name    = local.function_name
  description      = "Cognito triggers of the learner pool"
  role             = aws_iam_role.triggers.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "triggers.handler"
  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256
  memory_size      = 256
  # Cognito waits at most 5 seconds for a trigger.
  timeout = 5
  tags    = local.tags

  environment {
    variables = {
      NODE_OPTIONS = "--enable-source-maps"
    }
  }

  logging_config {
    log_format            = "JSON"
    log_group             = aws_cloudwatch_log_group.triggers.name
    application_log_level = "INFO"
    system_log_level      = "WARN"
  }
}

resource "aws_lambda_permission" "cognito" {
  statement_id  = "AllowCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.triggers.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.learners.arn
}

# --- Learner user pool (Essentials: passwordless e-mail codes, spec §5.1, ADR 0024) ---

resource "aws_cognito_user_pool" "learners" {
  name                = "${var.name_prefix}-auth-learners"
  user_pool_tier      = "ESSENTIALS"
  username_attributes = ["email"]
  # Cognito confirms the e-mail with the first code; nobody has a password.
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"
  tags                     = merge(local.tags, { DataClassification = "personal" })

  sign_in_policy {
    # Cognito always lists PASSWORD; no learner has one, so it is never used.
    allowed_first_auth_factors = ["EMAIL_OTP", "PASSWORD"]
  }

  username_configuration {
    case_sensitive = false
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  # No password to recover: a new code is the way back in.
  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  email_configuration {
    email_sending_account = "DEVELOPER"
    source_arn            = aws_ses_domain_identity.mail.arn
    from_email_address    = "Escola Gratis de Tecnologia <nao-responda@${var.domain_name}>"
  }

  lambda_config {
    pre_sign_up    = aws_lambda_function.triggers.arn
    custom_message = aws_lambda_function.triggers.arn
  }

  depends_on = [aws_ses_domain_identity_verification.mail]
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.learners.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  # Without email_verified the e-mail counts as unverified and is never linked.
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }
}

# The API's confidential client (the BFF, spec §5.2): e-mail codes through the API, Google
# through the pool domain, refresh tokens that rotate.
resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.name_prefix}-auth-web"
  user_pool_id                         = aws_cognito_user_pool.learners.id
  generate_secret                      = true
  explicit_auth_flows                  = ["ALLOW_USER_AUTH"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  callback_urls                        = ["${local.site_origin}/api/auth/callback"]
  supported_identity_providers         = [aws_cognito_identity_provider.google.provider_name]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  # Time to type the e-mail code.
  auth_session_validity  = 15
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  refresh_token_rotation {
    feature                    = "ENABLED"
    retry_grace_period_seconds = 10
  }
}
```

`infra/modules/auth/outputs.tf`:

```hcl
output "user_pool_id" {
  description = "ID do user pool dos alunos."
  value       = aws_cognito_user_pool.learners.id
}

output "user_pool_arn" {
  description = "ARN do user pool, para a política da Lambda da API."
  value       = aws_cognito_user_pool.learners.arn
}

output "client_id" {
  description = "ID do cliente da API no user pool."
  value       = aws_cognito_user_pool_client.web.id
}

output "client_secret" {
  description = "Segredo do cliente da API no user pool."
  value       = aws_cognito_user_pool_client.web.client_secret
  sensitive   = true
}
```

Run: o mesmo comando do Step 1, mais `"$TF" validate` na mesma pasta.
Expected: `Success! The configuration is valid.` e `Success! 4 passed, 0 failed.`

- [ ] **Step 3: Conferir e fazer o commit**

```bash
"$TF" fmt -check -recursive infra
(cd infra && tflint --init --config "$PWD/.tflint.hcl" && tflint --recursive --config "$PWD/.tflint.hcl")
trivy config --severity HIGH,CRITICAL --exit-code 1 infra
```

Expected: sem saída de erro; o Trivy mostra 0 problemas em `modules/auth/main.tf`.

```bash
git add infra/modules/auth
git commit -m "feat(infra): módulo auth com user pool, Google, SES e gatilhos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Terraform: domínio de login, limite do WAF, Cognito na API e Google nos workflows

**Files:**
- Modify: `infra/modules/edge/variables.tf`, `infra/modules/edge/main.tf`, `infra/modules/edge/tests/edge.tftest.hcl`
- Modify: `infra/modules/api/variables.tf`, `infra/modules/api/main.tf`, `infra/modules/api/tests/api.tftest.hcl`
- Modify: `infra/live/main.tf`, `infra/live/variables.tf`, `infra/live/outputs.tf`, `infra/infracost-usage.yml`
- Modify: `.github/workflows/infra.yml`, `.github/workflows/deploy-env.yml`, `.github/workflows/deploy.yml`, `tools/smoke.sh`

**Interfaces:**
- Consumes: os outputs do módulo `auth` (Task 9).
- Produces:
  - **Módulo `edge`:**
    - variáveis `auth_domain`, `auth_user_pool_id` e `auth_rate_limit_per_5min` (padrão 50);
    - certificado `auth.<domínio>` (us-east-1), `aws_cognito_user_pool_domain` (versão 1, que depende dos registros do site) e registro A;
    - regra do WAF `rate-limit-auth`.
  - **Módulo `api`:**
    - variáveis `user_pool_id`, `user_pool_arn`, `user_pool_client_id`, `user_pool_client_secret` e `auth_domain`, repassadas à Lambda;
    - política com `PutItem` e `DeleteItem` na tabela e as 5 ações de Cognito.
  - **Raiz `live`:**
    - `local.auth_domain = "auth.${var.domain_name}"`;
    - variáveis obrigatórias `google_client_id` e `google_client_secret` (sensitive);
    - output `auth_domain`.
  - **Workflows:** `TF_VAR_google_client_id` e `TF_VAR_google_client_secret` por ambiente, e o secret `GOOGLE_CLIENT_SECRET` no `deploy-env`.

- [ ] **Step 1: Testes**

`infra/modules/edge/tests/edge.tftest.hcl`. O mock do domínio do Cognito e o certificado de login vêm por `override_resource`, porque o mock padrão do certificado lista os 5 nomes do site. A contagem de regras do WAF passa a 5, e um teste novo cobre:
- o domínio de login;
- o limite do WAF;
- os métodos de `/api/*` (portão da revisão da 1B).

```diff
--- a/infra/modules/edge/tests/edge.tftest.hcl
+++ b/infra/modules/edge/tests/edge.tftest.hcl
@@ -18,6 +18,27 @@ mock_provider "aws" {
       hosted_zone_id = "Z2FDTNDATAQYW2"
     }
   }
+
+  mock_resource "aws_cognito_user_pool_domain" {
+    defaults = {
+      cloudfront_distribution         = "d222222abcdef8.cloudfront.net"
+      cloudfront_distribution_zone_id = "Z2FDTNDATAQYW2"
+    }
+  }
+}
+
+# The sign-in certificate covers one name only.
+override_resource {
+  target = aws_acm_certificate.auth
+  values = {
+    arn = "arn:aws:acm:us-east-1:123456789012:certificate/11111111-1111-1111-1111-111111111111"
+    domain_validation_options = [{
+      domain_name           = "auth.dev.escolagratisdetecnologia.com"
+      resource_record_name  = "_validacao.auth.dev.escolagratisdetecnologia.com."
+      resource_record_type  = "CNAME"
+      resource_record_value = "_valor.acm-validations.aws."
+    }]
+  }
 }
 
 mock_provider "aws" {
@@ -56,6 +77,8 @@ variables {
   site_bucket_regional_domain_name = "egt-test-site-123.s3.sa-east-1.amazonaws.com"
   api_origin_domain                = "abc123.execute-api.sa-east-1.amazonaws.com"
   api_origin_verify_secret         = "segredo-de-teste"
+  auth_domain                      = "auth.dev.escolagratisdetecnologia.com"
+  auth_user_pool_id                = "sa-east-1_Teste123"
 }
 
 run "prod_serves_canonical_and_redirect_domains" {
@@ -133,7 +156,7 @@ run "dev_serves_only_its_domain" {
   }
 
   assert {
-    condition     = length(aws_wafv2_web_acl.edge.rule) == 4
+    condition     = length(aws_wafv2_web_acl.edge.rule) == 5
     error_message = "O WAF deveria ter 3 grupos gerenciados e o rate limit."
   }
 
@@ -217,3 +240,42 @@ run "api_on_the_same_distribution" {
     error_message = "A resposta do rate limit deveria ser JSON."
   }
 }
+
+run "sign_in_domain_and_limits" {
+  command = apply
+
+  variables {
+    domain_name = "dev.escolagratisdetecnologia.com"
+  }
+
+  assert {
+    condition     = aws_cognito_user_pool_domain.auth.domain == "auth.dev.escolagratisdetecnologia.com" && aws_cognito_user_pool_domain.auth.user_pool_id == "sa-east-1_Teste123"
+    error_message = "O login com Google passa por auth.<domínio>, do pool dos alunos."
+  }
+
+  assert {
+    condition     = aws_cognito_user_pool_domain.auth.certificate_arn == aws_acm_certificate_validation.auth.certificate_arn && aws_cognito_user_pool_domain.auth.managed_login_version == 1
+    error_message = "O domínio de login usa o próprio certificado (us-east-1), já validado."
+  }
+
+  assert {
+    condition     = one(aws_route53_record.auth.alias).name == "d222222abcdef8.cloudfront.net" && aws_route53_record.auth.type == "A"
+    error_message = "auth.<domínio> aponta para o CloudFront do Cognito."
+  }
+
+  assert {
+    condition = anytrue([
+      for r in aws_wafv2_web_acl.edge.rule : r.name == "rate-limit-auth" &&
+      r.priority < one([for other in aws_wafv2_web_acl.edge.rule : other.priority if other.name == "rate-limit-ip"]) &&
+      r.statement[0].rate_based_statement[0].limit == 50 &&
+      r.statement[0].rate_based_statement[0].scope_down_statement[0].byte_match_statement[0].search_string == "/api/auth/" &&
+      r.action[0].block[0].custom_response[0].response_code == 429
+    ])
+    error_message = "Login: no máximo 50 requisições por IP a cada 5 minutos, com 429 em JSON."
+  }
+
+  assert {
+    condition     = one(aws_cloudfront_distribution.site.ordered_cache_behavior).allowed_methods == toset(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"])
+    error_message = "A API recebe todos os métodos (PATCH e DELETE da conta incluídos)."
+  }
+}
```

`infra/modules/api/tests/api.tftest.hcl` confere as variáveis do Cognito na Lambda e o conjunto **exato** de ações IAM (portão da revisão da 1B):

```diff
--- a/infra/modules/api/tests/api.tftest.hcl
+++ b/infra/modules/api/tests/api.tftest.hcl
@@ -52,6 +52,12 @@ variables {
   table_name      = "egt-test-data-main"
   table_arn       = "arn:aws:dynamodb:sa-east-1:123456789012:table/egt-test-data-main"
   alarm_topic_arn = "arn:aws:sns:sa-east-1:123456789012:egt-test-observability-alerts"
+
+  user_pool_id            = "sa-east-1_Teste123"
+  user_pool_arn           = "arn:aws:cognito-idp:sa-east-1:123456789012:userpool/sa-east-1_Teste123"
+  user_pool_client_id     = "cliente-teste"
+  user_pool_client_secret = "segredo-do-cliente"
+  auth_domain             = "auth.dev.example.com"
 }
 
 run "lambda_behind_http_api" {
@@ -72,6 +78,32 @@ run "lambda_behind_http_api" {
     error_message = "Variáveis de ambiente da API incompletas."
   }
 
+  assert {
+    condition = (
+      aws_lambda_function.handler.environment[0].variables["USER_POOL_ID"] == "sa-east-1_Teste123" &&
+      aws_lambda_function.handler.environment[0].variables["USER_POOL_CLIENT_ID"] == "cliente-teste" &&
+      aws_lambda_function.handler.environment[0].variables["USER_POOL_CLIENT_SECRET"] == "segredo-do-cliente" &&
+      aws_lambda_function.handler.environment[0].variables["AUTH_DOMAIN"] == "auth.dev.example.com"
+    )
+    error_message = "A Lambda recebe o pool, o cliente e o domínio de login."
+  }
+
+  assert {
+    condition = (
+      toset(one([for statement in data.aws_iam_policy_document.handler.statement : statement.actions if statement.sid == "ReadWriteTable"])) == toset(["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"]) &&
+      toset(one([for statement in data.aws_iam_policy_document.handler.statement : statement.resources if statement.sid == "ReadWriteTable"])) == toset(["arn:aws:dynamodb:sa-east-1:123456789012:table/egt-test-data-main"])
+    )
+    error_message = "Na tabela, só as ações que os repositórios usam."
+  }
+
+  assert {
+    condition = (
+      toset(one([for statement in data.aws_iam_policy_document.handler.statement : statement.actions if statement.sid == "LearnerAccounts"])) == toset(["cognito-idp:AdminInitiateAuth", "cognito-idp:AdminRespondToAuthChallenge", "cognito-idp:AdminGetUser", "cognito-idp:AdminDeleteUser", "cognito-idp:AdminDisableProviderForUser"]) &&
+      toset(one([for statement in data.aws_iam_policy_document.handler.statement : statement.resources if statement.sid == "LearnerAccounts"])) == toset(["arn:aws:cognito-idp:sa-east-1:123456789012:userpool/sa-east-1_Teste123"])
+    )
+    error_message = "No Cognito, só login por código, ler o e-mail e excluir a conta, neste pool."
+  }
+
   assert {
     condition     = aws_lambda_function.handler.environment[0].variables["ORIGIN_VERIFY_SECRET"] == random_password.origin_verify.result
     error_message = "A Lambda deve conhecer o segredo de origem."
```

Run (em cada módulo, com dados isolados):

```bash
export TF_PLUGIN_CACHE_DIR="$HOME/.cache/terraform-plugins"
TF="$(mise which terraform)"
for module in edge api; do
  (cd "infra/modules/$module" && export TF_DATA_DIR="$(mktemp -d)" AWS_PROFILE= AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null && "$TF" init -backend=false -input=false >/dev/null && "$TF" test)
done
```

Expected: FAIL (variáveis e recursos novos ainda não existem).

- [ ] **Step 2: Borda**

`infra/modules/edge/variables.tf`:

```diff
--- a/infra/modules/edge/variables.tf
+++ b/infra/modules/edge/variables.tf
@@ -56,3 +56,19 @@ variable "api_origin_verify_secret" {
   type        = string
   sensitive   = true
 }
+
+variable "auth_domain" {
+  description = "Domínio de login do Cognito (auth.<domínio>), usado no login com Google."
+  type        = string
+}
+
+variable "auth_user_pool_id" {
+  description = "User pool dos alunos, dono do domínio de login."
+  type        = string
+}
+
+variable "auth_rate_limit_per_5min" {
+  description = "Requisições a /api/auth/* aceitas por IP a cada 5 minutos (spec §5.4)."
+  type        = number
+  default     = 50
+}
```

`infra/modules/edge/main.tf`. A regra de login entra antes da `rate-limit-ip`. O domínio de login entra antes da seção `--- CloudFront access to the bucket ---`:

```diff
--- a/infra/modules/edge/main.tf
+++ b/infra/modules/edge/main.tf
@@ -99,6 +99,55 @@ resource "aws_wafv2_web_acl" "edge" {
     }
   }
 
+  # Sign-in: far fewer tries per IP than the rest of the site (spec §5.4). Same 429 in JSON.
+  rule {
+    name     = "rate-limit-auth"
+    priority = 35
+
+    action {
+      block {
+        custom_response {
+          response_code            = 429
+          custom_response_body_key = "rate-limited"
+
+          response_header {
+            name  = "retry-after"
+            value = "300"
+          }
+        }
+      }
+    }
+
+    statement {
+      rate_based_statement {
+        limit              = var.auth_rate_limit_per_5min
+        aggregate_key_type = "IP"
+
+        scope_down_statement {
+          byte_match_statement {
+            positional_constraint = "STARTS_WITH"
+            search_string         = "/api/auth/"
+
+            field_to_match {
+              uri_path {}
+            }
+
+            text_transformation {
+              priority = 0
+              type     = "LOWERCASE"
+            }
+          }
+        }
+      }
+    }
+
+    visibility_config {
+      cloudwatch_metrics_enabled = true
+      metric_name                = "${var.name_prefix}-rate-limit-auth"
+      sampled_requests_enabled   = true
+    }
+  }
+
   rule {
     name     = "rate-limit-ip"
     priority = 40
@@ -342,6 +391,56 @@ resource "aws_route53_record" "alias" {
   }
 }
 
+# --- Sign-in domain (auth.<domain>): Cognito's own CloudFront, for Google sign-in (ADR 0024) ---
+
+resource "aws_acm_certificate" "auth" {
+  provider          = aws.us_east_1
+  domain_name       = var.auth_domain
+  validation_method = "DNS"
+  tags              = local.tags
+
+  lifecycle {
+    create_before_destroy = true
+  }
+}
+
+resource "aws_route53_record" "auth_certificate_validation" {
+  zone_id         = var.zone_id
+  name            = one(aws_acm_certificate.auth.domain_validation_options).resource_record_name
+  type            = one(aws_acm_certificate.auth.domain_validation_options).resource_record_type
+  records         = [one(aws_acm_certificate.auth.domain_validation_options).resource_record_value]
+  ttl             = 300
+  allow_overwrite = true
+}
+
+resource "aws_acm_certificate_validation" "auth" {
+  provider                = aws.us_east_1
+  certificate_arn         = aws_acm_certificate.auth.arn
+  validation_record_fqdns = [aws_route53_record.auth_certificate_validation.fqdn]
+}
+
+# Cognito refuses auth.<domain> until the site's own name resolves.
+resource "aws_cognito_user_pool_domain" "auth" {
+  domain                = var.auth_domain
+  user_pool_id          = var.auth_user_pool_id
+  certificate_arn       = aws_acm_certificate_validation.auth.certificate_arn
+  managed_login_version = 1
+
+  depends_on = [aws_route53_record.alias]
+}
+
+resource "aws_route53_record" "auth" {
+  zone_id = var.zone_id
+  name    = var.auth_domain
+  type    = "A"
+
+  alias {
+    name                   = aws_cognito_user_pool_domain.auth.cloudfront_distribution
+    zone_id                = aws_cognito_user_pool_domain.auth.cloudfront_distribution_zone_id
+    evaluate_target_health = false
+  }
+}
+
 # --- CloudFront access to the bucket ---
 
 data "aws_iam_policy_document" "site_bucket" {
```

- [ ] **Step 3: API**

`infra/modules/api/variables.tf`:

```diff
--- a/infra/modules/api/variables.tf
+++ b/infra/modules/api/variables.tf
@@ -33,6 +33,32 @@ variable "table_arn" {
   type        = string
 }
 
+variable "user_pool_id" {
+  description = "User pool dos alunos (login, ADR 0024)."
+  type        = string
+}
+
+variable "user_pool_arn" {
+  description = "ARN do user pool, para a política de menor privilégio."
+  type        = string
+}
+
+variable "user_pool_client_id" {
+  description = "Cliente da API no user pool."
+  type        = string
+}
+
+variable "user_pool_client_secret" {
+  description = "Segredo do cliente da API no user pool."
+  type        = string
+  sensitive   = true
+}
+
+variable "auth_domain" {
+  description = "Domínio de login do Cognito (auth.<domínio>), por onde passa o login com Google."
+  type        = string
+}
+
 variable "alarm_topic_arn" {
   description = "Tópico SNS que recebe os alarmes."
   type        = string
```

`infra/modules/api/main.tf`:

```diff
--- a/infra/modules/api/main.tf
+++ b/infra/modules/api/main.tf
@@ -77,10 +77,30 @@ data "aws_iam_policy_document" "handler" {
   }
 
   statement {
-    sid       = "ReadWriteTable"
-    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem"]
+    sid = "ReadWriteTable"
+    actions = [
+      "dynamodb:GetItem",
+      "dynamodb:Query",
+      "dynamodb:PutItem",
+      "dynamodb:UpdateItem",
+      "dynamodb:DeleteItem",
+    ]
     resources = [var.table_arn]
   }
+
+  # Sign-in with e-mail codes, the e-mail on the Eu page, and account deletion. SignUp,
+  # ConfirmSignUp, token refresh and revocation are public Cognito APIs (no IAM).
+  statement {
+    sid = "LearnerAccounts"
+    actions = [
+      "cognito-idp:AdminInitiateAuth",
+      "cognito-idp:AdminRespondToAuthChallenge",
+      "cognito-idp:AdminGetUser",
+      "cognito-idp:AdminDeleteUser",
+      "cognito-idp:AdminDisableProviderForUser",
+    ]
+    resources = [var.user_pool_arn]
+  }
 }
 
 resource "aws_iam_role_policy" "handler" {
@@ -104,12 +124,16 @@ resource "aws_lambda_function" "handler" {
 
   environment {
     variables = {
-      APP_ENV              = var.environment
-      APP_VERSION          = var.app_version
-      TABLE_NAME           = var.table_name
-      SITE_ORIGIN          = var.site_origin
-      ORIGIN_VERIFY_SECRET = random_password.origin_verify.result
-      NODE_OPTIONS         = "--enable-source-maps"
+      APP_ENV                 = var.environment
+      APP_VERSION             = var.app_version
+      TABLE_NAME              = var.table_name
+      SITE_ORIGIN             = var.site_origin
+      ORIGIN_VERIFY_SECRET    = random_password.origin_verify.result
+      USER_POOL_ID            = var.user_pool_id
+      USER_POOL_CLIENT_ID     = var.user_pool_client_id
+      USER_POOL_CLIENT_SECRET = var.user_pool_client_secret
+      AUTH_DOMAIN             = var.auth_domain
+      NODE_OPTIONS            = "--enable-source-maps"
     }
   }
 
```

Run: o comando do Step 1.
Expected: `Success!` nos dois módulos (`edge`: 4 passed; `api`: 1 passed).

- [ ] **Step 4: Raiz `live`, custos e workflows**

`infra/live/main.tf`:

```diff
--- a/infra/live/main.tf
+++ b/infra/live/main.tf
@@ -1,3 +1,8 @@
+locals {
+  # Cognito's sign-in domain, used by the Google sign-in (ADR 0024).
+  auth_domain = "auth.${var.domain_name}"
+}
+
 module "tags" {
   source      = "../modules/tags"
   environment = var.environment
@@ -23,6 +28,18 @@ module "data" {
   deletion_protection = var.data_deletion_protection
 }
 
+module "auth" {
+  source = "../modules/auth"
+
+  name_prefix          = module.tags.name_prefix
+  domain_name          = var.domain_name
+  zone_id              = data.aws_route53_zone.site.zone_id
+  package_dir          = "${path.root}/../../apps/api/dist"
+  google_client_id     = var.google_client_id
+  google_client_secret = var.google_client_secret
+  deletion_protection  = var.data_deletion_protection
+}
+
 module "api" {
   source = "../modules/api"
 
@@ -35,6 +52,12 @@ module "api" {
   table_arn       = module.data.table_arn
   alarm_topic_arn = module.observability.alerts_topic_arn
 
+  user_pool_id            = module.auth.user_pool_id
+  user_pool_arn           = module.auth.user_pool_arn
+  user_pool_client_id     = module.auth.client_id
+  user_pool_client_secret = module.auth.client_secret
+  auth_domain             = local.auth_domain
+
   # Rotation of the CloudFront → API secret: bump and merge (docs/runbooks/deploy.md).
   origin_verify_version = 1
 }
@@ -57,6 +80,8 @@ module "edge" {
   site_bucket_regional_domain_name = module.site.bucket_regional_domain_name
   api_origin_domain                = module.api.origin_domain
   api_origin_verify_secret         = module.api.origin_verify_secret
+  auth_domain                      = local.auth_domain
+  auth_user_pool_id                = module.auth.user_pool_id
 }
 
 module "observability" {
```

`infra/live/variables.tf`:

```diff
--- a/infra/live/variables.tf
+++ b/infra/live/variables.tf
@@ -43,8 +43,19 @@ variable "app_version" {
   default     = "local"
 }
 
+variable "google_client_id" {
+  description = "ID do cliente OAuth do Google deste ambiente (GitHub Variable GOOGLE_CLIENT_ID_<AMBIENTE>, via TF_VAR_google_client_id)."
+  type        = string
+}
+
+variable "google_client_secret" {
+  description = "Segredo do cliente OAuth do Google (GitHub Secret GOOGLE_CLIENT_SECRET_<AMBIENTE>, via TF_VAR_google_client_secret)."
+  type        = string
+  sensitive   = true
+}
+
 variable "data_deletion_protection" {
-  description = "Proteção contra exclusão da tabela DynamoDB (ligada em prod)."
+  description = "Proteção contra exclusão da tabela DynamoDB e do user pool dos alunos (ligada em prod)."
   type        = bool
   default     = true
 }
```

`infra/live/outputs.tf`:

```diff
--- a/infra/live/outputs.tf
+++ b/infra/live/outputs.tf
@@ -22,3 +22,8 @@ output "api_gateway_endpoint" {
   description = "URL direta do API Gateway; o deploy confere que ela responde 403."
   value       = module.api.endpoint
 }
+
+output "auth_domain" {
+  description = "Domínio de login do Cognito; o Google Cloud precisa de https://<auth_domain>/oauth2/idpresponse."
+  value       = local.auth_domain
+}
```

`infra/infracost-usage.yml` (o uso dos gatilhos é bem menor que o da API):

```diff
--- a/infra/infracost-usage.yml
+++ b/infra/infracost-usage.yml
@@ -32,3 +32,13 @@ resource_type_default_usage:
     storage_gb: 1
     monthly_data_ingested_gb: 1
     monthly_data_scanned_gb: 1
+# Accounts (Phase 1C): Cognito Essentials is free up to 10,000 MAU and Infracost does not price
+# it; the triggers run once per sign-up and per code e-mail.
+resource_usage:
+  module.auth.aws_lambda_function.triggers:
+    monthly_requests: 5000
+    request_duration_ms: 300
+  module.auth.aws_cloudwatch_log_group.triggers:
+    storage_gb: 0.1
+    monthly_data_ingested_gb: 0.1
+    monthly_data_scanned_gb: 0.1
```

`.github/workflows/infra.yml`:

```diff
--- a/.github/workflows/infra.yml
+++ b/.github/workflows/infra.yml
@@ -95,6 +95,8 @@ jobs:
         env:
           TF_VAR_alert_emails: ${{ secrets.ALERT_EMAILS || '[]' }}
           TF_VAR_app_version: ${{ github.sha }}
+          TF_VAR_google_client_id: ${{ matrix.env == 'prod' && vars.GOOGLE_CLIENT_ID_PROD || vars.GOOGLE_CLIENT_ID_DEV }}
+          TF_VAR_google_client_secret: ${{ matrix.env == 'prod' && secrets.GOOGLE_CLIENT_SECRET_PROD || secrets.GOOGLE_CLIENT_SECRET_DEV }}
       # plan.json holds sensitive values (such as alert_emails) in plain text: never upload it as an artifact.
       - run: terraform -chdir=infra/live show -json tfplan > plan.json
       - name: check-tags
```

`.github/workflows/deploy-env.yml`:

```diff
--- a/.github/workflows/deploy-env.yml
+++ b/.github/workflows/deploy-env.yml
@@ -20,6 +20,9 @@ on:
       ALERT_EMAILS:
         description: Lista JSON de e-mails de alerta de orçamento
         required: false
+      GOOGLE_CLIENT_SECRET:
+        description: Segredo do cliente OAuth do Google deste ambiente
+        required: true
 
 permissions:
   contents: read
@@ -60,6 +63,8 @@ jobs:
         env:
           TF_VAR_alert_emails: ${{ secrets.ALERT_EMAILS || '[]' }}
           TF_VAR_app_version: ${{ github.sha }}
+          TF_VAR_google_client_id: ${{ inputs.environment == 'prod' && vars.GOOGLE_CLIENT_ID_PROD || vars.GOOGLE_CLIENT_ID_DEV }}
+          TF_VAR_google_client_secret: ${{ secrets.GOOGLE_CLIENT_SECRET }}
       - run: tools/deploy-site.sh "$ENVIRONMENT"
       - run: tools/smoke.sh "$SITE_URL" "$GITHUB_SHA"
       - name: API recusa acesso direto (sem CloudFront)
```

`.github/workflows/deploy.yml`:

```diff
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -32,6 +32,7 @@ jobs:
       site_url: https://dev.escolagratisdetecnologia.com
     secrets:
       ALERT_EMAILS: ${{ secrets.ALERT_EMAILS }}
+      GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET_DEV }}
 
   prod:
     needs: dev
@@ -42,3 +43,4 @@ jobs:
       redirect_hosts: www.escolagratisdetecnologia.com.br escolagratisdetecnologia.com www.escolagratisdetecnologia.com
     secrets:
       ALERT_EMAILS: ${{ secrets.ALERT_EMAILS }}
+      GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET_PROD }}
```

`tools/smoke.sh`: sem sessão, `/api/me` responde 401 em JSON, e o login com Google começa (302 para um `/authorize`):

```diff
--- a/tools/smoke.sh
+++ b/tools/smoke.sh
@@ -59,6 +59,24 @@ if [[ "$api_404" != "404 application/json"* ]]; then
   exit 1
 fi
 
+# Accounts (ADR 0024): personal routes ask for a session in JSON, and the Google sign-in starts.
+if ! me="$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --retry 3 --retry-all-errors --max-time 10 "$url/api/me")"; then
+  echo "Falha de rede ao verificar /api/me." >&2
+  exit 1
+fi
+if [[ "$me" != "401 application/json"* ]]; then
+  echo "Esperado 401 em JSON em /api/me sem sessão, recebido '$me'." >&2
+  exit 1
+fi
+if ! google="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --retry 3 --retry-all-errors --max-time 10 "$url/api/auth/google")"; then
+  echo "Falha de rede ao verificar o início do login com Google." >&2
+  exit 1
+fi
+if [[ ! "$google" =~ ^302\ .+/authorize\? ]]; then
+  echo "O login com Google deveria redirecionar para o /authorize, recebido '$google'." >&2
+  exit 1
+fi
+
 if [[ "$url" == https://* ]]; then
   if ! headers="$(curl -fsSI --retry 3 --retry-all-errors --max-time 10 "$url/")"; then
     echo "Falha de rede ao ler os cabeçalhos de $url/." >&2
```

Run:

```bash
"$TF" fmt -recursive infra
(cd infra/live && export TF_DATA_DIR="$(mktemp -d)" AWS_PROFILE= AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null && "$TF" init -backend=false -input=false >/dev/null && "$TF" validate)
(cd infra && tflint --recursive --config "$PWD/.tflint.hcl")
trivy config --severity HIGH,CRITICAL --exit-code 1 infra
bash -n tools/smoke.sh
git status --short infra/live/.terraform.lock.hcl
```

Expected: `Success! The configuration is valid.`, tflint e Trivy limpos, `bash -n` sem saída e o lock file sem mudança (os providers são os mesmos).

- [ ] **Step 5: Fazer o commit**

```bash
git add infra .github/workflows tools/smoke.sh
git commit -m "feat(infra): domínio de login, limite do WAF para o login e Cognito na API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Site: cliente da API e sincronização do progresso

Portões da revisão da 1B: o cliente manda a mescla **um curso por pedido**, e trata como erro genérico a resposta que não é JSON (o 403 do WAF vira a página 404 em HTML). Toda mudança de progresso passa a marcar o curso como pendente. Com sessão:
- os pendentes vão para a conta;
- o aparelho adota o progresso da conta;
- a cada 5 minutos, no máximo, busca o que outros aparelhos salvaram.

**Files:**
- Create: `apps/web/src/lib/session.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/api.test.ts`, `apps/web/src/lib/progress-sync.ts`, `apps/web/src/lib/progress-sync.test.ts`, `apps/web/src/scripts/sync.ts`
- Modify: `apps/web/src/scripts/lesson-complete.ts`, `apps/web/src/islands/Quiz.tsx`, `apps/web/src/layouts/App.astro`

**Interfaces:**
- Consumes: `readProgress`, `writeProgress`, `clearProgress` (`src/lib/progress-store.ts`); `parseProgress` (`@egt/core`); as rotas `/api/progress*` e `/api/auth/refresh`.
- Produces:
  - Sessão e API:
    - `hasSession(): boolean` (cookie `egt_hint=1`);
    - `api<T>(path, { method?, body?, keepalive? }): Promise<ApiResult<T>>`, onde `ApiResult<T> = { ok: true; status; data: T } | { ok: false; status; error: { code; message } }`;
    - `UNAVAILABLE`.
  - Sincronização:
    - `PENDING_KEY = 'egt:progress:pending:v1'` e `PULLED_KEY = 'egt:progress:pulled:v1'`;
    - `readPending()`, `saveProgress(progress, course)` e `syncPending({ keepalive? })`;
    - `pullProgress({ force?, now? })`, `syncAfterSignIn()` e `forgetProgress()`.

- [ ] **Step 1: Testes**

`apps/web/src/lib/api.test.ts`:

```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, UNAVAILABLE } from './api.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status });

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { path: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    calls.push({ path, init });
    const next = responses.shift();
    if (next === undefined || next instanceof Error) throw next ?? new Error('no response');
    return next;
  });
  return calls;
}

describe('api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'egt_hint=; max-age=0; path=/';
  });

  it('sends JSON with the session cookies and reads JSON back', async () => {
    const calls = fakeFetch(json({ profile: null }, 201));

    const res = await api('/api/me', { method: 'PATCH', body: { birthYear: 2000 } });

    expect(res).toEqual({ ok: true, status: 201, data: { profile: null } });
    expect(calls[0]?.init).toMatchObject({
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{"birthYear":2000}',
    });
  });

  it('passes on the error of the API', async () => {
    fakeFetch(json({ error: { code: 'invalid_code', message: 'Código incorreto.' } }, 400));

    expect(await api('/api/auth/email/verify')).toEqual({
      ok: false,
      status: 400,
      error: { code: 'invalid_code', message: 'Código incorreto.' },
    });
  });

  it('turns pages from the CDN or the WAF and network failures into a generic error', async () => {
    fakeFetch(
      new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } }),
      new Error('offline'),
    );

    expect(await api('/api/progress')).toEqual({ ok: false, status: 404, error: UNAVAILABLE });
    expect(await api('/api/progress')).toEqual({ ok: false, status: 0, error: UNAVAILABLE });
  });

  it('renews an expired session once and tries again', async () => {
    document.cookie = 'egt_hint=1; path=/';
    const expired = json({ error: { code: 'unauthenticated', message: 'Entre.' } }, 401);
    const calls = fakeFetch(expired, json({ status: 'refreshed' }), json({ email: 'a@b.c' }));

    const res = await api('/api/me');

    expect(res.ok).toBe(true);
    expect(calls.map(({ path, init }) => `${init.method} ${path}`)).toEqual([
      'GET /api/me',
      'POST /api/auth/refresh',
      'GET /api/me',
    ]);
  });

  it('does not try to renew without a session', async () => {
    const calls = fakeFetch(json({ error: { code: 'unauthenticated', message: 'Entre.' } }, 401));

    const res = await api('/api/me');

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(1);
  });
});
```

`apps/web/src/lib/progress-sync.test.ts`:

```ts
// @vitest-environment happy-dom
import { completeLesson, emptyProgress, type Progress } from '@egt/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProgress, writeProgress } from './progress-store.ts';
import {
  forgetProgress,
  pullProgress,
  readPending,
  saveProgress,
  syncAfterSignIn,
  syncPending,
} from './progress-sync.ts';

const T1 = new Date('2026-10-10T10:00:00.000Z');
const T2 = new Date('2026-10-10T11:00:00.000Z');

function serverWith(progress: Progress) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({ method: init.method ?? 'GET', path, ...(body === undefined ? {} : { body }) });
    if (path === '/api/progress/merge') {
      for (const [slug, course] of Object.entries(body.courses as Progress['courses'])) {
        progress = { ...progress, courses: { ...progress.courses, [slug]: course } };
      }
    }
    return Response.json(progress);
  });
  return calls;
}

const signIn = () => {
  document.cookie = 'egt_hint=1; path=/';
};

describe('progress sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.cookie = 'egt_hint=; max-age=0; path=/';
  });

  it('without a session, saves only on this device and remembers what to send', () => {
    const calls = serverWith(emptyProgress());

    saveProgress(completeLesson(emptyProgress(), 'site', 'a', T1), 'site');

    expect(readProgress().courses.site?.completedLessons).toEqual(['a']);
    expect(readPending()).toEqual(['site']);
    expect(calls).toEqual([]);
  });

  it('with a session, sends the changed course and adopts the account progress', async () => {
    signIn();
    const other = completeLesson(emptyProgress(), 'planilhas', 'x', T1).courses.planilhas!;
    const calls = serverWith({ version: 1, courses: { planilhas: other } });
    writeProgress(completeLesson(emptyProgress(), 'site', 'a', T2));
    saveProgress(readProgress(), 'site');

    await syncPending();

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/progress/merge',
      body: { version: 1, courses: { site: readProgress().courses.site } },
    });
    expect(Object.keys(readProgress().courses).sort()).toEqual(['planilhas', 'site']);
    expect(readPending()).toEqual([]);
  });

  it('keeps the pending courses when the API cannot be reached', async () => {
    signIn();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('<html></html>', { status: 404, headers: { 'content-type': 'text/html' } }),
    );
    writeProgress(completeLesson(emptyProgress(), 'site', 'a', T1));

    saveProgress(readProgress(), 'site');

    expect(await syncPending()).toBe(false);
    expect(readPending()).toEqual(['site']);
  });

  it('after signing in, sends each course of this device in its own request', async () => {
    signIn();
    let progress = completeLesson(emptyProgress(), 'site', 'a', T1);
    progress = completeLesson(progress, 'planilhas', 'x', T1);
    writeProgress(progress);
    const calls = serverWith(emptyProgress());

    expect(await syncAfterSignIn()).toBe(true);

    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /api/progress/merge',
      'POST /api/progress/merge',
      'GET /api/progress',
    ]);
    expect(calls.slice(0, 2).map(({ body }) => Object.keys((body as Progress).courses))).toEqual([
      ['site'],
      ['planilhas'],
    ]);
  });

  it('brings in other devices at most every five minutes', async () => {
    signIn();
    const calls = serverWith(emptyProgress());

    await pullProgress({ now: 1_000_000 });
    await pullProgress({ now: 1_000_000 + 60_000 });
    await pullProgress({ now: 1_000_000 + 6 * 60_000 });

    expect(calls.filter(({ path }) => path === '/api/progress')).toHaveLength(2);
  });

  it('forgets everything on this device when the learner signs out', () => {
    saveProgress(completeLesson(emptyProgress(), 'site', 'a', T1), 'site');

    forgetProgress();

    expect(readProgress()).toEqual(emptyProgress());
    expect(readPending()).toEqual([]);
  });
});
```

Run: `pnpm exec vitest run --project web`
Expected: FAIL (`./api.ts` e `./progress-sync.ts` não existem).

- [ ] **Step 2: Implementar**

`apps/web/src/lib/session.ts`:

```ts
/** The API sets egt_hint=1 with the session (spec §5.2): the pages only need to know it exists. */
export function hasSession(): boolean {
  try {
    return document.cookie.split('; ').includes('egt_hint=1');
  } catch {
    return false;
  }
}
```

`apps/web/src/lib/api.ts`:

```ts
import { hasSession } from './session.ts';

export interface ApiError {
  code: string;
  message: string;
}

export type ApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Lets the request finish after the page changes (lesson completed, then the next one). */
  keepalive?: boolean;
}

/** Shown when the answer is not the API's JSON: no internet, or a page from the CDN or the WAF. */
export const UNAVAILABLE: ApiError = {
  code: 'unavailable',
  message: 'Não conseguimos falar com a Escola agora. Confira sua internet e tente de novo.',
};

async function send(path: string, request: ApiRequest): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: request.method ?? 'GET',
      credentials: 'same-origin',
      keepalive: request.keepalive ?? false,
      ...(request.body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.body) }),
    });
  } catch {
    return null;
  }
}

function isApiError(value: unknown): value is { error: ApiError } {
  const error = (value as { error?: Partial<ApiError> } | null)?.error;
  return typeof error?.code === 'string' && typeof error.message === 'string';
}

async function read<T>(res: Response | null): Promise<ApiResult<T>> {
  if (res === null) return { ok: false, status: 0, error: UNAVAILABLE };
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    return { ok: false, status: res.status, error: UNAVAILABLE };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  return { ok: false, status: res.status, error: isApiError(body) ? body.error : UNAVAILABLE };
}

/**
 * Calls the API on the same site, with the session cookies. When the access token has expired,
 * renews the session once and tries again.
 */
export async function api<T>(path: string, request: ApiRequest = {}): Promise<ApiResult<T>> {
  const first = await send(path, request);
  if (first?.status === 401 && hasSession()) {
    const refreshed = await send('/api/auth/refresh', { method: 'POST' });
    if (refreshed?.ok) return read<T>(await send(path, request));
  }
  return read<T>(first);
}
```

`apps/web/src/lib/progress-sync.ts`:

```ts
import { parseProgress, type Progress } from '@egt/core';
import { api } from './api.ts';
import { clearProgress, readProgress, writeProgress } from './progress-store.ts';
import { hasSession } from './session.ts';

/** Courses changed on this device and not yet in the account. */
export const PENDING_KEY = 'egt:progress:pending:v1';
/** When this device last brought in progress from the account (other devices). */
export const PULLED_KEY = 'egt:progress:pulled:v1';
const PULL_EVERY_MS = 5 * 60_000;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readPending(): string[] {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writePending(courses: string[]): void {
  try {
    storage()?.setItem(PENDING_KEY, JSON.stringify([...new Set(courses)]));
  } catch {
    // Storage blocked: the course syncs with the next change.
  }
}

/** The account's progress, except courses this device still has to send (their local copy is newer). */
function adopt(account: Progress): void {
  const pending = new Set(readPending());
  const local = readProgress();
  const courses = { ...parseProgress(account).courses };
  for (const course of pending) {
    const mine = local.courses[course];
    if (mine) courses[course] = mine;
  }
  writeProgress({ version: 1, courses });
}

/**
 * Sends the pending courses to the account, one course per request (small bodies, far below the
 * 8 KB limit). Stops at the first failure and keeps the rest for the next page.
 */
export async function syncPending(options: { keepalive?: boolean } = {}): Promise<boolean> {
  if (!hasSession()) return false;
  for (const course of readPending()) {
    const progress = readProgress().courses[course];
    if (progress !== undefined) {
      const res = await api<Progress>('/api/progress/merge', {
        method: 'POST',
        body: { version: 1, courses: { [course]: progress } },
        keepalive: options.keepalive ?? false,
      });
      if (!res.ok) return false;
      writePending(readPending().filter((item) => item !== course));
      adopt(res.data);
    } else {
      writePending(readPending().filter((item) => item !== course));
    }
  }
  return true;
}

/** Saves on this device and, with a session, in the account too. */
export function saveProgress(progress: Progress, course: string): void {
  writeProgress(progress);
  writePending([...readPending(), course]);
  if (hasSession()) void syncPending({ keepalive: true });
}

/** Brings in what other devices saved, at most every few minutes unless `force`. */
export async function pullProgress(
  options: { force?: boolean; now?: number } = {},
): Promise<boolean> {
  if (!hasSession()) return false;
  const now = options.now ?? Date.now();
  const last = Number(storage()?.getItem(PULLED_KEY) ?? 0);
  if (!options.force && now - last < PULL_EVERY_MS) return true;
  const res = await api<Progress>('/api/progress');
  if (!res.ok) return false;
  adopt(res.data);
  try {
    storage()?.setItem(PULLED_KEY, String(now));
  } catch {
    // Pulls again on the next page.
  }
  return true;
}

/** Right after signing in: everything on this device goes to the account, then comes back merged. */
export async function syncAfterSignIn(): Promise<boolean> {
  writePending([...readPending(), ...Object.keys(readProgress().courses)]);
  return (await syncPending()) && (await pullProgress({ force: true }));
}

/** Signing out (or deleting the account) leaves nothing of the learner on this device. */
export function forgetProgress(): void {
  clearProgress();
  try {
    storage()?.removeItem(PENDING_KEY);
    storage()?.removeItem(PULLED_KEY);
  } catch {
    // Nothing stored.
  }
}
```

`apps/web/src/scripts/sync.ts` (roda em toda página):

```ts
import { pullProgress, syncPending } from '../lib/progress-sync.ts';

// Every page: with a session, send what is pending and bring in what other devices saved.
void syncPending().then(() => pullProgress());
```

As gravações passam por `saveProgress`:

```diff
--- a/apps/web/src/scripts/lesson-complete.ts
+++ b/apps/web/src/scripts/lesson-complete.ts
@@ -1,14 +1,15 @@
 import { completeLesson, visitLesson } from '@egt/core';
-import { readProgress, writeProgress } from '../lib/progress-store.ts';
+import { readProgress } from '../lib/progress-store.ts';
+import { saveProgress } from '../lib/progress-sync.ts';
 
 // Lesson page: remembers the visit and marks the lesson done when the learner moves on.
 const lesson = document.querySelector<HTMLElement>('[data-lesson]');
 if (lesson) {
   const course = lesson.dataset.course ?? '';
   const slug = lesson.dataset.lesson ?? '';
-  writeProgress(visitLesson(readProgress(), course, slug, new Date()));
+  saveProgress(visitLesson(readProgress(), course, slug, new Date()), course);
   lesson.querySelector('[data-complete]')?.addEventListener('click', () => {
-    writeProgress(completeLesson(readProgress(), course, slug, new Date()));
+    saveProgress(completeLesson(readProgress(), course, slug, new Date()), course);
   });
   lesson.dataset.ready = 'true';
 }
```

```diff
--- a/apps/web/src/islands/Quiz.tsx
+++ b/apps/web/src/islands/Quiz.tsx
@@ -1,7 +1,8 @@
 import type { QuizQuestion } from '@egt/content';
 import { recordCorrectAnswer } from '@egt/core';
 import { useState } from 'preact/hooks';
-import { readProgress, writeProgress } from '../lib/progress-store.ts';
+import { readProgress } from '../lib/progress-store.ts';
+import { saveProgress } from '../lib/progress-sync.ts';
 
 interface Props {
   course: string;
@@ -14,7 +15,7 @@ interface Answer {
   result?: 'correct' | 'wrong';
 }
 
-/** Formative quiz: checks each answer on the spot and remembers the right ones on this device. */
+/** Formative quiz: checks each answer on the spot and remembers the right ones (device and account). */
 export default function Quiz({ course, lesson, questions }: Props) {
   const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({})));
   const update = (index: number, answer: Answer) =>
@@ -27,7 +28,7 @@ export default function Quiz({ course, lesson, questions }: Props) {
     const correct = selected === question.answer;
     update(index, { selected, result: correct ? 'correct' : 'wrong' });
     if (correct)
-      writeProgress(recordCorrectAnswer(readProgress(), course, lesson, index, new Date()));
+      saveProgress(recordCorrectAnswer(readProgress(), course, lesson, index, new Date()), course);
   };
 
   return (
```

`apps/web/src/layouts/App.astro` inclui o script de sincronização:

```diff
--- a/apps/web/src/layouts/App.astro
+++ b/apps/web/src/layouts/App.astro
@@ -30,4 +30,5 @@ const repositoryUrl = 'https://github.com/escolagratisdetecnologia/escolagratisd
     </p>
   </footer>
   <BottomNav current={tab} />
+  <script src="../scripts/sync.ts"></script>
 </Base>
```

Run: `pnpm exec vitest run --project web`
Expected: PASS.

- [ ] **Step 3: Conferir e fazer o commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build
pnpm --filter @egt/web check:csp
```

Expected: sem erros; `CSP OK`.

```bash
git add apps/web
git commit -m "feat(web): sincronização do progresso com a conta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Site: entrar, completar o cadastro, termos e privacidade

**Files:**
- Create: `apps/web/src/lib/sign-in.ts`, `apps/web/src/lib/sign-in.test.ts`, `apps/web/src/islands/Login.tsx`, `apps/web/src/islands/CompleteProfile.tsx`, `apps/web/src/components/LegalDraft.astro`, `apps/web/src/pages/entrar/index.astro`, `apps/web/src/pages/entrar/cadastro.astro`, `apps/web/src/pages/termos.astro`, `apps/web/src/pages/privacidade.astro`
- Modify: `apps/web/src/islands/registry.ts`, `apps/web/src/layouts/App.astro`, `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `api`, `syncAfterSignIn` (Task 11); `TERMS_VERSION` (`@egt/core`, Task 5); as rotas de login e da conta (Tasks 4 e 5).
- Produces:
  - `nextPath(search): string`, com a mesma regra da API e padrão `/eu/`.
  - `signUpUrl(next)` e `finishSignIn(profileComplete, next)`.
  - As ilhas `login` e `complete-profile`.
  - Os rótulos que o e2e usa: "Seu e-mail", "Receber código", "Código", "Entrar", "Entrar com Google", "Ano em que você nasceu", o checkbox dos termos e "Concluir cadastro".
  - O alerta de erro fica em `role="alert"`.

- [ ] **Step 1: Teste do caminho de volta**

`apps/web/src/lib/sign-in.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextPath, signUpUrl } from './sign-in.ts';

describe('nextPath', () => {
  it('keeps paths of this site', () => {
    expect(nextPath('?next=/cursos/crie-seu-site-com-ia/')).toBe('/cursos/crie-seu-site-com-ia/');
    expect(nextPath('?next=%2Feu%2F')).toBe('/eu/');
  });

  it('falls back to the Eu tab for anything else', () => {
    for (const search of [
      '',
      '?next=',
      '?next=//evil.example',
      '?next=https://evil.example',
      '?next=/eu/?x=1',
      '?next=/../x',
      `?next=/${'a'.repeat(200)}`,
    ]) {
      expect(nextPath(search)).toBe('/eu/');
    }
  });
});

describe('signUpUrl', () => {
  it('keeps where to go after sign-up', () => {
    expect(signUpUrl('/cursos/')).toBe('/entrar/cadastro/?next=%2Fcursos%2F');
  });
});
```

Run: `pnpm exec vitest run --project web`
Expected: FAIL (`./sign-in.ts` não existe).

- [ ] **Step 2: Fim do login**

`apps/web/src/lib/sign-in.ts`:

```ts
import { syncAfterSignIn } from './progress-sync.ts';

const HOME = '/eu/';
/** Same rule as the API: only paths of this site, never another host or a query. */
const SITE_PATH = /^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/;

/** Where to go after signing in: the `next` of the URL when it is a path of this site. */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get('next');
  return next !== null && next.length <= 200 && SITE_PATH.test(next) ? next : HOME;
}

export const signUpUrl = (next: string) => `/entrar/cadastro/?next=${encodeURIComponent(next)}`;

/**
 * After the code or Google: sign-up first when it is missing; then this device's progress goes
 * to the account (failures stay pending for the next page) and the learner moves on.
 */
export async function finishSignIn(profileComplete: boolean, next: string): Promise<void> {
  if (!profileComplete) {
    location.assign(signUpUrl(next));
    return;
  }
  await syncAfterSignIn();
  location.assign(next);
}
```

Run: `pnpm exec vitest run --project web`
Expected: PASS.

- [ ] **Step 3: Ilhas e páginas**

`apps/web/src/islands/Login.tsx`. A primeira renderização mostra o passo do e-mail; o `?next`, o `?erro=google` e o `?entrou=google` só são lidos no `useEffect`:

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../lib/api.ts';
import { finishSignIn, nextPath } from '../lib/sign-in.ts';

type Step = 'email' | 'code' | 'finishing';

const GOOGLE_ERROR = 'Não deu para entrar com o Google. Tente de novo ou use seu e-mail.';

/** Sign-in without a password: a code by e-mail, or Google (spec §5.1). */
export default function Login() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState('/eu/');
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const target = nextPath(location.search);
    setNext(target);
    if (params.get('erro') === 'google') setError(GOOGLE_ERROR);
    if (params.get('entrou') === 'google') {
      // Back from Google with a session: finish sign-in here.
      setStep('finishing');
      void api<{ profile: unknown }>('/api/me').then((res) => {
        if (res.ok) return finishSignIn(res.data.profile !== null, target);
        setStep('email');
        setError(GOOGLE_ERROR);
      });
    }
  }, []);
  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  const askForCode = async (event?: Event) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    const res = await api('/api/auth/email/start', {
      method: 'POST',
      body: { email: email.trim() },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setCode('');
    setStep('code');
  };

  const checkCode = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const res = await api<{ profileComplete: boolean }>('/api/auth/email/verify', {
      method: 'POST',
      body: { code: code.trim() },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    setStep('finishing');
    await finishSignIn(res.data.profileComplete, next);
  };

  return (
    <div class="login" data-step={step}>
      {step === 'email' && (
        <>
          <form class="form" onSubmit={askForCode}>
            <label for="login-email">Seu e-mail</label>
            <input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onInput={(event) => setEmail(event.currentTarget.value)}
            />
            <button type="submit" class="button button-block" disabled={busy}>
              Receber código
            </button>
          </form>
          <p class="or">ou</p>
          <a
            class="button button-secondary button-block"
            href={`/api/auth/google?next=${encodeURIComponent(next)}`}
          >
            Entrar com Google
          </a>
        </>
      )}
      {step === 'code' && (
        <>
          <p>
            Enviamos um código para <strong>{email.trim()}</strong>. Ele chega em até um minuto;
            confira também a caixa de spam.
          </p>
          <form class="form" onSubmit={checkCode}>
            <label for="login-code">Código</label>
            <input
              id="login-code"
              ref={codeInput}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              maxLength={8}
              required
              value={code}
              onInput={(event) => setCode(event.currentTarget.value)}
            />
            <button type="submit" class="button button-block" disabled={busy}>
              Entrar
            </button>
          </form>
          <div class="form-actions">
            <button
              type="button"
              class="button button-secondary"
              disabled={busy}
              onClick={() => void askForCode()}
            >
              Enviar outro código
            </button>
            <button
              type="button"
              class="button button-secondary"
              onClick={() => {
                setError('');
                setStep('email');
              }}
            >
              Usar outro e-mail
            </button>
          </div>
        </>
      )}
      {step === 'finishing' && <p class="status">Entrando e juntando seu progresso…</p>}
      <p class="form-error" role="alert">
        {error}
      </p>
    </div>
  );
}
```

`apps/web/src/islands/CompleteProfile.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api.ts';
import { finishSignIn, nextPath } from '../lib/sign-in.ts';

/** Last step of sign-up: birth year (under 12 cannot have an account) and the terms (spec §5.5). */
export default function CompleteProfile() {
  const [birthYear, setBirthYear] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    // Signed out, or sign-up already complete: nothing to do here.
    void api<{ profile: unknown }>('/api/me').then((res) => {
      const next = nextPath(location.search);
      if (!res.ok && res.status === 401)
        location.assign(`/entrar/?next=${encodeURIComponent(next)}`);
      if (res.ok && res.data.profile !== null) void finishSignIn(true, next);
    });
  }, []);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const res = await api('/api/me', {
      method: 'PATCH',
      body: { birthYear: Number(birthYear), acceptTerms: accepted },
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error.message);
      setRefused(res.error.code === 'too_young');
      return;
    }
    await finishSignIn(true, nextPath(location.search));
  };

  if (refused) {
    return (
      <div class="complete-profile">
        <p class="form-error" role="alert">
          {error}
        </p>
        <p>
          Você ainda pode ver as aulas sem conta. <a href="/cursos/">Ver os cursos</a>
        </p>
      </div>
    );
  }

  return (
    <div class="complete-profile">
      <form class="form" onSubmit={submit}>
        <label for="birth-year">Ano em que você nasceu</label>
        <p class="hint" id="birth-year-hint">
          Só o ano, por exemplo 2007. A Escola é para quem tem 12 anos ou mais.
        </p>
        <input
          id="birth-year"
          type="text"
          inputMode="numeric"
          autoComplete="bday-year"
          pattern="[0-9]{4}"
          maxLength={4}
          required
          aria-describedby="birth-year-hint"
          value={birthYear}
          onInput={(event) => setBirthYear(event.currentTarget.value)}
        />
        <label class="check">
          <input
            type="checkbox"
            required
            checked={accepted}
            onChange={(event) => setAccepted(event.currentTarget.checked)}
          />
          <span>
            Li e aceito os <a href="/termos/">termos de uso</a> e a{' '}
            <a href="/privacidade/">política de privacidade</a>.
          </span>
        </label>
        <button type="submit" class="button button-block" disabled={busy}>
          Concluir cadastro
        </button>
      </form>
      <p class="form-error" role="alert">
        {error}
      </p>
    </div>
  );
}
```

`apps/web/src/islands/registry.ts`:

```diff
--- a/apps/web/src/islands/registry.ts
+++ b/apps/web/src/islands/registry.ts
@@ -6,4 +6,6 @@ export const islands: IslandRegistry = {
   'course-progress': () => import('./CourseProgress.tsx'),
   'my-progress': () => import('./MyProgress.tsx'),
   quiz: () => import('./Quiz.tsx'),
+  login: () => import('./Login.tsx'),
+  'complete-profile': () => import('./CompleteProfile.tsx'),
 };
```

`apps/web/src/pages/entrar/index.astro`:

```astro
---
import Island from '../../components/Island.astro';
import Login from '../../islands/Login.tsx';
import App from '../../layouts/App.astro';
---

<App
  title="Entrar · Escola Grátis de Tecnologia"
  description="Entre na Escola Grátis de Tecnologia com seu e-mail ou com o Google, sem senha, e leve seu progresso para qualquer aparelho."
  tab="eu"
>
  <h1>Entrar</h1>
  <p class="lead">
    Sem senha: enviamos um código para o seu e-mail, ou você entra com o Google. Sua conta guarda o
    progresso em qualquer aparelho.
  </p>
  <Island name="login" component={Login} props={{}} />
</App>
```

`apps/web/src/pages/entrar/cadastro.astro`:

```astro
---
import Island from '../../components/Island.astro';
import CompleteProfile from '../../islands/CompleteProfile.tsx';
import App from '../../layouts/App.astro';
---

<App
  title="Complete seu cadastro · Escola Grátis de Tecnologia"
  description="Último passo para criar sua conta na Escola Grátis de Tecnologia."
  tab="eu"
>
  <h1>Complete seu cadastro</h1>
  <p class="lead">Falta pouco: só mais duas coisas para criar sua conta.</p>
  <Island name="complete-profile" component={CompleteProfile} props={{}} />
</App>
```

`apps/web/src/components/LegalDraft.astro`:

```astro
---
import { TERMS_VERSION } from '@egt/core';

const [year, month, day] = TERMS_VERSION.split('-');
---

<p class="draft-notice" role="note">
  <strong>Rascunho.</strong> Este texto ainda vai passar por revisão jurídica antes do lançamento
  público da Escola. Versão de {day}/{month}/{year}.
</p>
```

`apps/web/src/pages/privacidade.astro`, rascunho em linguagem simples a partir do spec §5.5:

```astro
---
import LegalDraft from '../components/LegalDraft.astro';
import App from '../layouts/App.astro';
---

<App
  title="Política de privacidade · Escola Grátis de Tecnologia"
  description="Quais dados a Escola Grátis de Tecnologia guarda, por quê, onde e como você baixa ou apaga tudo."
>
  <h1>Política de privacidade</h1>
  <LegalDraft />
  <div class="prose">
    <p>
      A Escola Grátis de Tecnologia é um projeto beneficente e de código aberto. Aqui explicamos,
      sem juridiquês, quais dados guardamos, por quê e como você controla tudo.
    </p>

    <h2>Quem cuida dos seus dados</h2>
    <p>
      A entidade responsável pelos dados (a controladora, na Lei Geral de Proteção de Dados) será
      informada aqui antes do lançamento público. Enquanto isso, você baixa e apaga seus dados
      sozinho, na aba <a href="/eu/">Eu</a>.
    </p>

    <h2>O que guardamos</h2>
    <ul>
      <li>
        <strong>Seu e-mail</strong>, para você entrar na conta.
      </li>
      <li>
        <strong>O ano em que você nasceu</strong>, só o ano, para cumprir a idade mínima.
      </li>
      <li>
        <strong>Seu progresso</strong>: as aulas que você concluiu e as perguntas que acertou.
      </li>
      <li>
        <strong>A versão destes textos que você aceitou</strong> e a data do aceite.
      </li>
    </ul>
    <p>
      Se você entra com o Google, ele só confirma o seu e-mail para a gente. Não recebemos sua senha
      nem acesso à sua conta do Google. Não pedimos CPF, endereço nem telefone.
    </p>
    <p>
      Quando os certificados chegarem, vamos pedir o número de celular para confirmar que cada
      certificado é de uma pessoa de verdade. Esta política muda antes disso.
    </p>

    <h2>O que não fazemos</h2>
    <ul>
      <li>Não vendemos nem emprestamos seus dados.</li>
      <li>Não temos anúncios, rastreadores de outras empresas nem perfis de comportamento.</li>
      <li>
        Só usamos os cookies necessários para manter você na sua conta. Nenhum deles serve para
        propaganda.
      </li>
    </ul>

    <h2>Por que podemos usar esses dados</h2>
    <ul>
      <li>
        Para entregar o que você pediu: a conta e os cursos (execução de contrato, art. 7º, V, da
        LGPD).
      </li>
      <li>
        Para proteger o site e as contas: registros técnicos sem e-mail e sem endereço IP (legítimo
        interesse, art. 7º, IX).
      </li>
      <li>Para cumprir a lei, como a regra de idade mínima.</li>
    </ul>

    <h2>Onde ficam</h2>
    <p>
      Na Amazon Web Services (AWS), na região de São Paulo, no Brasil. O login usa o Amazon Cognito,
      e os e-mails com código saem pelo Amazon SES. Se você entra com o Google, o Google também
      participa do login.
    </p>

    <h2>Por quanto tempo</h2>
    <p>
      Enquanto sua conta existir. Quando você exclui a conta, apagamos na hora o e-mail, o ano de
      nascimento e o progresso. As cópias de segurança automáticas do banco de dados somem sozinhas
      em até 35 dias. Os registros técnicos ficam 30 dias.
    </p>

    <h2>Seus direitos</h2>
    <ul>
      <li>
        <strong>Ver e baixar seus dados:</strong> na aba <a href="/eu/">Eu</a>, use “Baixar meus
        dados”.
      </li>
      <li>
        <strong>Apagar tudo:</strong> na aba <a href="/eu/">Eu</a>, use “Excluir conta”.
      </li>
      <li>
        <strong>Corrigir um dado:</strong> por enquanto, exclua a conta e crie de novo. Um canal de
        atendimento será publicado antes do lançamento.
      </li>
    </ul>

    <h2>Crianças e adolescentes</h2>
    <p>
      Quem tem menos de 12 anos não pode criar conta, mas pode ver as aulas sem conta. De 12 a 17
      anos, pode ter conta. A Escola não tem anúncios, perfis de comportamento nem recursos sociais,
      como pede o ECA Digital (Lei 15.211/2025).
    </p>

    <h2>Mudanças</h2>
    <p>
      Se esta política mudar, avisamos no site. Quando a mudança for importante, pedimos seu aceite
      de novo.
    </p>
  </div>
</App>
```

`apps/web/src/pages/termos.astro`:

```astro
---
import LegalDraft from '../components/LegalDraft.astro';
import App from '../layouts/App.astro';
---

<App
  title="Termos de uso · Escola Grátis de Tecnologia"
  description="As regras para usar a Escola Grátis de Tecnologia: gratuita, sem anúncios e com conteúdo livre."
>
  <h1>Termos de uso</h1>
  <LegalDraft />
  <div class="prose">
    <h2>O que é a Escola</h2>
    <p>
      Uma escola online, gratuita e beneficente, para aprender tecnologia resolvendo problemas
      reais. Os cursos nunca serão pagos e o site não tem anúncios.
    </p>

    <h2>Sua conta</h2>
    <ul>
      <li>É preciso ter 12 anos ou mais para criar uma conta.</li>
      <li>Uma conta por pessoa.</li>
      <li>
        Você entra com um código enviado ao seu e-mail ou com o Google. Cuide do acesso ao seu
        e-mail: quem abre o seu e-mail consegue entrar na sua conta.
      </li>
      <li>
        Você pode excluir sua conta quando quiser, na aba <a href="/eu/">Eu</a>.
      </li>
    </ul>

    <h2>Como usar</h2>
    <ul>
      <li>Use a Escola para aprender, com respeito a quem estuda e a quem faz a Escola.</li>
      <li>
        Não tente atrapalhar o site, entrar na conta de outra pessoa ou usar robôs que
        sobrecarreguem o serviço.
      </li>
      <li>Não use a Escola para nada ilegal.</li>
    </ul>
    <p>Podemos suspender contas que desrespeitem estas regras.</p>

    <h2>Conteúdo livre</h2>
    <p>
      As aulas usam a licença Creative Commons BY-SA 4.0: você pode compartilhar e adaptar, dando
      crédito à Escola e mantendo a mesma licença. O código do site é aberto, sob a licença
      AGPL-3.0. O nome e a marca da Escola não estão incluídos nessas licenças.
    </p>

    <h2>Sem garantias</h2>
    <p>
      Fazemos o melhor, mas o site pode ficar fora do ar ou ter erros, e as aulas são educativas.
      Use o que aprender com cuidado e por sua conta.
    </p>

    <h2>Mudanças</h2>
    <p>
      Se estes termos mudarem, avisamos no site. Quando a mudança for importante, pedimos seu aceite
      de novo.
    </p>

    <h2>Lei aplicável</h2>
    <p>Estes termos seguem as leis do Brasil.</p>
  </div>
</App>
```

O rodapé (`apps/web/src/layouts/App.astro`) ganha os links:

```diff
--- a/apps/web/src/layouts/App.astro
+++ b/apps/web/src/layouts/App.astro
@@ -28,6 +28,9 @@ const repositoryUrl = 'https://github.com/escolagratisdetecnologia/escolagratisd
       Projeto beneficente e de código aberto.
       <a href={repositoryUrl}>Veja o código no GitHub</a>.
     </p>
+    <p>
+      <a href="/termos/">Termos de uso</a> · <a href="/privacidade/">Privacidade</a>
+    </p>
   </footer>
   <BottomNav current={tab} />
   <script src="../scripts/sync.ts"></script>
```

`apps/web/src/styles/global.css` ganha, no fim, os estilos dos formulários. Os alvos têm no mínimo `--tap`, e o aviso de rascunho usa a cor de destaque, nunca o amarelo:

```diff
--- a/apps/web/src/styles/global.css
+++ b/apps/web/src/styles/global.css
@@ -815,3 +815,80 @@ progress::-moz-progress-bar {
   stroke-linecap: round;
   stroke-linejoin: round;
 }
+
+/* Sign-in, sign-up and the account */
+
+.form {
+  display: grid;
+  gap: var(--space-2);
+}
+
+.form > label {
+  font-weight: 700;
+}
+
+.form input[type='email'],
+.form input[type='text'] {
+  min-height: var(--tap);
+  padding: 0 var(--space-3);
+  border: 2px solid var(--color-line);
+  border-radius: var(--radius-small);
+  background: var(--color-bg);
+  color: var(--color-fg);
+  font: inherit;
+}
+
+.form input[type='email']:focus-visible,
+.form input[type='text']:focus-visible {
+  border-color: var(--color-accent);
+}
+
+.form .button {
+  margin-top: var(--space-2);
+}
+
+.check {
+  display: flex;
+  align-items: center;
+  gap: var(--space-2);
+  min-height: var(--tap);
+}
+
+.check input {
+  flex: none;
+  width: 1.25rem;
+  height: 1.25rem;
+  accent-color: var(--color-accent);
+}
+
+.hint {
+  margin: 0;
+  color: var(--color-muted);
+  font-size: 0.9375rem;
+}
+
+.or {
+  margin: var(--space-3) 0;
+  color: var(--color-muted);
+  text-align: center;
+}
+
+.form-actions {
+  display: flex;
+  flex-wrap: wrap;
+  gap: var(--space-2);
+  margin-top: var(--space-3);
+}
+
+.form-error {
+  min-height: 1.6em;
+  color: var(--color-danger);
+  font-weight: 700;
+}
+
+.draft-notice {
+  padding: var(--space-3);
+  border: 2px solid var(--color-accent);
+  border-radius: var(--radius);
+  background: var(--color-surface);
+}
```

- [ ] **Step 4: Conferir e fazer o commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build
pnpm --filter @egt/web check:csp
```

Expected: sem erros; `CSP OK`, agora com `/entrar/`, `/entrar/cadastro/`, `/termos/` e `/privacidade/`.

```bash
git add apps/web
git commit -m "feat(web): páginas de entrar e de cadastro, com rascunhos de termos e privacidade" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Site: a conta na aba Eu

A seção "Sua conta" deixa de ser um aviso e vira a ilha `account`:
- **Sem sessão:** botão "Entrar".
- **Cadastro incompleto:** "Completar cadastro".
- **Logado:**
  - o e-mail;
  - "Baixar meus dados", que monta o JSON a partir de `/api/me/export` via `api()`, para renovar a sessão se preciso;
  - "Sair";
  - "Excluir conta", com confirmação.

Sair e excluir apagam o progresso do aparelho e voltam para `/eu/?conta=saiu` ou `/eu/?conta=excluida`, com um aviso. Os estados têm a mesma altura reservada, para a página não pular.

**Files:**
- Create: `apps/web/src/islands/Account.tsx`
- Modify: `apps/web/src/islands/registry.ts`, `apps/web/src/pages/eu.astro`, `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `api`, `hasSession`, `forgetProgress` (Task 11).
- Produces:
  - A ilha `account`.
  - Os rótulos "Baixar meus dados", "Sair", "Excluir conta" e "Excluir minha conta".
  - Os avisos "Você saiu da conta. O progresso continua salvo nela." e "Sua conta foi excluída e apagamos os seus dados.".

- [ ] **Step 1: Implementar**

`apps/web/src/islands/Account.tsx`:

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../lib/api.ts';
import { forgetProgress } from '../lib/progress-sync.ts';
import { hasSession } from '../lib/session.ts';

type State =
  | { kind: 'signed-out'; notice?: string }
  | { kind: 'loading' }
  | { kind: 'incomplete' }
  | { kind: 'signed-in'; email: string };

const NOTICES: Record<string, string> = {
  saiu: 'Você saiu da conta. O progresso continua salvo nela.',
  excluida: 'Sua conta foi excluída e apagamos os seus dados.',
};

/** Eu tab: sign in, or the account with data export, logout and deletion (spec §5.5). */
export default function Account() {
  const [state, setState] = useState<State>({ kind: 'signed-out' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const notice = NOTICES[new URLSearchParams(location.search).get('conta') ?? ''];
    if (!hasSession()) {
      setState({ kind: 'signed-out', ...(notice === undefined ? {} : { notice }) });
      return;
    }
    setState({ kind: 'loading' });
    void api<{ email: string; profile: unknown }>('/api/me').then((res) => {
      if (!res.ok) setState({ kind: 'signed-out' });
      else if (res.data.profile === null) setState({ kind: 'incomplete' });
      else setState({ kind: 'signed-in', email: res.data.email });
    });
  }, []);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const leave = (notice: 'saiu' | 'excluida') => {
    forgetProgress();
    location.assign(`/eu/?conta=${notice}`);
  };

  const signOut = async () => {
    setBusy(true);
    await api('/api/auth/logout', { method: 'POST' });
    leave('saiu');
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError('');
    const res = await api('/api/me', { method: 'DELETE' });
    if (!res.ok) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    leave('excluida');
  };

  const download = async () => {
    setError('');
    const res = await api<unknown>('/api/me/export');
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meus-dados-escola-gratis.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section class="card account" aria-labelledby="conta-titulo">
      <h2 id="conta-titulo">Sua conta</h2>
      {state.kind === 'signed-out' && (
        <>
          <p class="account-note">
            {state.notice ??
              'Entre para guardar seu progresso na sua conta e continuar em qualquer aparelho.'}
          </p>
          <a class="button button-block" href="/entrar/?next=%2Feu%2F">
            Entrar
          </a>
        </>
      )}
      {state.kind === 'loading' && <p class="account-note">Carregando sua conta…</p>}
      {state.kind === 'incomplete' && (
        <>
          <p class="account-note">Falta um passo para terminar de criar sua conta.</p>
          <a class="button button-block" href="/entrar/cadastro/?next=%2Feu%2F">
            Completar cadastro
          </a>
        </>
      )}
      {state.kind === 'signed-in' && (
        <>
          <p class="account-note">
            Você entrou como <strong>{state.email}</strong>. Seu progresso fica salvo na conta.
          </p>
          <div class="form-actions">
            <button type="button" class="button button-secondary" onClick={() => void download()}>
              Baixar meus dados
            </button>
            <button
              type="button"
              class="button button-secondary"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sair
            </button>
          </div>
          {!confirming && (
            <button
              type="button"
              class="button button-secondary account-delete"
              onClick={() => setConfirming(true)}
            >
              Excluir conta
            </button>
          )}
          {confirming && (
            <div class="confirm" role="group" aria-labelledby="excluir-pergunta">
              <p id="excluir-pergunta">
                Isso apaga sua conta, seu e-mail, seu ano de nascimento e seu progresso. Não dá para
                desfazer. Quer mesmo excluir?
              </p>
              <div class="confirm-actions">
                <button
                  type="button"
                  class="button button-danger"
                  ref={confirmButton}
                  disabled={busy}
                  onClick={() => void deleteAccount()}
                >
                  Excluir minha conta
                </button>
                <button
                  type="button"
                  class="button button-secondary"
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <p class="form-error" role="alert">
        {error}
      </p>
    </section>
  );
}
```

`apps/web/src/islands/registry.ts`:

```diff
--- a/apps/web/src/islands/registry.ts
+++ b/apps/web/src/islands/registry.ts
@@ -8,4 +8,5 @@ export const islands: IslandRegistry = {
   quiz: () => import('./Quiz.tsx'),
   login: () => import('./Login.tsx'),
   'complete-profile': () => import('./CompleteProfile.tsx'),
+  account: () => import('./Account.tsx'),
 };
```

`apps/web/src/pages/eu.astro`:

```astro
---
import InstallPrompt from '../components/InstallPrompt.astro';
import Island from '../components/Island.astro';
import Account from '../islands/Account.tsx';
import MyProgress from '../islands/MyProgress.tsx';
import App from '../layouts/App.astro';
import { getCourses } from '../lib/catalog.ts';
import { outlineOf } from '../lib/urls.ts';

const outlines = (await getCourses()).map(outlineOf);
---

<App
  title="Eu · Escola Grátis de Tecnologia"
  description="Sua conta e seu progresso nos cursos da Escola Grátis de Tecnologia."
  tab="eu"
>
  <h1>Eu</h1>
  <Island name="my-progress" component={MyProgress} props={{ outlines }} />
  <Island name="account" component={Account} props={{}} />
  <InstallPrompt />
</App>
```

`apps/web/src/styles/global.css`:

```diff
--- a/apps/web/src/styles/global.css
+++ b/apps/web/src/styles/global.css
@@ -782,7 +782,7 @@ progress::-moz-progress-bar {
   min-height: calc(2 * 1.6em);
 }
 
-[data-island='my-progress'] ~ .card {
+[data-island='my-progress'] ~ [data-island='account'] {
   margin-top: var(--space-5);
 }
 
@@ -892,3 +892,12 @@ progress::-moz-progress-bar {
   border-radius: var(--radius);
   background: var(--color-surface);
 }
+
+.account-note {
+  /* two lines reserved: every account state has the same height */
+  min-height: calc(2 * 1.6em);
+}
+
+.account-delete {
+  margin-top: var(--space-3);
+}
```

- [ ] **Step 2: Conferir e fazer o commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build
pnpm --filter @egt/web check:csp
```

Expected: sem erros. O comportamento da ilha é coberto pelo e2e da Task 14.

```bash
git add apps/web
git commit -m "feat(web): conta na aba Eu (entrar, baixar dados, sair e excluir)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: e2e das contas, serviços na CI e Lighthouse das páginas novas

O Playwright passa a subir também a API local, com `SITE_ORIGIN=http://localhost:4322`; o `astro preview` encaminha `/api` para ela. Os testes de login leem o código no Mailpit e apagam cada mensagem lida, para o próximo código não confundir. O Google é o de mentira. Sem `pnpm db:up`, esses testes são pulados localmente; na CI, rodam sempre.

**Files:**
- Create: `apps/web/e2e/support/accounts.ts`, `apps/web/e2e/account.spec.ts`
- Modify: `apps/web/playwright.config.ts`, `apps/web/lighthouserc.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: as páginas e ilhas das Tasks 12 e 13, o servidor local da Task 7.
- Produces: `newEmail()`, `needsLocalServices()`, `codeFor(email)`, `signInWithEmail(page, email, next?)` e `completeSignUp(page, birthYear?)`.

- [ ] **Step 1: Configuração do Playwright**

`apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: [
    {
      // The local API (login with Mailpit and the fake Google from `pnpm db:up`); the preview
      // below forwards /api to it, like CloudFront does in AWS.
      command: 'node ../api/src/server.ts',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      env: { APP_ENV: 'local', PORT: '3001', SITE_ORIGIN: 'http://localhost:4322' },
    },
    {
      // Astro 7 auto-backgrounds `astro preview` when it detects an AI agent; `--ignore-lock` keeps it in the foreground so Playwright owns the process.
      command: 'pnpm preview --port 4322 --ignore-lock',
      url: 'http://localhost:4322',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

- [ ] **Step 2: Testes**

`apps/web/e2e/support/accounts.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const MAILPIT = 'http://localhost:8025';

/** A new e-mail per test: tests run in parallel against the same API. */
export const newEmail = () => `aluno-${randomUUID()}@example.com`;

/**
 * Login tests need Mailpit and the fake Google (`pnpm db:up`). Locally they are skipped without
 * them; in the CI, the services always run.
 */
export function needsLocalServices(): void {
  test.beforeAll(async () => {
    const up = await fetch(`${MAILPIT}/api/v1/info`).then(
      (res) => res.ok,
      () => false,
    );
    test.skip(!up && !process.env.CI, 'Rode pnpm db:up para testar o login.');
  });
}

/**
 * The code sent to the e-mail, read from Mailpit. The message is deleted after reading, so the
 * next call waits for a new code instead of returning this one again.
 */
export async function codeFor(email: string): Promise<string> {
  let found: { ID: string; code: string } | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
        );
        const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
        const message = messages[0];
        const code = /(\d{6})/.exec(message?.Subject ?? '')?.[1];
        found = message && code ? { ID: message.ID, code } : undefined;
        return found;
      },
      { timeout: 10_000 },
    )
    .toBeDefined();
  if (!found) throw new Error(`No code for ${email}`);
  await fetch(`${MAILPIT}/api/v1/messages`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ IDs: [found.ID] }),
  });
  return found.code;
}

/** Signs in with an e-mail code, from the sign-in page. */
export async function signInWithEmail(page: Page, email: string, next = '/eu/'): Promise<void> {
  await page.goto(`/entrar/?next=${encodeURIComponent(next)}`);
  await expect(page.locator('[data-island="login"]')).toHaveAttribute('data-hydrated', 'true');
  await page.getByLabel('Seu e-mail').fill(email);
  await page.getByRole('button', { name: 'Receber código' }).click();
  await page.getByLabel('Código').fill(await codeFor(email));
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

/** The last step of sign-up, for someone born in `birthYear`. */
export async function completeSignUp(page: Page, birthYear = '2000'): Promise<void> {
  await expect(page).toHaveURL(/\/entrar\/cadastro\//);
  await expect(page.locator('[data-island="complete-profile"]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.getByLabel('Ano em que você nasceu').fill(birthYear);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Concluir cadastro' }).click();
}
```

`apps/web/e2e/account.spec.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { lessonUrl, lessonsOf } from '../src/lib/urls.ts';
import {
  codeFor,
  completeSignUp,
  needsLocalServices,
  newEmail,
  signInWithEmail,
} from './support/accounts.ts';
import { expectNoA11yViolations } from './support/axe.ts';
import { pilotCourse } from './support/catalog.ts';

needsLocalServices();

test('a new learner signs up with a code and takes the device progress along', async ({
  page,
  browser,
}) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);
  await page.goto(lessonUrl(course, lessons[0]!));
  await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('link', { name: 'Concluir e continuar' }).click();
  await expect(page).toHaveURL(lessonUrl(course, lessons[1]!));
  const email = newEmail();

  await signInWithEmail(page, email);
  await completeSignUp(page);

  await expect(page).toHaveURL('/eu/');
  await expect(page.getByText(`Você entrou como ${email}.`)).toBeVisible();
  await expect(page.getByText(`1 de ${lessons.length} aulas concluídas`)).toBeVisible();

  // Another device: the progress comes from the account.
  const other = await browser.newPage();
  await signInWithEmail(other, email);
  await expect(other).toHaveURL('/eu/');
  await expect(other.getByText(`1 de ${lessons.length} aulas concluídas`)).toBeVisible();
  await other.close();
});

test('a wrong code asks to check the e-mail', async ({ page }) => {
  const email = newEmail();
  await page.goto('/entrar/');
  await expect(page.locator('[data-island="login"]')).toHaveAttribute('data-hydrated', 'true');
  await page.getByLabel('Seu e-mail').fill(email);
  await page.getByRole('button', { name: 'Receber código' }).click();
  const code = await codeFor(email);

  await page.getByLabel('Código').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'Código incorreto ou vencido. Confira o e-mail ou peça um novo código.',
  );
});

test('nobody who may be under 12 gets an account', async ({ page }) => {
  await signInWithEmail(page, newEmail());

  await completeSignUp(page, '2014');

  await expect(page.getByRole('alert')).toContainText('a Escola é para quem nasceu até 2013');
  await expect(page.getByRole('link', { name: 'Ver os cursos' })).toBeVisible();
});

test('signs in with Google', async ({ page }) => {
  const email = newEmail();
  await page.goto('/entrar/');
  await expect(page.locator('[data-island="login"]')).toHaveAttribute('data-hydrated', 'true');

  await page.getByRole('link', { name: 'Entrar com Google' }).click();
  // mock-oauth2-server's login page: the e-mail goes in as the user.
  await page.locator('input[name="username"]').fill(email);
  await page.getByRole('button', { name: 'Sign-in' }).click();
  await completeSignUp(page);

  await expect(page).toHaveURL('/eu/');
  await expect(page.getByText(`Você entrou como ${email}.`)).toBeVisible();
});

test('signing out leaves nothing on the device', async ({ page }) => {
  await signInWithEmail(page, newEmail());
  await completeSignUp(page);
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();

  await expect(page).toHaveURL('/eu/?conta=saiu');
  await expect(
    page.getByText('Você saiu da conta. O progresso continua salvo nela.'),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain('egt:progress:v1');
});

test('the learner downloads everything the school keeps', async ({ page }) => {
  const email = newEmail();
  await signInWithEmail(page, email);
  await completeSignUp(page);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar meus dados' }).click();
  const file = await download;

  expect(file.suggestedFilename()).toBe('meus-dados-escola-gratis.json');
  const data = JSON.parse(await readFile(await file.path(), 'utf8')) as {
    account: { email: string };
    profile: { birthYear: number };
  };
  expect(data.account.email).toBe(email);
  expect(data.profile.birthYear).toBe(2000);
});

test('deleting the account erases it', async ({ page }) => {
  const email = newEmail();
  await signInWithEmail(page, email);
  await completeSignUp(page);

  await page.getByRole('button', { name: 'Excluir conta' }).click();
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();

  await expect(page).toHaveURL('/eu/?conta=excluida');
  await expect(page.getByText('Sua conta foi excluída e apagamos os seus dados.')).toBeVisible();
  // The same e-mail starts from scratch.
  await signInWithEmail(page, email);
  await expect(page).toHaveURL(/\/entrar\/cadastro\//);
});

test('the account pages have no accessibility violations', async ({ page }) => {
  for (const path of ['/entrar/', '/termos/', '/privacidade/']) {
    await page.goto(path);
    await expectNoA11yViolations(page);
  }
  const email = newEmail();
  await page.goto('/entrar/');
  await expect(page.locator('[data-island="login"]')).toHaveAttribute('data-hydrated', 'true');
  await page.getByLabel('Seu e-mail').fill(email);
  await page.getByRole('button', { name: 'Receber código' }).click();
  await expect(page.getByLabel('Código')).toBeFocused();
  await expectNoA11yViolations(page);

  await page.getByLabel('Código').fill(await codeFor(email));
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('[data-island="complete-profile"]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expectNoA11yViolations(page);
  await completeSignUp(page);
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await expectNoA11yViolations(page);
});
```

Run:

```bash
pnpm db:up
SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build
pnpm --filter @egt/web test:e2e
```

Expected: todos passam, nos dois aparelhos (Pixel 7 e iPhone 14). Os testes de conta são 16, e os pulados de antes continuam pulados. Rode duas vezes para conferir que não há corrida.

- [ ] **Step 3: CI e Lighthouse**

`.github/workflows/ci.yml` ganha o Mailpit e o Google de mentira como serviços. Como o mock não tem healthcheck, a CI espera por ele antes do e2e:

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -16,11 +16,20 @@ jobs:
   verify:
     runs-on: ubuntu-latest
     services:
-      # Same image as docker-compose.yml: repository and route integration tests.
+      # Same images as docker-compose.yml: repository and route integration tests, and the
+      # e2e sign-in (codes in Mailpit, fake Google).
       dynamodb:
         image: amazon/dynamodb-local:3.3.1@sha256:ff89bd48ff32cd8d9be5fee8873b65b8854dc408f1afe881be6eb00247bc0dab
         ports:
           - 8000:8000
+      mailpit:
+        image: axllent/mailpit:v1.31.2@sha256:74d609a42ec279aa63c6b4622a6fa9b5408d1ad5b1d76a1c4be40a265ce0863d
+        ports:
+          - 8025:8025
+      google:
+        image: ghcr.io/navikt/mock-oauth2-server:6.0.3@sha256:250e04413e2fc7877d4cb38ecd74d3ecb1a40aae3a9bdad96d1c593e59fee95e
+        ports:
+          - 8080:8080
     steps:
       - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
       - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6
@@ -42,6 +51,8 @@ jobs:
           SITE_URL: https://escolagratisdetecnologia.com.br
       - run: pnpm --filter @egt/web check:csp
       - run: pnpm --filter @egt/web exec playwright install --with-deps chromium webkit
+      # The fake Google has no healthcheck: wait for it before the sign-in tests.
+      - run: curl -fsS --retry 30 --retry-delay 1 --retry-all-errors http://localhost:8080/google/.well-known/openid-configuration > /dev/null
       - run: pnpm --filter @egt/web test:e2e
       - run: pnpm --filter @egt/web lighthouse
       - name: Build de prod (sem rascunhos) e guardas
```

`apps/web/lighthouserc.json` mede também `/entrar/` e `/privacidade/`:

```diff
--- a/apps/web/lighthouserc.json
+++ b/apps/web/lighthouserc.json
@@ -9,7 +9,9 @@
         "/cursos/crie-seu-site-com-ia/index.html",
         "/cursos/crie-seu-site-com-ia/deixe-as-ferramentas-a-mao/index.html",
         "/cursos/crie-seu-site-com-ia/projeto/index.html",
-        "/eu/index.html"
+        "/eu/index.html",
+        "/entrar/index.html",
+        "/privacidade/index.html"
       ],
       "numberOfRuns": 3
     },
```

Run, localmente, com o Chrome do Playwright:

```bash
CHROME_PATH="$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome | tail -1)" \
  pnpm --filter @egt/web exec lhci autorun --collect.numberOfRuns=1
```

Expected: `Done running autorun.` sem asserções falhando (9 páginas). No WSL, o Chrome deixa pastas `C:\Users\…\lighthouse.*` dentro de `apps/web`: apague-as, senão o `pnpm lint` falha.

- [ ] **Step 4: Conferir e fazer o commit**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: sem erros.

```bash
git add apps/web .github/workflows/ci.yml
git commit -m "test(web): e2e das contas com Mailpit e Google de mentira" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Documentação da Fase 1C

**Files:**
- Create: `docs/adr/0024-contas-de-alunos.md`, `docs/runbooks/contas.md`
- Modify: `docs/adr/README.md`, `docs/adr/0007-cognito.md`, `docs/arquitetura/well-architected.md`, `docs/runbooks/deploy.md`, `docs/runbooks/remover-projeto.md`, `docs/runbooks/configurar-github.md`, `docs/runbooks/cloudfront-flat-rate.md`, `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`
- Modify: `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `infra/CLAUDE.md`, `content/CLAUDE.md`, `README.md`

- [ ] **Step 1: Decisão e runbook**

`docs/adr/0024-contas-de-alunos.md`:

```md
# 0024. Contas de alunos: Cognito sem senha atrás da API

- Status: aceita
- Data: 2026-10-10
- Decisão do spec: D7 e D8 (detalha)

## Contexto

A Fase 1C liga o login de verdade (spec §5): código por e-mail e Google no pool Essentials, telas próprias e sessão em cookies HttpOnly. Ao detalhar, apareceram restrições do Cognito:

- O login sem senha por código (`EMAIL_OTP`) exige o plano Essentials, envio pelo SES (`DEVELOPER`, na mesma região do pool) e um domínio do pool, mesmo sem usar as páginas do Cognito. Enquanto a conta estiver no sandbox do SES, só endereços verificados recebem e-mail.
- Com a proteção contra enumeração de usuários ligada, o Cognito responde um desafio falso para e-mail sem conta, e o `SignUp` recusa e-mail que já tem conta: quem decide entre cadastro e login é a API.
- O código do cadastro tem 6 dígitos; o do login, 8.
- O primeiro login com Google de quem já tem conta por e-mail só é vinculado num gatilho de pré-cadastro, e esse primeiro login falha por desenho: o Cognito só entra na conta vinculada na tentativa seguinte. Quem entra primeiro pelo Google e depois por e-mail ficaria com duas contas.
- A rotação do refresh token não convive com o fluxo `REFRESH_TOKEN_AUTH`.
- O Cognito não roda localmente.

## Decisão

- **Uma conta por aluno, sempre por e-mail.** Todo aluno é um usuário nativo do pool: o e-mail é o login e o `sub` identifica o aluno nos dados. O gatilho de pré-cadastro vincula o primeiro login com Google ao usuário com o mesmo e-mail. Se esse usuário não existe, o gatilho o cria, sem senha e com o e-mail já verificado. Em seguida, falha de propósito (`ACCOUNT_LINKED`), e a API refaz o login com Google uma vez, sozinha, em `/api/auth/callback`. Só e-mails confirmados pelo Google (`email_verified`) são vinculados.
- **Código por e-mail pela API (BFF).** `POST /api/auth/email/start` tenta o `SignUp` sem senha. Se o e-mail já tem conta, pede o código de login (`AdminInitiateAuth` com `USER_AUTH` e `EMAIL_OTP`). A resposta é a mesma nos dois casos. O estado do passo seguinte fica num cookie HttpOnly (`egt_login`, 15 minutos). Os e-mails com código saem em pt-BR, escritos pelo gatilho de mensagem.
- **Sessão em cookies** (spec §5.2):
  - `egt_at`: access token, `Path=/api`, 1 hora.
  - `egt_rt`: refresh token, `Path=/api/auth`, 30 dias, com rotação (`GetTokensFromRefreshToken`).
  - `egt_hint`: legível pelo site, só diz que há sessão.

  Todos são `Secure` e `SameSite=Lax`, e só o `egt_hint` não é `HttpOnly`. Nenhum tem `Domain`, então `www` e o `.com` não recebem a sessão: eles só redirecionam para o domínio principal. A API ainda responde nesses nomes, mas sem sessão e, nas mudanças, com o `Origin` errado (ADR 0022).

- **Cadastro completo antes dos dados de estudo.** Depois do primeiro login, o aluno informa o ano de nascimento e aceita os termos (`PATCH /api/me`).
  - Só entra quem nasceu até `ano atual − 13`. Com só o ano, alguém nascido em `ano atual − 12` ainda pode ter 11 anos (regra conservadora, decisão do mantenedor).
  - Abaixo disso, a conta recém-criada é apagada.
  - As rotas de progresso respondem 409 até o cadastro ficar completo.
- **Progresso limitado ao catálogo.** O build da API embute as aulas e o número de perguntas de cada curso de `content/`. A API só guarda o que esse catálogo conhece, o que limita o tamanho dos dados por aluno.
- **Autoatendimento da LGPD:** `GET /api/me/export` (JSON) e `DELETE /api/me` (progresso, perfil e usuário do Cognito, com o Google desvinculado antes).
- **Domínio de login e limite do WAF.** O domínio de login é `auth.<domínio>`, com certificado em us-east-1 no módulo `edge`. O WAF tem um limite próprio para `/api/auth/*`: 50 requisições por IP a cada 5 minutos, com 429 em JSON.
- **Ambiente local:**
  - Um provedor no próprio processo da API faz o papel do Cognito: códigos no Mailpit e no terminal, tokens assinados com uma chave em memória.
  - O mock-oauth2-server faz o papel do Google (`pnpm db:up`).
  - O servidor local se recusa a rodar fora de `APP_ENV=local`.
- **Ao sair**, o site apaga o progresso do aparelho, e ele continua na conta (decisão do mantenedor, pensando em celulares compartilhados).

## Alternativas consideradas

- Usuários federados separados, unidos pelo e-mail numa tabela de vínculos no nosso banco: mais uma leitura por requisição e mais dados para apagar.
- Páginas do Cognito (managed login): tiram as telas do nosso controle (pt-BR, tom, acessibilidade) e põem outro domínio no fluxo do e-mail.
- Ano e mês de nascimento: bloqueio exato, ao custo de mais um dado pessoal.
- Refresh token sem rotação (`REFRESH_TOKEN_AUTH`): exige o nome do usuário a cada renovação, e a AWS recomenda a rotação.

## Consequências

- Positivas: um aluno, um `sub`, qualquer que seja a forma de entrar. Os tokens nunca chegam ao JavaScript. O login é testável de ponta a ponta localmente e na CI, sem AWS.
- Negativas:
  - O primeiro login com Google de quem já tem conta faz uma ida extra ao Google, automática.
  - O SES precisa sair do sandbox antes do lançamento (portão do spec §20). Até lá, em cada conta, só e-mails verificados no SES recebem código.
  - Alguns comportamentos só a AWS mostra: o código de 8 dígitos, o e-mail em pt-BR no login e a conta criada pelo gatilho entrando com código. Eles são conferidos no dev depois do deploy (`docs/runbooks/contas.md`).
  - Renomear uma aula interrompe o progresso dela: o antigo continua guardado, mas some das telas.
  - Um access token continua válido até expirar (1 hora) depois do logout. Na exclusão da conta, as rotas de dados exigem o perfil, que já foi apagado, então o token antigo não lê nem grava nada.

## Pilares Well-Architected

Segurança (serviço gerenciado, tokens só em cookies HttpOnly, limite do WAF no login, menor privilégio), confiabilidade (cada passo do login testado com fakes, nos testes e no e2e) e custo (Essentials gratuito até 10 mil MAU; SES pago por e-mail enviado).

## Revisar quando

O Cognito passar a vincular contas sem a falha do primeiro login, o projeto chegar a 30 mil MAU (ADR 0007) ou a revisão jurídica pedir outra regra de idade.
```

`docs/runbooks/contas.md`:

```md
# Contas de alunos (Cognito, Google e e-mail)

Como preparar, conferir e operar o login dos alunos (ADR 0024).

## Antes do primeiro deploy da Fase 1C

Faça uma vez, antes de abrir o PR da Fase 1C: o plano Terraform do PR já precisa dos valores do Google.

### 1. Clientes OAuth do Google

1. Em https://console.cloud.google.com, crie o projeto `Escola Gratis de Tecnologia` (um projeto serve aos dois ambientes).
2. Google Auth Platform → **Branding**: nome do app `Escola Grátis de Tecnologia`, e-mail de suporte e domínios autorizados `escolagratisdetecnologia.com.br` e `escolagratisdetecnologia.com`.
3. **Audience**: tipo **External**, depois **Publish app**. Em "Testing", só os usuários de teste conseguem entrar. Os escopos usados (`openid`, `email` e `profile`) não exigem a verificação do app; a verificação da tela de consentimento é um portão do lançamento (spec §20).
4. **Clients** → **Create client** → **Web application**, um por ambiente, cada um com uma única URI de redirecionamento autorizada:

   | Cliente    | URI de redirecionamento autorizada                                 |
   | ---------- | ------------------------------------------------------------------ |
   | `egt-dev`  | `https://auth.dev.escolagratisdetecnologia.com/oauth2/idpresponse` |
   | `egt-prod` | `https://auth.escolagratisdetecnologia.com.br/oauth2/idpresponse`  |

5. Guarde o **Client ID** e o **Client secret** de cada um.

### 2. Valores no GitHub

Settings → Secrets and variables → Actions (no repositório, não nos environments, porque o plano dos PRs roda sem environment):

| Tipo     | Nome                        | Valor                           |
| -------- | --------------------------- | ------------------------------- |
| Variable | `GOOGLE_CLIENT_ID_DEV`      | Client ID do cliente `egt-dev`  |
| Variable | `GOOGLE_CLIENT_ID_PROD`     | Client ID do cliente `egt-prod` |
| Secret   | `GOOGLE_CLIENT_SECRET_DEV`  | Client secret do `egt-dev`      |
| Secret   | `GOOGLE_CLIENT_SECRET_PROD` | Client secret do `egt-prod`     |

O Client ID aparece no navegador durante o login, então pode ser Variable. O secret, nunca.

### 3. E-mail (SES) no sandbox

Contas novas da AWS ficam no sandbox do SES: só endereços verificados recebem e-mail (até 200 por dia). O deploy cria sozinho a identidade do domínio (DKIM, MAIL FROM `bounce.<domínio>` e DMARC). Para testar o código por e-mail antes do lançamento, verifique o seu endereço em cada conta:

1. Console da conta `egt-dev` (depois `egt-prod`), região **São Paulo (sa-east-1)** → Amazon SES → **Identities** → **Create identity** → **Email address**.
2. Abra o e-mail da AWS e clique no link de confirmação.

Antes do lançamento público (spec §20), peça a saída do sandbox na conta de prod: SES → **Account dashboard** → **Request production access** → tipo **Transactional**, site `https://escolagratisdetecnologia.com.br`, e a descrição "Códigos de login de uma escola online gratuita, enviados só para quem pede na tela de entrar". A AWS responde em até 24 horas. O login com Google funciona mesmo no sandbox.

## Depois do deploy: conferir no dev

Alguns comportamentos só a AWS mostra (ADR 0024). Depois do primeiro deploy, confira em https://dev.escolagratisdetecnologia.com, com um e-mail verificado no SES do dev:

1. **E-mail novo:** chega um código de 6 dígitos, com o e-mail em português. Depois do código, a página pede o ano de nascimento e o aceite dos termos, e a aba Eu mostra o seu e-mail.
2. **Login de novo:** saia e entre com o mesmo e-mail. Desta vez chega um código de 8 dígitos.
3. **Google com o mesmo e-mail:** entre com o Google usando a conta desse e-mail. Você volta logado na mesma conta, com o mesmo progresso. Na primeira vez, o navegador vai ao Google duas vezes seguidas, sozinho.
4. **Google primeiro:** com outro e-mail, entre primeiro pelo Google e complete o cadastro. Saia e entre pelo código no e-mail. Deve ser a mesma conta (a aba Eu não pede cadastro de novo).
5. **Dois aparelhos:** conclua uma aula num navegador e veja o progresso aparecer em outro (ou numa janela anônima) com a mesma conta.
6. **Seus dados:** na aba Eu, baixe os dados (JSON) e exclua a conta. Depois disso, entrar com o mesmo e-mail pede o cadastro de novo.

Se algo falhar, veja os problemas comuns abaixo e os logs (CloudWatch, conta do ambiente): `/aws/lambda/egt-<env>-api-handler` (a API) e `/aws/lambda/egt-<env>-auth-triggers` (os gatilhos do Cognito).

## Problemas comuns

- **O código não chega:** o SES está no sandbox e o e-mail não foi verificado (veja acima). Confira também o spam.
- **"Não deu para entrar com o Google":** confira a URI de redirecionamento no Google Cloud (exatamente `https://auth.<domínio>/oauth2/idpresponse`), se o app do Google foi publicado e se o Client ID e o secret no GitHub são do ambiente certo (depois de corrigir, rode o deploy de novo). Nos logs da API, procure `google_sign_in_failed`.
- **"Muitas tentativas em pouco tempo" (429):** o WAF aceita até 50 requisições por IP a cada 5 minutos em `/api/auth/*`. Espere 5 minutos.
- **O e-mail do código chega em inglês:** o gatilho de mensagem não foi chamado para aquele tipo de código. Abra uma issue; a alternativa é o modelo de mensagem do próprio pool (`email_mfa_configuration` no módulo `auth`).

## Trocar o segredo do Google

1. No Google Cloud, em **Clients**, abra o cliente do ambiente e adicione um secret novo (o antigo continua valendo).
2. Atualize o Secret `GOOGLE_CLIENT_SECRET_<AMBIENTE>` no GitHub.
3. Rode o deploy (Actions → **deploy** → **Run workflow**).
4. Depois do deploy, apague o secret antigo no Google Cloud.

## Pedido de exclusão fora do site

Se alguém pedir a exclusão sem conseguir entrar (por exemplo, perdeu o acesso ao e-mail), confirme a identidade da pessoa pelo canal de atendimento e então, no console da conta de prod:

1. Cognito → User pools → `egt-prod-auth-learners` → **Users** → busque o e-mail → anote o `sub` → **Delete user**.
2. DynamoDB → Tables → `egt-prod-data-main` → **Explore items** → consulta com `PK = USER#<sub>` → selecione todos os itens → **Delete items**.
```

`docs/adr/README.md`:

```diff
--- a/docs/adr/README.md
+++ b/docs/adr/README.md
@@ -27,3 +27,4 @@ Cada decisão relevante vira um arquivo `NNNN-titulo.md` a partir de `0000-model
 | 0021 | JavaScript no cliente sob CSP estrita                       | aceita               |
 | 0022 | API na mesma distribuição do CloudFront                     | aceita               |
 | 0023 | Chaves da AWS em dados, logs e alertas                      | aceita               |
+| 0024 | Contas de alunos: Cognito sem senha atrás da API            | aceita               |
```

`docs/adr/0007-cognito.md`:

```diff
--- a/docs/adr/0007-cognito.md
+++ b/docs/adr/0007-cognito.md
@@ -27,6 +27,7 @@ O pool de alunos usa o plano Essentials (Google + código por e-mail, com telas
   - O custo cresce (US$ 0,015/MAU acima de 10 mil; cerca de US$ 600/mês com 50 mil MAU).
   - Não roda localmente; usamos um emissor OIDC falso.
   - O MFA do Cognito não se aplica a usuários federados nem ao login sem senha.
+- Detalhes do login dos alunos (código por e-mail, vínculo com o Google, sessão, idade mínima): ADR 0024.
 
 ## Pilares Well-Architected
 
```

`docs/arquitetura/well-architected.md`:

```diff
--- a/docs/arquitetura/well-architected.md
+++ b/docs/arquitetura/well-architected.md
@@ -4,20 +4,21 @@ Atualize este documento em todo PR que mudar a arquitetura (veja `infra/CLAUDE.m
 
 ## Excelência operacional
 
-| Prática                                                                                           | Status                |
-| ------------------------------------------------------------------------------------------------- | --------------------- |
-| Toda infraestrutura em Terraform, mudanças por PR com plano e delta de custo                      | feito (Fase 0)        |
-| Decisões registradas em ADRs                                                                      | feito (Fase 0)        |
-| Deploy automatizado dev → aprovação → prod com smoke tests                                        | feito (Fase 0)        |
-| Runbooks de bootstrap, GitHub, deploy e rollback, flat-rate, remoção total e MCP                  | feito (Fase 0)        |
-| Logs estruturados (Powertools) e alarmes de erro da API por e-mail (ADR 0023)                     | feito (Fase 1B)       |
-| Ambiente local com DynamoDB Local (`pnpm db:up`) e testes de integração com ele na CI             | feito (Fase 1B)       |
-| Operações (conteúdo, social, transparência) via skills do Claude Code terminando em PR            | planejado (Fases 3–5) |
-| Concorrência de deploy por ambiente e espera pela invalidação do CloudFront antes dos smoke tests | feito (Fase 0)        |
-| Permissões mínimas por job nos workflows                                                          | feito (Fase 0)        |
-| GitHub Actions fixadas por digest, atualizadas pelo Renovate                                      | feito (Fase 0)        |
-| Conteúdo validado na CI (`pnpm content:check`) e rascunhos só em dev                              | feito (Fase 1A)       |
-| Exceções do Trivy documentadas inline, por recurso                                                | feito (Fase 0)        |
+| Prática                                                                                             | Status                |
+| --------------------------------------------------------------------------------------------------- | --------------------- |
+| Toda infraestrutura em Terraform, mudanças por PR com plano e delta de custo                        | feito (Fase 0)        |
+| Decisões registradas em ADRs                                                                        | feito (Fase 0)        |
+| Deploy automatizado dev → aprovação → prod com smoke tests                                          | feito (Fase 0)        |
+| Runbooks de bootstrap, GitHub, deploy e rollback, flat-rate, remoção total e MCP                    | feito (Fase 0)        |
+| Logs estruturados (Powertools) e alarmes de erro da API por e-mail (ADR 0023)                       | feito (Fase 1B)       |
+| Ambiente local com DynamoDB Local (`pnpm db:up`) e testes de integração com ele na CI               | feito (Fase 1B)       |
+| Login testável sem AWS: provedor local, Mailpit e Google de mentira no `pnpm db:up`, na CI e no e2e | feito (Fase 1C)       |
+| Operações (conteúdo, social, transparência) via skills do Claude Code terminando em PR              | planejado (Fases 3–5) |
+| Concorrência de deploy por ambiente e espera pela invalidação do CloudFront antes dos smoke tests   | feito (Fase 0)        |
+| Permissões mínimas por job nos workflows                                                            | feito (Fase 0)        |
+| GitHub Actions fixadas por digest, atualizadas pelo Renovate                                        | feito (Fase 0)        |
+| Conteúdo validado na CI (`pnpm content:check`) e rascunhos só em dev                                | feito (Fase 1A)       |
+| Exceções do Trivy documentadas inline, por recurso                                                  | feito (Fase 0)        |
 
 ## Segurança
 
@@ -29,7 +30,10 @@ Atualize este documento em todo PR que mudar a arquitetura (veja `infra/CLAUDE.m
 | S3 privado com OAC, política só-TLS e criptografia em repouso                                                                              | feito (Fase 0)            |
 | WAF com regras gerenciadas e rate limit; CSP, HSTS e cabeçalhos de segurança                                                               | feito (Fase 0)            |
 | Tag policy e auditoria semanal de tags                                                                                                     | feito (Fase 0)            |
-| Cognito, BFF com cookies HttpOnly, SMS MFA da equipe                                                                                       | planejado (Fase 1)        |
+| Contas de alunos no Cognito (Essentials) sem senha; tokens só em cookies HttpOnly, sem `Domain` (ADR 0024)                                 | feito (Fase 1C)           |
+| Login com limite próprio no WAF (50 requisições por IP a cada 5 minutos em `/api/auth/*`)                                                  | feito (Fase 1C)           |
+| Idade mínima no cadastro e autoatendimento da LGPD (baixar e excluir os dados)                                                             | feito (Fase 1C)           |
+| SMS MFA da equipe                                                                                                                          | planejado (Fase 1)        |
 | Proteções contra SSRF e injeção de prompt no corretor                                                                                      | planejado (Fase 2)        |
 | Chave de assinatura de certificados no KMS                                                                                                 | planejado (Fase 2)        |
 | Permissions boundary na role de apply                                                                                                      | planejado (fim da Fase 2) |
@@ -40,6 +44,7 @@ Atualize este documento em todo PR que mudar a arquitetura (veja `infra/CLAUDE.m
 | API só pelo CloudFront: cabeçalho secreto de origem, WAF e cabeçalhos de segurança também na API (ADR 0022)                                | feito (Fase 1B)           |
 | Mudanças na API só com `Origin` do site (CSRF); corpo até 8 KB; respostas `no-store`                                                       | feito (Fase 1B)           |
 | IAM de menor privilégio na Lambda da API; logs de acesso sem IP                                                                            | feito (Fase 1B)           |
+| E-mail do domínio com DKIM, MAIL FROM próprio e DMARC (SES)                                                                                | feito (Fase 1C)           |
 
 ## Confiabilidade
 
@@ -50,6 +55,8 @@ Atualize este documento em todo PR que mudar a arquitetura (veja `infra/CLAUDE.m
 | DynamoDB com PITR (35 dias) e proteção contra exclusão em prod                               | feito (Fase 1B)    |
 | Mescla de progresso sem ler-e-regravar: conjuntos com `ADD` e `SET` condicional              | feito (Fase 1B)    |
 | `/api/health` confere o banco; o smoke confere a versão publicada e os erros da API em JSON  | feito (Fase 1B)    |
+| Progresso sincronizado um curso por pedido; o que falha fica pendente no aparelho            | feito (Fase 1C)    |
+| Progresso limitado às aulas do catálogo (tamanho dos dados por aluno)                        | feito (Fase 1C)    |
 | SQS com DLQ; workers idempotentes                                                            | planejado (Fase 2) |
 | Deploys serializados por ambiente e smoke tests só após a invalidação do CloudFront terminar | feito (Fase 0)     |
 | Domínio principal `.com.br`; `.com` e `www` redirecionam com 301 na mesma borda (ADR 0020)   | feito (Fase 0)     |
@@ -74,7 +81,7 @@ Atualize este documento em todo PR que mudar a arquitetura (veja `infra/CLAUDE.m
 | Budgets por conta e detecção de anomalias por conta-membro                 | feito (Fase 0)              |
 | Tags de custo (Project, Environment, Component)                            | feito (Fase 0)              |
 | CloudFront pay-as-you-go no free tier; WAF à parte (ADR 0019)              | feito (Fase 0)              |
-| Gatilho de revisão do Cognito em 30 mil MAU                                | planejado (Fase 1)          |
+| Cognito Essentials gratuito até 10 mil MAU; revisão em 30 mil (ADR 0007)   | feito (Fase 1C)             |
 | API, banco e alarmes pagos por uso; chaves da AWS em vez de CMK (ADR 0023) | feito (Fase 1B)             |
 
 ## Sustentabilidade
```

- [ ] **Step 2: Runbooks existentes e spec**

`docs/runbooks/deploy.md`:

```diff
--- a/docs/runbooks/deploy.md
+++ b/docs/runbooks/deploy.md
@@ -4,6 +4,8 @@ Como a aplicação chega a dev e prod, e o que fazer quando algo dá errado.
 
 ## Como funciona
 
+Antes do primeiro deploy das contas de alunos (Fase 1C), prepare o Google e o GitHub como em `docs/runbooks/contas.md`: sem `GOOGLE_CLIENT_ID_*` e `GOOGLE_CLIENT_SECRET_*`, o plano e o deploy falham.
+
 1. Toda mudança entra por PR na `main`. O merge dispara o workflow `deploy` quando muda algo que vai para a AWS (`apps/web/`, `apps/api/`, `content/`, `packages/`, `infra/`, `tools/deploy-site.sh`, `tools/smoke.sh`, dependências ou os próprios workflows de deploy). Mudança só de documentação não publica nada.
 2. Job `dev` (environment `dev`, sem aprovação): build da API (`apps/api/dist`, que o Terraform empacota na Lambda), `terraform apply` da raiz `live`, build e publicação do site (`tools/deploy-site.sh`, que espera a invalidação do CloudFront terminar; dev mostra os cursos em rascunho, `SITE_DRAFTS=true`, e prod mostra só os publicados) e smoke tests (`tools/smoke.sh`, que também confere a API). Por fim, confere que o endereço direto do API Gateway recusa o acesso (403).
 3. Job `prod`: só começa se o `dev` passou e fica esperando aprovação no environment `prod`. Para aprovar: Actions → execução do `deploy` → **Review deployments** → marque `prod` → **Approve and deploy**. Faz os mesmos passos do dev e ainda confere os redirects de `www.escolagratisdetecnologia.com.br`, `escolagratisdetecnologia.com` e `www.escolagratisdetecnologia.com` (ADR 0020).
@@ -77,6 +79,7 @@ Limitação conhecida: uma página salva para uso offline antes de um deploy de
 - O plano Terraform de cada PR de infra fica no resumo do job `plan` do workflow `infra`.
 - Na AWS (conta do ambiente): métricas do CloudFront e do WAF (`egt-<env>-edge-waf`) no console.
 - Logs da API (CloudWatch → Log groups): `/aws/lambda/egt-<env>-api-handler` (JSON do Powertools) e `/aws/apigateway/egt-<env>-api-http` (acessos, sem IP). Ficam 30 dias.
+- Logs dos gatilhos do Cognito (vínculo do Google e e-mails com código): `/aws/lambda/egt-<env>-auth-triggers`. Problemas de login: `docs/runbooks/contas.md`.
 
 ## Alarmes da API
 
@@ -92,12 +95,13 @@ O CloudFront envia à API o cabeçalho `x-origin-verify` com um segredo gerado p
 
 ## Se o smoke falhar
 
-O `tools/smoke.sh` confere: a página inicial responde com o nome da Escola (até 6 tentativas, 20 s entre elas), `/nao-existe` devolve 404, `/api/health` responde `status: ok` com a versão do commit publicado, `/api/nao-existe` devolve 404 em JSON e os cabeçalhos HSTS e CSP estão presentes. A mensagem no log diz qual conferência falhou.
+O `tools/smoke.sh` confere: a página inicial responde com o nome da Escola (até 6 tentativas, 20 s entre elas), `/nao-existe` devolve 404, `/api/health` responde `status: ok` com a versão do commit publicado, `/api/nao-existe` devolve 404 em JSON, `/api/me` sem sessão devolve 401 em JSON, `/api/auth/google` redireciona para o `/authorize` do domínio de login e os cabeçalhos HSTS e CSP estão presentes. A mensagem no log diz qual conferência falhou.
 
 Se a falha for na API:
 
 - `/api/health` com `"database":"unavailable"` (503): a Lambda não conseguiu ler a tabela. Veja os logs da API.
 - `/api/nao-existe` em HTML: a borda voltou a trocar erros da API pela página 404 (ADR 0022). Confira o `custom_error_response` do módulo `edge`.
+- `/api/me` ou `/api/auth/google` falhando: a Lambda não recebeu as configurações do Cognito (variáveis `USER_POOL_*` e `AUTH_DOMAIN`) ou o deploy rodou sem os valores do Google (`docs/runbooks/contas.md`).
 
 1. Abra a URL no navegador ou rode `tools/smoke.sh https://dev.escolagratisdetecnologia.com` (ou a de prod) no seu terminal.
 2. Falha passageira (rede, timeout)? **Re-run failed jobs** uma vez.
```

`docs/runbooks/remover-projeto.md`:

````diff
--- a/docs/runbooks/remover-projeto.md
+++ b/docs/runbooks/remover-projeto.md
@@ -15,15 +15,16 @@ Antes de apagar as zonas, volte os servidores de nomes do GoDaddy para os padrõ
 
 ## 2. Aplicação (prod, depois dev)
 
-A tabela DynamoDB de prod tem proteção contra exclusão: desligue-a antes do `destroy` de prod. A AWS guarda um backup de sistema da tabela apagada por 35 dias, sem custo, e o apaga sozinha.
+A tabela DynamoDB e o user pool dos alunos de prod têm proteção contra exclusão: desligue as duas antes do `destroy` de prod. A AWS guarda um backup de sistema da tabela apagada por 35 dias, sem custo, e o apaga sozinha. O pool, apagado, some com todas as contas.
 
-O Terraform lê o pacote da Lambda em `apps/api/dist`, então gere o build antes, mesmo para destruir.
+O Terraform lê o pacote das Lambdas em `apps/api/dist`, então gere o build antes, mesmo para destruir. As variáveis do Google são obrigatórias no `destroy`, mas qualquer valor serve.
 
 Após esperar o ciclo de cobrança, a sessão SSO expirou. Um login serve aos três perfis:
 
 ```bash
 aws sso login --profile egt-management
 pnpm install && pnpm --filter @egt/api build
+export TF_VAR_google_client_id=remover TF_VAR_google_client_secret=remover
 export AWS_PROFILE=egt-prod
 aws dynamodb update-table --table-name egt-prod-data-main --no-deletion-protection-enabled
 infra/tf live prod destroy
@@ -31,6 +32,8 @@ export AWS_PROFILE=egt-dev
 infra/tf live dev destroy
 ```
 
+O `destroy` de prod falha no user pool enquanto a proteção estiver ligada. Antes dele, desligue-a no console da conta de prod: Cognito → User pools → `egt-prod-auth-learners` → **Settings** → **Deletion protection** → **Deactivate**. Não use `aws cognito-idp update-user-pool` para isso: o comando volta ao padrão tudo o que não for informado.
+
 O bucket do site tem `force_destroy`, então é esvaziado automaticamente.
 
 ## 3. Bootstrap das contas
````

`docs/runbooks/configurar-github.md`:

```diff
--- a/docs/runbooks/configurar-github.md
+++ b/docs/runbooks/configurar-github.md
@@ -27,12 +27,14 @@ Repositório: `escolagratisdetecnologia/escolagratisdetecnologia` (público), da
 
 ## Variáveis e segredos (Settings → Secrets and variables → Actions)
 
-| Tipo                       | Nome                  | Valor                                         |
-| -------------------------- | --------------------- | --------------------------------------------- |
-| Variable (repositório)     | `AWS_ACCOUNT_ID_DEV`  | ID da conta egt-dev                           |
-| Variable (repositório)     | `AWS_ACCOUNT_ID_PROD` | ID da conta egt-prod                          |
-| Variable (por environment) | `AWS_ACCOUNT_ID`      | ID da conta do environment (ver tabela acima) |
-| Secret (repositório)       | `ALERT_EMAILS`        | lista JSON, ex.: `["voce@exemplo.com"]`       |
+| Tipo                       | Nome                                                    | Valor                                                            |
+| -------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
+| Variable (repositório)     | `AWS_ACCOUNT_ID_DEV`                                    | ID da conta egt-dev                                              |
+| Variable (repositório)     | `AWS_ACCOUNT_ID_PROD`                                   | ID da conta egt-prod                                             |
+| Variable (por environment) | `AWS_ACCOUNT_ID`                                        | ID da conta do environment (ver tabela acima)                    |
+| Secret (repositório)       | `ALERT_EMAILS`                                          | lista JSON, ex.: `["voce@exemplo.com"]`                          |
+| Variable (repositório)     | `GOOGLE_CLIENT_ID_DEV`, `GOOGLE_CLIENT_ID_PROD`         | Client ID do Google de cada ambiente (`docs/runbooks/contas.md`) |
+| Secret (repositório)       | `GOOGLE_CLIENT_SECRET_DEV`, `GOOGLE_CLIENT_SECRET_PROD` | Client secret do Google de cada ambiente                         |
 
 `ALERT_EMAILS` é Secret **do repositório** (não de environment), nunca Variable: os jobs de deploy declaram `environment:`, então um Secret de environment com o mesmo nome `ALERT_EMAILS` sobrescreveria o do repositório e plano/apply poderiam divergir. Se ficar vazio, o Terraform recebe `[]` e o orçamento fica sem notificações por e-mail.
 
```

`docs/runbooks/cloudfront-flat-rate.md` (o WAF agora usa as 5 regras do plano Free):

````diff
--- a/docs/runbooks/cloudfront-flat-rate.md
+++ b/docs/runbooks/cloudfront-flat-rate.md
@@ -13,7 +13,7 @@ O provider Terraform AWS (6.67, verificado em 2026-10-03) não gerencia a assina
 
 ## Limites do WAF
 
-O plano Free permite 5 regras de WAF. O web ACL `egt-<env>-edge-waf` usa 4: 3 grupos gerenciados da AWS (Common, Known Bad Inputs, IP Reputation) e o limite de requisições por IP, que ignora `/_astro/`. O limite de requisições usa uma resposta customizada (429 em JSON, ADR 0022), e respostas customizadas exigem o plano Pro. Para assinar o plano Free, primeiro troque, por PR, essa regra para o bloqueio padrão: o visitante bloqueado volta a ver a página 404 do site, e a API recebe essa página em vez do JSON.
+O plano Free permite 5 regras de WAF, e o web ACL `egt-<env>-edge-waf` usa as 5: 3 grupos gerenciados da AWS (Common, Known Bad Inputs, IP Reputation), o limite de requisições do login (`/api/auth/*`, ADR 0024) e o limite geral por IP, que ignora `/_astro/`. Os dois limites usam uma resposta customizada (429 em JSON, ADR 0022), e respostas customizadas exigem o plano Pro. Para assinar o plano Free, primeiro troque, por PR, essas regras para o bloqueio padrão: o visitante bloqueado volta a ver a página 404 do site, e a API recebe essa página em vez do JSON.
 
 ## Depois de assinar
 
@@ -22,6 +22,7 @@ Rode o plano de conferência (o `TF_VAR_alert_emails` é obrigatório: sem ele o
 ```bash
 export AWS_PROFILE=egt-<env>
 export TF_VAR_alert_emails='["<seu-e-mail>"]'
+export TF_VAR_google_client_id='<client ID do ambiente>' TF_VAR_google_client_secret='<client secret do ambiente>'
 pnpm --filter @egt/api build
 infra/tf live <env> plan
 ```
````

`docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`:

```diff
--- a/docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md
+++ b/docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md
@@ -285,11 +285,11 @@ Sem cookies de terceiros nem pixels. Acessos por logs padrão do CloudFront (Clo
 
 | | Alunos — `egt-{env}-learners` (Essentials) | Equipe — `egt-{env}-staff` (Lite) |
 |---|---|---|
-| Login | Google (federação OIDC) e código de 6 dígitos por e-mail (`EMAIL_OTP`, fluxo `USER_AUTH`) | Senha forte + **SMS MFA obrigatório** (TOTP aceito como reserva) |
+| Login | Google (federação OIDC) e código por e-mail (`EMAIL_OTP`, fluxo `USER_AUTH`; 6 dígitos no cadastro, 8 no login) | Senha forte + **SMS MFA obrigatório** (TOTP aceito como reserva) |
 | Cadastro | Livre, sem senha | Fechado (contas criadas por CLI/Terraform) |
 | MFA do pool | Desligado (o Cognito não permite MFA junto com passwordless) | Obrigatório |
 | SMS | Verificação única do celular antes do 1º certificado | A cada login |
-| Vinculação | Gatilho *pre sign-up* vincula Google e e-mail do mesmo endereço (`AdminLinkProviderForUser`) | — |
+| Vinculação | Gatilho *pre sign-up* vincula o Google ao usuário do mesmo e-mail (`AdminLinkProviderForUser`), criado sem senha se ainda não existir: um aluno, uma conta (ADR 0024) | — |
 | E-mail | SES com domínio próprio (DKIM, SPF, DMARC) | SES |
 | Domínio Cognito | `auth.escolagratisdetecnologia.com.br` (prod), `auth.dev.escolagratisdetecnologia.com` (dev) — necessário para a federação Google | Nenhum: login pela API do Cognito (`USER_SRP_AUTH` + desafio `SMS_MFA`) em telas próprias |
 
@@ -299,7 +299,7 @@ Proteção contra enumeração de usuários ligada; a tela responde igual para c
 
 - Telas de login próprias (pt-BR); o backend chama a API do Cognito (app client confidencial). Google redireciona direto ao IdP via `identity_provider=Google` com PKCE e `state`.
 - Cookies: `egt_at` (access token, HttpOnly, Secure, SameSite=Lax, `Path=/api`, 1 h), `egt_rt` (refresh, HttpOnly, `Path=/api/auth`, 30 dias para alunos), `egt_hint` (não sensível, só indica "logado" para a UI). Equipe: cookies separados `egt_staff_*`, sessão de 8 h.
-- Verificação do JWT com `aws-jwt-verify` (em produção) ou verificador genérico JWKS (local), escolhido por variável de ambiente.
+- Verificação do JWT com `aws-jwt-verify` na AWS; localmente, o provedor de identidade local confere os tokens que ele mesmo assina (ADR 0024).
 - Logout revoga o refresh token e limpa cookies.
 
 ### 5.3 Verificação do celular (alunos)
@@ -601,8 +601,8 @@ pnpm workspaces + Turborepo; TypeScript `strict` (6.0, por compatibilidade com t
 
 `pnpm dev` sobe:
 
-- `docker compose` (`pnpm db:up`): DynamoDB Local; `mock-oauth2-server` (emissor OIDC falso) e Mailpit (e-mails) entram com as contas (Fase 1C). Sem Docker, a API guarda o progresso na memória.
-- Criação da tabela ao iniciar a API; seed de usuários de teste com as contas (Fase 1C).
+- `docker compose` (`pnpm db:up`): DynamoDB Local, `mock-oauth2-server` (o Google de mentira) e Mailpit (os e-mails com código). Sem Docker, a API guarda tudo na memória e o código de login aparece no terminal.
+- Criação da tabela ao iniciar a API. Sem seed: localmente, qualquer e-mail entra, com o código no Mailpit e no terminal.
 - API Hono como servidor Node em `:3001`; Astro dev em `:4321` com proxy `/api` → `:3001`.
 - Corretor: Claude real se `ANTHROPIC_API_KEY` existir; senão `FakeGrader`.
 - Certificados assinados com chave local; SMS impresso no console; vídeos de exemplo de `fixtures/media`.
```

- [ ] **Step 3: Guias e README**

`apps/api/CLAUDE.md`:

```md
# apps/api — API Hono

- **Composição:** `createApp(deps)` em `src/app.ts` recebe `AppDeps` e monta middlewares e rotas. As dependências são: config, logger, repositórios de progresso e de perfil, catálogo de progresso, `checkDatabase`, `identity` e `now`. Cada recurso fica em `src/routes/<recurso>.ts` (`health`, `auth`, `me`, `progress`), exportando uma função que recebe só as dependências que usa e devolve um `Hono`.
- **Entradas finas:** elas só montam as dependências.
  - `src/lambda.ts`: na AWS, com DynamoDB e Cognito.
  - `src/server.ts`: no ambiente local, com DynamoDB Local ou memória (via `src/local.ts`) e o provedor de identidade local. Antes de conectar a qualquer coisa, chama `requireLocal`: o servidor local nunca roda fora de `APP_ENV=local`.
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
```

`CLAUDE.md`:

```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -29,7 +29,7 @@ Escola online 100% gratuita e beneficente para brasileiros (maioria geração Z,
 - `pnpm install`
 - `pnpm dev` — site em http://localhost:4321 e API em http://localhost:3001 (o site encaminha `/api`)
 - `pnpm lint` · `pnpm format` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm build`
-- `pnpm db:up` — sobe o DynamoDB Local no Docker; a API cria a tabela ao iniciar. Sem Docker, o `pnpm dev` guarda o progresso na memória. Testes de integração: `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test` (na CI, sempre).
+- `pnpm db:up` — sobe no Docker o DynamoDB Local, o Mailpit (códigos de login em http://localhost:8025) e o Google de mentira (mock-oauth2-server, em http://localhost:8080); a API cria a tabela ao iniciar. Sem Docker, o `pnpm dev` guarda tudo na memória e o código de login aparece no terminal da API. Testes de integração: `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test` (na CI, sempre).
 - `pnpm content:check` — valida os cursos de `content/` (roda na CI); recusa HTML solto no Markdown (HTML dentro de código e autolinks são aceitos), usando o lexer do `marked`, o mesmo renderizador do site
 - `infra/tf <raiz> <ambiente> <comando>` — Terraform com backend e variáveis do ambiente (ex.: `infra/tf live dev plan`)
 
@@ -48,7 +48,7 @@ Escola online 100% gratuita e beneficente para brasileiros (maioria geração Z,
 
 ## Antes de dizer que terminou
 
-`pnpm lint && pnpm typecheck && pnpm test` verdes. Mexeu no site: `pnpm test:e2e`. Mexeu na API ou em `packages/db`: `pnpm db:up` e `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test`. Mexeu em `infra/`: `terraform fmt -check -recursive infra`, `terraform validate` da raiz afetada, `tflint` e `trivy config`.
+`pnpm lint && pnpm typecheck && pnpm test` verdes. Mexeu no site: `pnpm test:e2e` (os testes de login pedem `pnpm db:up`; sem ele, são pulados localmente). Mexeu na API ou em `packages/db`: `pnpm db:up` e `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test`. Mexeu em `infra/`: `terraform fmt -check -recursive infra`, `terraform validate` da raiz afetada, `tflint` e `trivy config`.
 
 ## MCP e ações externas
 
```

`apps/web/CLAUDE.md`:

```diff
--- a/apps/web/CLAUDE.md
+++ b/apps/web/CLAUDE.md
@@ -3,9 +3,11 @@
 - **Static-first:** páginas geradas no build, zero JavaScript por padrão. Interação vem de ilhas Preact (`src/islands/`) hidratadas pelo nosso script externo, nunca pela diretiva `client:*` do Astro, que gera script inline bloqueado pela CSP (ADR 0021). Nova ilha: componente em `src/islands/`, entrada em `src/islands/registry.ts`, uso com `<Island name component props />`. A primeira renderização da ilha tem de ser igual à do build: leia o aparelho (`localStorage`, `navigator`) só em `useEffect`. A chamada principal do início é a ilha `home-action`: "Ver os cursos" para quem chega e "Continuar de onde parou" (com um aviso de progresso) para quem volta, no mesmo espaço, sem deslocar nada.
 - **Scripts sem framework:** melhorias pequenas em `src/scripts/*.ts`, incluídas com `<script src="…">` (o Astro gera arquivo externo porque `assetsInlineLimit` é 0). Só quando algo precisa ser decidido antes da primeira pintura, use um script clássico externo no `<head>` pelo slot `head` do layout (padrão `src/scripts/device-early.js`, que marca `data-device` no `<html>` na aula com variantes; o CSS decide o que aparece). Ao terminar de ligar os eventos, marque `data-ready="true"` no elemento raiz, que os testes esperam.
 - **Conteúdo:** as páginas leem `content/` por `getCourses()` (`src/lib/catalog.ts`), que falha o build se o `content:check` falharia. `SITE_DRAFTS=true` mostra cursos em rascunho (`pnpm dev` já define, e também o dev e a CI); o deploy de prod usa `false`.
-- **Progresso:** só no `localStorage` (`egt:progress:v1`), via `src/lib/progress-store.ts` e as regras de `@egt/core`.
+- **Progresso:** no `localStorage` (`egt:progress:v1`), via `src/lib/progress-store.ts` e as regras de `@egt/core`. Toda mudança passa por `saveProgress` (`src/lib/progress-sync.ts`): marca o curso como pendente e, com sessão, manda para a conta um curso por pedido. `src/scripts/sync.ts`, em toda página do `App.astro`, envia os pendentes e traz o que outros aparelhos salvaram. Ao sair ou excluir a conta, `forgetProgress` apaga tudo do aparelho (ADR 0024).
+- **API:** sempre por `api()` de `src/lib/api.ts` (mesmo site, cookies, renova a sessão uma vez no 401). Resposta sem JSON (página do WAF ou do CloudFront) vira erro genérico. Para saber se há sessão, `hasSession()` (`src/lib/session.ts`, cookie `egt_hint`); os tokens ficam em cookies HttpOnly, longe do JavaScript.
+- **Contas:** `/entrar/` (ilha `login`: código por e-mail ou Google), `/entrar/cadastro/` (`complete-profile`: ano de nascimento e termos), a seção da conta na aba Eu (`account`), `/termos/` e `/privacidade/` (rascunhos até a revisão jurídica; a versão é o `TERMS_VERSION` de `@egt/core`). Depois do login, `finishSignIn` (`src/lib/sign-in.ts`) leva ao cadastro ou sincroniza o aparelho e segue para o `next` (só caminhos do próprio site).
 - **Elementos escondidos e barras fixas:** `global.css` tem `[hidden] { display: none !important; }`, então um elemento com `hidden` continua escondido mesmo com classe que define `display`; os scripts o mostram com `el.hidden = false`. Na aula, a barra fixa "Concluir e continuar" não cobre o conteúdo focado ou ancorado, porque o `scroll-padding-bottom` deixa espaço livre para ela, e as checagens axe da aula rodam depois de rolar até o fim, porque no meio da rolagem a barra sobrepõe o conteúdo de propósito.
-- **Checagens:** `pnpm --filter @egt/web check:csp` depois do build (lê o HTML com o parse5, então enxerga também SVG, conteúdo de `<template>` e URLs `javascript:`, `vbscript:` ou `data:`); `pnpm --filter @egt/web check:drafts` depois de um build de prod (`SITE_DRAFTS=false`) falha se algum curso em rascunho foi publicado (a CI roda os dois); e2e com `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e`.
+- **Checagens:** `pnpm --filter @egt/web check:csp` depois do build (lê o HTML com o parse5, então enxerga também SVG, conteúdo de `<template>` e URLs `javascript:`, `vbscript:` ou `data:`); `pnpm --filter @egt/web check:drafts` depois de um build de prod (`SITE_DRAFTS=false`) falha se algum curso em rascunho foi publicado (a CI roda os dois); e2e com `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e`. O Playwright sobe a API local (`SITE_ORIGIN=http://localhost:4322`) e o `astro preview`, que encaminha `/api`; os testes de login (`e2e/account.spec.ts`) leem os códigos no Mailpit e usam o Google de mentira, então pedem `pnpm db:up` (na CI, sempre rodam).
 - **Orçamentos (CI bloqueia):** ≤ 30 KB de JS por página de conteúdo, LCP ≤ 2,0 s, CLS ≤ 0,05, Lighthouse ≥ 95 em performance, acessibilidade, boas práticas e SEO.
 - **CSP estrita:** nada de `<script>` ou `<style>` inline (`build.inlineStylesheets: 'never'`). Precisa de script? Arquivo externo.
 - **Acessibilidade (WCAG 2.2 AA):** `lang="pt-BR"`, um `h1` por página, alvos de toque ≥ 48 px, contraste, foco visível, `prefers-reduced-motion`, texto alternativo. O e2e roda axe em todas as páginas novas.
```

`infra/CLAUDE.md`:

```diff
--- a/infra/CLAUDE.md
+++ b/infra/CLAUDE.md
@@ -4,13 +4,14 @@
 
 - `bootstrap/account` — por conta (dev, prod): bucket de estado, OIDC do GitHub, roles `egt-<env>-bootstrap-github-{plan,apply,audit}`, Resource Explorer (view `egt-<env>-bootstrap-all-resources`), zona DNS.
 - `bootstrap/management` — conta de gerenciamento: tag policy, anomalias de custo, cost allocation tags.
-- `modules/*` — blocos reutilizáveis (tags, site, edge, data, api, observability, state-bucket…).
+- `modules/*` — blocos reutilizáveis (tags, site, edge, data, auth, api, observability, state-bucket…). O `auth` cria o user pool dos alunos, o Google, o SES do domínio e os gatilhos do Cognito; o domínio de login `auth.<domínio>` fica no `edge`, que já cuida de certificados e DNS (ADR 0024).
 - `live/` — raiz única da aplicação; `env/<env>.tfvars` e `env/<env>.backend.hcl` por ambiente.
 - `tf` — wrapper: `infra/tf <raiz> <env> <comando>`.
 
 ## Lambdas
 
 - O Terraform empacota o build (`archive_file` de `apps/<app>/dist`): rode `pnpm --filter @egt/api build` antes de `infra/tf live <env> plan` (a CI e o deploy já fazem). O hash do zip só muda quando o código muda.
+- O mesmo build traz os gatilhos do Cognito (`triggers.mjs`), que o módulo `auth` empacota numa Lambda própria (`egt-<env>-auth-triggers`, até 5 segundos, o limite do Cognito).
 - Log group criado pelo Terraform (30 dias) e `logging_config` apontando para ele; nada criado implicitamente.
 - Política IAM só com as ações que o código usa hoje; rota nova que precisa de outra ação atualiza a política no mesmo PR.
 
@@ -49,6 +50,7 @@ Todo recurso AWS tagueável precisa de:
 - Prefira serviços pagos por uso. Se o padrão de uso mudar, atualize `infra/infracost-usage.yml`.
 - Exceções do Trivy só inline, com `#trivy:ignore:<ID>` logo acima do recurso e uma linha de justificativa em inglês (não existe `.trivyignore` global).
 - A variável `alert_emails` é `sensitive` e chega aos workflows pelo Secret `ALERT_EMAILS` (nunca por Variable — Variables aparecem em texto puro nos logs públicos).
+- O Google chega por `TF_VAR_google_client_id` (Variables `GOOGLE_CLIENT_ID_DEV`/`_PROD`) e `TF_VAR_google_client_secret` (Secrets `GOOGLE_CLIENT_SECRET_DEV`/`_PROD`, `sensitive`). Para um `plan` local, exporte os dois (`docs/runbooks/contas.md`).
 - A role de plan dos PRs tem Deny explícito para leitura de dados (objetos S3 fora do estado, itens DynamoDB, usuários Cognito, logs, segredos, `kms:Decrypt`). Se um módulo novo precisar que o `plan` leia conteúdo, registre em ADR antes de afrouxar.
 
 ## Testes
```

`content/CLAUDE.md`:

```diff
--- a/content/CLAUDE.md
+++ b/content/CLAUDE.md
@@ -24,6 +24,10 @@ Conteúdo como código (spec §4.1, decisão D2). Tudo aqui é validado por `pnp
 - Só Markdown: HTML solto no texto é recusado (a CSP do site bloqueia estilos e scripts inline). Exemplos de HTML vão entre crases ou em bloco de código, e links automáticos como `<https://…>` são aceitos.
 - Rubrica do projeto com pesos somando 100 e `passScore` de 0 a 100.
 
+## Renomear aulas
+
+O nome do arquivo (sem o número) é o slug da aula, e a API só guarda progresso de aulas do catálogo (ADR 0024). Renomear uma aula publicada faz o progresso antigo dela sumir das telas: renomeie só enquanto o curso estiver em rascunho.
+
 ## Tom
 
 Fale com "você", frases curtas, exemplos brasileiros (Pix, MEI, WhatsApp, comércio do bairro), jargão sempre explicado. Ferramentas grátis e no navegador primeiro. O guia de estilo completo chega na Fase 3 (`docs/conteudo/guia-de-estilo.md`).
```

`README.md`:

```diff
--- a/README.md
+++ b/README.md
@@ -2,7 +2,7 @@
 
 Aprenda tecnologia de graça, em aulas curtinhas pensadas pro celular, e saia de cada curso resolvendo um problema de verdade — com certificado que qualquer pessoa consegue conferir.
 
-> **Status:** Fase 1 (plataforma) em andamento: aprender sem conta (1A) e API com banco de dados (1B) prontos; próximas: contas (1C) e mídia (1D). Site: https://escolagratisdetecnologia.com.br
+> **Status:** Fase 1 (plataforma) em andamento: aprender sem conta (1A), API com banco de dados (1B) e contas de alunos (1C) prontos; próximas: mídia (1D) e o login da equipe com SMS. Site: https://escolagratisdetecnologia.com.br
 
 ## Por que existe
 
@@ -14,8 +14,8 @@ Aprenda tecnologia de graça, em aulas curtinhas pensadas pro celular, e saia de
 
 1. Instale o [mise](https://mise.jdx.dev) e rode `mise install` (Node 24, pnpm, Terraform e ferramentas). Em shells não interativos, as ferramentas do mise ficam em `$HOME/.local/share/mise/shims`.
 2. `pnpm install`
-3. Opcional, com Docker: `pnpm db:up` sobe o DynamoDB Local. Sem ele, a API guarda o progresso na memória.
-4. `pnpm dev` → site em http://localhost:4321 e API em http://localhost:3001/api/health
+3. Opcional, com Docker: `pnpm db:up` sobe o DynamoDB Local, o Mailpit (os e-mails com código de login, em http://localhost:8025) e um Google de mentira para testar o login. Sem Docker, a API guarda tudo na memória e mostra o código de login no terminal.
+4. `pnpm dev` → site em http://localhost:4321 e API em http://localhost:3001/api/health. Para entrar, use qualquer e-mail: o código chega no Mailpit (e no terminal da API).
 
 Verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`. Os testes com DynamoDB Local rodam com `pnpm db:up` e `DYNAMODB_ENDPOINT=http://localhost:8000` (na CI, sempre).
 
@@ -41,6 +41,7 @@ No Linux/WSL, o WebKit dos testes e2e pode exigir, uma única vez: `sudo env "PA
   - [Bootstrap da AWS](docs/runbooks/bootstrap-aws.md)
   - [Configuração do GitHub](docs/runbooks/configurar-github.md)
   - [Deploy, reexecução e rollback](docs/runbooks/deploy.md)
+  - [Contas de alunos (Google, e-mail e conferências)](docs/runbooks/contas.md)
   - [Plano flat-rate do CloudFront](docs/runbooks/cloudfront-flat-rate.md) (não usado hoje; ADR 0019)
   - [Servidores MCP](docs/runbooks/mcp.md)
   - [Remover 100% do projeto da AWS](docs/runbooks/remover-projeto.md)
```

- [ ] **Step 4: Verificação final e commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm db:up && DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test
pnpm content:check
SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build
pnpm --filter @egt/web check:csp && pnpm --filter @egt/web test:e2e
"$(mise which terraform)" fmt -check -recursive infra
```

Expected: tudo verde. No protótipo deste plano, foram 286 testes com o DynamoDB Local e 111 testes e2e passando, com 5 pulados como antes.

```bash
git add docs CLAUDE.md apps/api/CLAUDE.md apps/web/CLAUDE.md infra/CLAUDE.md content/CLAUDE.md README.md
git commit -m "docs: registra a Fase 1C (ADR 0024, runbook das contas e guias)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: [mantenedor] PR, deploy e conferências no dev

Quem executa: o mantenedor. O Claude prepara o texto do PR e acompanha.

- [ ] **Step 1: Pré-requisitos.** Com a Task 15 pronta, siga o `docs/runbooks/contas.md`, seção "Antes do primeiro deploy da Fase 1C": clientes do Google, as quatro configurações do GitHub e o e-mail verificado no SES do dev e do prod. Faça isso antes de abrir o PR, porque o plano Terraform do PR já usa os valores do Google.

- [ ] **Step 2: PR**
  - Abra o PR da branch da Fase 1C.
  - O plano Terraform dos dois ambientes deve **criar** o módulo `auth`, o domínio de login, o certificado e a regra do WAF, e **atualizar no lugar** a Lambda da API, a distribuição e o web ACL (nada de substituir a distribuição, o WAF ou a tabela).
  - O Infracost mostra o delta: cerca de US$ 1 por mês por ambiente pela regra nova do WAF, mais centavos de Lambda e de SES.

- [ ] **Step 3: Merge e deploy.** O deploy do dev cria o pool, o domínio de login (até 1 hora para o DNS do Cognito) e a identidade do SES (minutos para verificar). O smoke confere `/api/me` (401 em JSON) e o início do login com Google.

- [ ] **Step 4: Conferências no dev** (`docs/runbooks/contas.md`, "Depois do deploy: conferir no dev"):
  - e-mail novo (código de 6 dígitos, e-mail em português, cadastro);
  - login de novo (código de 8 dígitos);
  - Google com o mesmo e-mail (mesma conta);
  - Google primeiro e depois e-mail (mesma conta);
  - dois aparelhos com o mesmo progresso (portão da revisão da 1B: Query e UpdateItem de verdade na AWS);
  - baixar e excluir os dados.

  Algo diferente do esperado volta como issue antes de aprovar o prod.

- [ ] **Step 5: Prod.** Aprove o deploy de prod. Depois, confira que a página 404 e o login com Google continuam funcionando, e entre com o seu e-mail verificado no SES do prod.
