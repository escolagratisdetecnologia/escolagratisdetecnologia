# Fase 0 — Fundação: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o monorepo pronto para crescer — ferramentas, padrões, CLAUDE.md, licenças, ADRs, CI/CD com delta de custo e checagem de tags, ambiente local, Terraform (bootstrap + borda + site) — e publicar a página "Em breve" em `dev.escolagratisdetecnologia.com` e `escolagratisdetecnologia.com`.

**Architecture:** Monorepo pnpm + Turborepo com `apps/web` (Astro estático), `apps/api` (Hono rodando como servidor Node local e como handler Lambda — o deploy da API fica para a Fase 1) e `tools/` (CLIs em TypeScript executados direto pelo Node 24). Infra em Terraform: `infra/bootstrap/{account,management}` cria estado, OIDC do GitHub, zona DNS, Resource Explorer, tag policy e detecção de anomalias; `infra/live` (raiz única, um `tfvars` por ambiente) cria S3 + CloudFront + WAF + ACM + Budgets. GitHub Actions faz CI, plano Terraform com checagem de tags e Infracost, e deploy dev → aprovação → prod. Os serviços locais em Docker (DynamoDB Local, emissor OIDC falso, Mailpit — spec §13) entram na Fase 1, junto com as funcionalidades que os usam; na Fase 0, `pnpm dev` sobe site e API sem dependências externas.

**Tech Stack:** Node 24.21.0, pnpm 10.34.6, TypeScript ~6.0.3, Turborepo, Vitest, ESLint 10 + typescript-eslint, Prettier, Astro 7, Hono 4, Playwright + axe, Lighthouse CI, Terraform 1.16.5 + AWS provider ~> 6.67, tflint 0.64.0, Trivy 0.75.0, Infracost, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md` (seções 11, 12, 13, 14 e 17).

## Global Constraints

- Node `24.21.0` (Lambda `nodejs24.x`); pnpm `10.34.6`; TypeScript `~6.0.3` (typescript-eslint exige `<6.1`); Terraform `1.16.5`; provider AWS `~> 6.67`.
- Região principal `sa-east-1`; `us-east-1` somente para ACM/WAF do CloudFront e Cost Explorer (alias `aws.us_east_1`).
- Idioma: docs, ADRs, commits e PRs em pt-BR; identificadores, comentários técnicos, logs e mensagens de exceção em inglês; todo texto exibido a pessoas (UI, respostas de API, saída de CLIs do repo) em pt-BR.
- Ambientes AWS: `dev` e `prod` (nunca "staging"); conta de gerenciamento usa `Environment=shared`.
- Tags obrigatórias em todo recurso AWS tagueável: `Project=escola-gratis-de-tecnologia`, `Environment∈{dev,prod,shared}`, `Component∈{edge,site,api,data,auth,media,jobs,certificates,observability,bootstrap}`, `ManagedBy∈{terraform,app}`, `Repository=github.com/engelmannlabs/escolagratisdetecnologia`; `DataClassification∈{public,internal,personal}` só em armazenamento de dados.
- Nomes de recursos: `egt-{env}-{component}-{nome}`.
- Domínio: `escolagratisdetecnologia.com` (prod, com `www` redirecionando) e `dev.escolagratisdetecnologia.com` (dev).
- ESM em tudo (`"type": "module"`); imports relativos com extensão `.ts`.
- Nenhum segredo, e-mail pessoal ou ID de conta AWS versionado; usar GitHub Variables/Secrets e `TF_VAR_*`.
- Orçamentos web: ≤ 30 KB de JS por página de conteúdo, LCP ≤ 2,0 s, CLS ≤ 0,05, Lighthouse ≥ 95 (performance, acessibilidade, boas práticas, SEO), zero violações axe.
- Commits: Conventional Commits em pt-BR, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ações externas (push, criar recursos na AWS, mudar DNS, configurar GitHub) só com aprovação explícita do mantenedor — tarefas marcadas **[mantenedor]**.

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `.mise.toml`, `.node-version` | Versões de ferramentas | 1 |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json` | Workspace e orquestração de tarefas | 1 |
| `tsconfig.base.json`, `eslint.config.js`, `prettier.config.mjs`, `.prettierignore`, `vitest.config.ts` | Configuração compartilhada | 1 (vitest atualizado em 2, 4, 5, 7) |
| `.gitignore`, `.editorconfig` | Higiene do repo | 1 |
| `apps/api/src/{config,app,server,lambda}.ts`, `apps/api/src/routes/health.ts` | API Hono | 2 |
| `apps/web/**` | Site Astro "Em breve", e2e, Lighthouse | 3 |
| `tools/check-tags/**` | Valida tags no plano Terraform | 4 |
| `tools/tag-audit/**` | Relatório de recursos sem tag `Project` | 5 |
| `infra/modules/tags/**`, `infra/.tflint.hcl` | Fonte única das tags + lint | 6 |
| `infra/modules/site/**`, `infra/modules/edge/**` | Bucket do site; CloudFront, WAF, ACM, DNS, função de borda | 7 |
| `infra/modules/observability/**`, `infra/live/**`, `infra/tf`, `infracost.yml`, `infra/infracost-usage.yml` | Budgets, raiz da aplicação, wrapper, custo | 8 |
| `infra/modules/state-bucket/**`, `infra/bootstrap/**`, `infra/.trivyignore` | Bootstrap das contas | 9 |
| `.github/**`, `renovate.json`, `tools/deploy-site.sh`, `tools/smoke.sh` | CI/CD e governança | 10 |
| `CLAUDE.md`, `apps/*/CLAUDE.md`, `tools/CLAUDE.md`, `infra/CLAUDE.md`, `.claude/settings.json`, `.mcp.json`, `docs/runbooks/mcp.md` | Guias do Claude e MCP | 11 |
| `LICENSE`, `LICENSE-CONTENT.md`, `TRADEMARK.md`, `README.md`, `CONTRIBUTING.md` | Licenças e comunidade | 12 |
| `docs/adr/*.md`, `docs/arquitetura/well-architected.md` | Decisões e revisão Well-Architected | 13 |
| `docs/runbooks/{bootstrap-aws,configurar-github,cloudfront-flat-rate,remover-projeto}.md` | Operação | 14 |

---

### Task 1: Ferramentas e esqueleto do monorepo

**Files:**
- Create: `.mise.toml`, `.node-version`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `prettier.config.mjs`, `.prettierignore`, `vitest.config.ts`, `.gitignore`, `.editorconfig`

**Interfaces:**
- Produces: scripts raiz `pnpm dev | build | typecheck | test | test:e2e | lint | format`; `tsconfig.base.json` estendido por todos os pacotes TS; `vitest.config.ts` com lista `test.projects` que as próximas tarefas ampliam.

- [ ] **Step 1: Criar a branch de trabalho**

```bash
cd /home/gemdi/escolagratisdetecnologia
git switch -c fase-0/fundacao
```

- [ ] **Step 2: Instalar o toolchain (pedir aprovação ao mantenedor antes — instala software na máquina)**

Crie `.mise.toml`:

```toml
[tools]
node = "24.21.0"
pnpm = "10.34.6"
terraform = "1.16.5"
tflint = "0.64.0"
infracost = "0.10.46"
trivy = "0.75.0"
```

Crie `.node-version`:

```
24.21.0
```

Depois de aprovado:

```bash
curl https://mise.run | sh
~/.local/bin/mise trust && ~/.local/bin/mise install
eval "$(~/.local/bin/mise activate bash)"
node --version && pnpm --version && terraform version | head -1
```

Expected: `v24.21.0`, `10.34.6`, `Terraform v1.16.5`. Se o mantenedor recusar o mise, instale Node 24.21.0 e pnpm 10.34.6 por outro meio e siga.

- [ ] **Step 3: Criar os arquivos do workspace**

`package.json`:

```json
{
  "name": "escolagratisdetecnologia",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.34.6",
  "engines": {
    "node": ">=24.21.0"
  },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "turbo run test:e2e",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write ."
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - tools/*
onlyBuiltDependencies:
  - esbuild
  - sharp
```

`turbo.json`:

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "env": ["SITE_URL", "SITE_ENV"],
      "outputs": ["dist/**"]
    },
    "typecheck": {},
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test:e2e": {
      "dependsOn": ["build"],
      "cache": false
    }
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "es2024",
    "lib": ["es2024"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": []
  }
}
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/.astro/',
    '**/.turbo/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
    '**/.lighthouseci/',
    'infra/**/.terraform/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // CloudFront Functions: script clássico, o runtime chama `handler` pelo nome.
    files: ['infra/modules/edge/functions/*.js'],
    languageOptions: { sourceType: 'script', globals: {} },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^handler$' }],
    },
  },
]);
```

`prettier.config.mjs`:

```js
/** @type {import('prettier').Config} */
export default {
  singleQuote: true,
  printWidth: 100,
  plugins: ['prettier-plugin-astro'],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
};
```

`.prettierignore`:

```
pnpm-lock.yaml
LICENSE
docs/superpowers/
**/.terraform/
**/dist/
**/.astro/
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});
```

`.gitignore`:

```
node_modules/
dist/
.astro/
.turbo/
coverage/
playwright-report/
test-results/
.lighthouseci/
.env
.env.*
!.env.example
.terraform/
*.tfstate
*.tfstate.*
tfplan
plan.json
crash.log
.DS_Store
```

`.editorconfig`:

```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Instalar dependências de desenvolvimento da raiz**

```bash
pnpm add -Dw typescript@~6.0.3 turbo vitest eslint @eslint/js typescript-eslint eslint-plugin-astro globals prettier prettier-plugin-astro @types/node@^24
```

Expected: `pnpm-lock.yaml` criado, sem erro de peer dependency bloqueante (avisos de peers opcionais como `eslint-plugin-jsx-a11y` podem ser ignorados).

- [ ] **Step 5: Verificar que lint, testes e typecheck rodam no workspace vazio**

```bash
pnpm format && pnpm lint && pnpm test && pnpm typecheck
```

Expected: tudo termina com código 0 (`vitest` informa que não há testes e passa por `passWithNoTests`; `turbo` informa 0 tarefas).

- [ ] **Step 6: Commit**

```bash
git add .mise.toml .node-version package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.js prettier.config.mjs .prettierignore vitest.config.ts .gitignore .editorconfig
git commit -m "chore: cria esqueleto do monorepo com pnpm, turbo, eslint, prettier e vitest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: API Hono com `/api/health`

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/config.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/server.ts`, `apps/api/src/lambda.ts`
- Test: `apps/api/test/config.test.ts`, `apps/api/test/app.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` (Task 1).
- Produces:
  - `type Environment = 'local' | 'dev' | 'prod'`
  - `interface AppConfig { environment: Environment; version: string }`
  - `loadConfig(env?: NodeJS.ProcessEnv): AppConfig` — lê `APP_ENV` (padrão `local`) e `APP_VERSION` (padrão `0.0.0-local`); lança `Error('Invalid APP_ENV "<valor>". Expected local, dev or prod.')`.
  - `createApp(config: AppConfig)` — app Hono com `basePath('/api')`; `GET /api/health` → `200 { status: 'ok', environment, version }`; rota desconhecida → `404 { error: { code: 'not_found', message: 'Rota não encontrada.' } }`; erro não tratado → `500 { error: { code: 'internal_error', message: 'Algo deu errado do nosso lado. Tenta de novo daqui a pouco.' } }`.
  - Servidor local na porta `PORT` (padrão `3001`); bundle Lambda em `apps/api/dist/lambda.mjs` exportando `handler`.

- [ ] **Step 1: Criar o pacote**

`apps/api/package.json`:

```json
{
  "name": "@egt/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.ts",
    "build": "esbuild src/lambda.ts --bundle --platform=node --target=node24 --format=esm --sourcemap --outfile=dist/lambda.mjs",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`apps/api/vitest.config.ts`:

```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'api' },
});
```

Atualize `vitest.config.ts` (raiz):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ['apps/api'],
  },
});
```

Instale as dependências:

```bash
pnpm --filter @egt/api add hono @hono/node-server
pnpm --filter @egt/api add -D esbuild typescript@~6.0.3 @types/node@^24
```

- [ ] **Step 2: Escrever os testes que falham**

`apps/api/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('uses local defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({ environment: 'local', version: '0.0.0-local' });
  });

  it('reads APP_ENV and APP_VERSION', () => {
    expect(loadConfig({ APP_ENV: 'prod', APP_VERSION: '1.2.3' })).toEqual({
      environment: 'prod',
      version: '1.2.3',
    });
  });

  it('rejects unknown environments', () => {
    expect(() => loadConfig({ APP_ENV: 'staging' })).toThrow(
      'Invalid APP_ENV "staging". Expected local, dev or prod.',
    );
  });
});
```

`apps/api/test/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';

const app = createApp({ environment: 'local', version: '9.9.9' });

describe('GET /api/health', () => {
  it('reports status, environment and version', async () => {
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', environment: 'local', version: '9.9.9' });
  });
});

describe('unknown routes', () => {
  it('answer 404 with a pt-BR error payload', async () => {
    const res = await app.request('/api/nao-existe');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Rota não encontrada.' },
    });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test`
Expected: FAIL — `Failed to load url ../src/config.ts` / `../src/app.ts` (arquivos ainda não existem).

- [ ] **Step 4: Implementar**

`apps/api/src/config.ts`:

```ts
export type Environment = 'local' | 'dev' | 'prod';

export interface AppConfig {
  environment: Environment;
  version: string;
}

const ENVIRONMENTS: readonly string[] = ['local', 'dev', 'prod'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = env.APP_ENV ?? 'local';
  if (!isEnvironment(environment)) {
    throw new Error(`Invalid APP_ENV "${environment}". Expected local, dev or prod.`);
  }
  return { environment, version: env.APP_VERSION ?? '0.0.0-local' };
}

function isEnvironment(value: string): value is Environment {
  return ENVIRONMENTS.includes(value);
}
```

`apps/api/src/routes/health.ts`:

```ts
import { Hono } from 'hono';
import type { AppConfig } from '../config.ts';

export function healthRoutes(config: AppConfig) {
  return new Hono().get('/', (c) =>
    c.json({ status: 'ok', environment: config.environment, version: config.version }),
  );
}
```

`apps/api/src/app.ts`:

```ts
import { Hono } from 'hono';
import type { AppConfig } from './config.ts';
import { healthRoutes } from './routes/health.ts';

export function createApp(config: AppConfig) {
  const app = new Hono().basePath('/api');

  app.route('/health', healthRoutes(config));

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: 'Rota não encontrada.' } }, 404),
  );

  app.onError((err, c) => {
    console.error(JSON.stringify({ level: 'error', message: 'unhandled_error', error: err.message }));
    return c.json(
      {
        error: {
          code: 'internal_error',
          message: 'Algo deu errado do nosso lado. Tenta de novo daqui a pouco.',
        },
      },
      500,
    );
  });

  return app;
}
```

`apps/api/src/server.ts`:

```ts
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: createApp(loadConfig()).fetch, port }, (info) => {
  console.log(`API local em http://localhost:${info.port}/api/health`);
});
```

`apps/api/src/lambda.ts`:

```ts
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

export const handler = handle(createApp(loadConfig()));
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test`
Expected: PASS — 4 testes no projeto `api`.

- [ ] **Step 6: Verificar typecheck, build e servidor local**

```bash
pnpm --filter @egt/api typecheck
pnpm --filter @egt/api build && ls -la apps/api/dist/lambda.mjs
(pnpm --filter @egt/api dev > /tmp/egt-api.log 2>&1 &) ; sleep 3
curl -s http://localhost:3001/api/health
pkill -f "node --watch src/server.ts"
```

Expected: typecheck sem erros; `dist/lambda.mjs` existe; `curl` imprime `{"status":"ok","environment":"local","version":"0.0.0-local"}`. Se a API do `@hono/node-server` 2.x tiver mudado a assinatura de `serve`, ajuste `server.ts` conforme o README do pacote mantendo o mesmo comportamento.

- [ ] **Step 7: Lint e commit**

```bash
pnpm format && pnpm lint
git add apps/api vitest.config.ts pnpm-lock.yaml
git commit -m "feat(api): adiciona API Hono com /api/health, servidor local e handler Lambda" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Site Astro "Em breve" com e2e, acessibilidade e orçamento de desempenho

**Files:**
- Create: `apps/web/package.json`, `apps/web/astro.config.mjs`, `apps/web/tsconfig.json`, `apps/web/src/layouts/Base.astro`, `apps/web/src/pages/index.astro`, `apps/web/src/pages/404.astro`, `apps/web/src/pages/robots.txt.ts`, `apps/web/src/styles/global.css`, `apps/web/public/favicon.svg`, `apps/web/playwright.config.ts`, `apps/web/lighthouserc.json`
- Test: `apps/web/e2e/home.spec.ts`

**Interfaces:**
- Consumes: API local em `http://localhost:3001` (Task 2) via proxy `/api` no `astro dev`.
- Produces: build estático em `apps/web/dist/` (formato diretório, CSS externo em `_astro/`); variáveis de build `SITE_URL` (URL canônica) e `SITE_ENV` (`local` | `dev` | `prod`, via `astro:env`; fora de `prod` as páginas são `noindex` e o `robots.txt` bloqueia tudo); `404.html`; scripts `dev`, `build`, `preview`, `typecheck`, `test:e2e`, `lighthouse`.

- [ ] **Step 1: Criar o pacote e instalar dependências**

`apps/web/package.json`:

```json
{
  "name": "@egt/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "typecheck": "astro check",
    "test:e2e": "playwright test",
    "lighthouse": "lhci autorun"
  }
}
```

```bash
pnpm --filter @egt/web add astro
pnpm --filter @egt/web add -D @astrojs/check typescript@~6.0.3 @types/node@^24 @playwright/test @axe-core/playwright @lhci/cli
pnpm --filter @egt/web exec playwright install chromium webkit
```

Se o WebKit reclamar de bibliotecas do sistema, peça ao mantenedor para rodar `! sudo pnpm --filter @egt/web exec playwright install-deps webkit chromium`.

`apps/web/astro.config.mjs`:

```js
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'ignore',
  // CSS sempre em arquivo externo: a CSP do CloudFront não permite <style> inline.
  build: { format: 'directory', inlineStylesheets: 'never' },
  compressHTML: true,
  env: {
    schema: {
      SITE_ENV: envField.enum({
        context: 'server',
        access: 'public',
        values: ['local', 'dev', 'prod'],
        default: 'local',
      }),
    },
  },
  vite: {
    server: { proxy: { '/api': 'http://localhost:3001' } },
  },
});
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

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
  webServer: {
    command: 'pnpm preview --port 4322',
    url: 'http://localhost:4322',
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: Escrever o teste e2e que falha**

`apps/web/e2e/home.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home introduces the school in pt-BR', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Escola Grátis de Tecnologia');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Aprenda tecnologia de graça',
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /grátis/i);
});

test('home has no accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});

test('home stays within the 30 KB JavaScript budget', async ({ page }) => {
  let scriptBytes = 0;
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'script') {
      scriptBytes += (await response.body()).length;
    }
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  expect(scriptBytes).toBeLessThanOrEqual(30 * 1024);
});

test('unknown routes show the friendly 404 page', async ({ page }) => {
  const response = await page.goto('/nao-existe');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Página não encontrada');
  await expect(page.getByRole('link', { name: 'Voltar para o início' })).toHaveAttribute(
    'href',
    '/',
  );
});

test('robots.txt is served as plain text', async ({ request }) => {
  const response = await request.get('/robots.txt');

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('User-agent: *');
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @egt/web build; pnpm --filter @egt/web test:e2e`
Expected: FAIL — o build não encontra páginas (`src/pages` vazio) ou os testes falham por título/heading ausentes.

- [ ] **Step 4: Implementar as páginas, o layout e os estilos**

`apps/web/src/styles/global.css`:

```css
:root {
  color-scheme: light dark;
  --color-bg: #ffffff;
  --color-fg: #14141f;
  --color-muted: #4a4a5a;
  --color-accent: #5b21b6;
  --color-accent-fg: #ffffff;
  --font-body: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2.5rem;
  --radius: 0.75rem;
  --max-width: 40rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0b0b12;
    --color-fg: #f2f2f7;
    --color-muted: #b4b4c4;
    --color-accent: #c4b5fd;
    --color-accent-fg: #14141f;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-body);
  font-size: 1.125rem;
  line-height: 1.6;
}

a {
  color: var(--color-accent);
  text-underline-offset: 0.2em;
}

a:focus-visible {
  outline: 3px solid var(--color-accent);
  outline-offset: 2px;
}

.page {
  flex: 1;
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-5) var(--space-3);
}

.badge {
  display: inline-block;
  margin: 0 0 var(--space-3);
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-fg);
  font-size: 0.875rem;
  font-weight: 700;
}

h1 {
  margin: 0 0 var(--space-3);
  font-size: clamp(1.75rem, 6vw, 2.75rem);
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.lead {
  margin: 0 0 var(--space-4);
  color: var(--color-muted);
}

.points {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.points li {
  padding: var(--space-3);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--color-accent) 8%, var(--color-bg));
}

.footer {
  padding: var(--space-4) var(--space-3);
  color: var(--color-muted);
  font-size: 0.875rem;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

`apps/web/src/layouts/Base.astro`:

```astro
---
import { SITE_ENV } from 'astro:env/server';
import '../styles/global.css';

interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
const canonical = new URL(Astro.url.pathname, Astro.site);
const indexable = SITE_ENV === 'prod';
---

<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    {!indexable && <meta name="robots" content="noindex, nofollow" />}
    <meta name="theme-color" content="#5b21b6" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0b0b12" media="(prefers-color-scheme: dark)" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:site_name" content="Escola Grátis de Tecnologia" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
  </head>
  <body>
    <slot />
  </body>
</html>
```

`apps/web/src/pages/index.astro`:

```astro
---
import Base from '../layouts/Base.astro';
---

<Base
  title="Escola Grátis de Tecnologia"
  description="Microcursos grátis de tecnologia, feitos pro celular, com certificado verificável. Aprenda e saia resolvendo um problema de verdade."
>
  <main class="page">
    <p class="badge">Em breve</p>
    <h1>Aprenda tecnologia de graça e saia resolvendo um problema de verdade.</h1>
    <p class="lead">
      Microcursos com aulas de 2 a 5 minutos, feitos pra rodar no seu celular, com certificado que
      qualquer pessoa consegue conferir.
    </p>
    <ul class="points">
      <li><strong>100% grátis</strong>, sempre. Sem pegadinha.</li>
      <li><strong>Mão na massa</strong>: todo curso termina num projeto real.</li>
      <li><strong>Certificado verificável</strong> pra mostrar no LinkedIn.</li>
    </ul>
  </main>
  <footer class="footer">
    <p>
      Projeto beneficente e de código aberto.
      <a href="https://github.com/engelmannlabs/escolagratisdetecnologia">Veja o código no GitHub</a>.
    </p>
  </footer>
</Base>
```

`apps/web/src/pages/404.astro`:

```astro
---
import Base from '../layouts/Base.astro';
---

<Base
  title="Página não encontrada · Escola Grátis de Tecnologia"
  description="Essa página não existe. Volte para o início da Escola Grátis de Tecnologia."
>
  <main class="page">
    <h1>Página não encontrada</h1>
    <p class="lead">O link pode estar quebrado ou a página mudou de lugar.</p>
    <p><a href="/">Voltar para o início</a></p>
  </main>
</Base>
```

`apps/web/src/pages/robots.txt.ts`:

```ts
import type { APIRoute } from 'astro';
import { SITE_ENV } from 'astro:env/server';

export const GET: APIRoute = () => {
  const body = SITE_ENV === 'prod' ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
```

`apps/web/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#5b21b6"/><text x="32" y="44" font-family="system-ui, sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="#ffffff">E</text></svg>
```

`apps/web/lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./dist",
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.95 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.95 }],
        "categories:seo": ["error", { "minScore": 0.95 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2000 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.05 }]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": ".lighthouseci"
    }
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
SITE_ENV=prod SITE_URL=https://escolagratisdetecnologia.com pnpm --filter @egt/web build
pnpm --filter @egt/web test:e2e
```

Expected: PASS — 5 testes × 2 dispositivos (`android`, `iphone`) = 10 passed. Astro 7 usa compilador estrito: se o build acusar tag não fechada, feche-a.

- [ ] **Step 6: Typecheck, Lighthouse e `pnpm dev` completo**

```bash
pnpm --filter @egt/web typecheck
pnpm --filter @egt/web lighthouse   # requer Chrome/Chromium instalado; se não houver, registre que roda só na CI
(pnpm dev > /tmp/egt-dev.log 2>&1 &) ; sleep 8
curl -s http://localhost:4321/ | grep -o 'Aprenda tecnologia de graça'
curl -s http://localhost:4321/api/health
pkill -f "turbo run dev"; pkill -f "astro dev"; pkill -f "node --watch src/server.ts"
```

Expected: `astro check` com 0 erros; Lighthouse sem asserções falhando; o primeiro `curl` imprime `Aprenda tecnologia de graça`; o segundo imprime o JSON de saúde da API (via proxy). Este é o critério "pnpm dev mostra página e /api/health" da Fase 0.

- [ ] **Step 7: Lint e commit**

```bash
pnpm format && pnpm lint
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): adiciona página Em breve em Astro com e2e, axe e Lighthouse" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `check-tags` — valida tags no plano Terraform

**Files:**
- Create: `tools/check-tags/package.json`, `tools/check-tags/tsconfig.json`, `tools/check-tags/vitest.config.ts`, `tools/check-tags/src/rules.ts`, `tools/check-tags/src/check-tags.ts`, `tools/check-tags/src/cli.ts`
- Test: `tools/check-tags/test/check-tags.test.ts`, `tools/check-tags/test/cli.test.ts`, `tools/check-tags/test/fixtures/plan-ok.json`, `tools/check-tags/test/fixtures/plan-bad.json`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces:
  - `REQUIRED_TAGS` (mapa chave → valores permitidos, igual às Global Constraints) e `type TagRules = Readonly<Record<string, readonly string[]>>`.
  - `findTagViolations(plan: TerraformPlan, rules?: TagRules): TagViolation[]` onde `TagViolation = { address: string; missing: string[]; invalid: { key: string; value: string }[]; unknown: boolean }`.
  - `formatViolations(violations: TagViolation[]): string` (pt-BR).
  - CLI: `node tools/check-tags/src/cli.ts <plano.json>` → saída 0 (ok), 1 (violações), 2 (uso incorreto). Usado pelo workflow `infra.yml` (Task 10).

- [ ] **Step 1: Criar o pacote**

`tools/check-tags/package.json`:

```json
{
  "name": "@egt/check-tags",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`tools/check-tags/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`tools/check-tags/vitest.config.ts`:

```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'check-tags' },
});
```

Atualize `vitest.config.ts` (raiz) para `projects: ['apps/api', 'tools/check-tags']`.

```bash
pnpm --filter @egt/check-tags add -D typescript@~6.0.3 @types/node@^24
```

- [ ] **Step 2: Escrever os testes que falham**

`tools/check-tags/test/check-tags.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findTagViolations, formatViolations, type ResourceChange } from '../src/check-tags.ts';

const VALID = {
  Project: 'escola-gratis-de-tecnologia',
  Environment: 'dev',
  Component: 'site',
  ManagedBy: 'terraform',
  Repository: 'github.com/engelmannlabs/escolagratisdetecnologia',
};

function change(
  address: string,
  after: Record<string, unknown> | null,
  overrides: Partial<ResourceChange['change']> = {},
  mode: ResourceChange['mode'] = 'managed',
): ResourceChange {
  return { address, mode, change: { actions: ['create'], after, after_unknown: {}, ...overrides } };
}

describe('findTagViolations', () => {
  it('accepts resources carrying every required tag with allowed values', () => {
    const plan = { resource_changes: [change('aws_s3_bucket.site', { tags_all: VALID })] };

    expect(findTagViolations(plan)).toEqual([]);
  });

  it('reports missing required tags', () => {
    const { Component: _omitted, ...withoutComponent } = VALID;
    const plan = {
      resource_changes: [change('module.site.aws_s3_bucket.site', { tags_all: withoutComponent })],
    };

    expect(findTagViolations(plan)).toEqual([
      { address: 'module.site.aws_s3_bucket.site', missing: ['Component'], invalid: [], unknown: false },
    ]);
  });

  it('reports values outside the allowed list', () => {
    const plan = {
      resource_changes: [
        change('aws_s3_bucket.site', { tags_all: { ...VALID, Environment: 'staging' } }),
      ],
    };

    expect(findTagViolations(plan)).toEqual([
      {
        address: 'aws_s3_bucket.site',
        missing: [],
        invalid: [{ key: 'Environment', value: 'staging' }],
        unknown: false,
      },
    ]);
  });

  it('treats a null tags_all as every tag missing', () => {
    const plan = { resource_changes: [change('aws_iam_role.github', { tags_all: null })] };

    expect(findTagViolations(plan)).toEqual([
      {
        address: 'aws_iam_role.github',
        missing: ['Project', 'Environment', 'Component', 'ManagedBy', 'Repository'],
        invalid: [],
        unknown: false,
      },
    ]);
  });

  it('skips resources that do not support tags', () => {
    const plan = { resource_changes: [change('aws_s3_bucket_policy.site', { policy: '{}' })] };

    expect(findTagViolations(plan)).toEqual([]);
  });

  it('skips data sources and pure deletions', () => {
    const plan = {
      resource_changes: [
        change('data.aws_caller_identity.current', { tags_all: {} }, {}, 'data'),
        change('aws_s3_bucket.old', null, { actions: ['delete'] }),
      ],
    };

    expect(findTagViolations(plan)).toEqual([]);
  });

  it('flags tags that stay unknown until apply', () => {
    const plan = {
      resource_changes: [change('aws_s3_bucket.site', {}, { after_unknown: { tags_all: true } })],
    };

    expect(findTagViolations(plan)).toEqual([
      { address: 'aws_s3_bucket.site', missing: [], invalid: [], unknown: true },
    ]);
  });

  it('handles plans without resource changes', () => {
    expect(findTagViolations({})).toEqual([]);
  });
});

describe('formatViolations', () => {
  it('lists every resource with its problems in pt-BR', () => {
    const text = formatViolations([
      {
        address: 'aws_s3_bucket.site',
        missing: ['Component'],
        invalid: [{ key: 'Environment', value: 'staging' }],
        unknown: false,
      },
      { address: 'aws_iam_role.github', missing: [], invalid: [], unknown: true },
    ]);

    expect(text).toBe(
      [
        'Recursos fora do padrão de tags (veja infra/CLAUDE.md, seção Tags):',
        '- aws_s3_bucket.site: faltando Component; Environment="staging" não permitido',
        '- aws_iam_role.github: tags_all só será conhecido no apply (use valores estáticos nas tags)',
      ].join('\n'),
    );
  });
});
```

`tools/check-tags/test/fixtures/plan-ok.json`:

```json
{
  "resource_changes": [
    {
      "address": "module.site.aws_s3_bucket.site",
      "mode": "managed",
      "change": {
        "actions": ["create"],
        "after": {
          "tags_all": {
            "Project": "escola-gratis-de-tecnologia",
            "Environment": "prod",
            "Component": "site",
            "ManagedBy": "terraform",
            "Repository": "github.com/engelmannlabs/escolagratisdetecnologia",
            "DataClassification": "public"
          }
        },
        "after_unknown": {}
      }
    }
  ]
}
```

`tools/check-tags/test/fixtures/plan-bad.json`:

```json
{
  "resource_changes": [
    {
      "address": "module.edge.aws_cloudfront_distribution.this",
      "mode": "managed",
      "change": {
        "actions": ["create"],
        "after": {
          "tags_all": {
            "Project": "escola-gratis-de-tecnologia",
            "Environment": "prod",
            "ManagedBy": "terraform",
            "Repository": "github.com/engelmannlabs/escolagratisdetecnologia"
          }
        },
        "after_unknown": {}
      }
    }
  ]
}
```

`tools/check-tags/test/cli.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

describe('check-tags CLI', () => {
  it('exits 0 when every resource is compliant', () => {
    const result = run(fixture('plan-ok.json'));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Tags OK');
  });

  it('exits 1 and explains the violations', () => {
    const result = run(fixture('plan-bad.json'));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('- module.edge.aws_cloudfront_distribution.this: faltando Component');
  });

  it('exits 2 when the plan path is missing', () => {
    const result = run();

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Uso: node tools/check-tags/src/cli.ts <plano.json>');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test`
Expected: FAIL — módulos `../src/check-tags.ts` e `../src/cli.ts` não encontrados.

- [ ] **Step 4: Implementar**

`tools/check-tags/src/rules.ts`:

```ts
export type TagRules = Readonly<Record<string, readonly string[]>>;

export const REQUIRED_TAGS: TagRules = {
  Project: ['escola-gratis-de-tecnologia'],
  Environment: ['dev', 'prod', 'shared'],
  Component: [
    'edge',
    'site',
    'api',
    'data',
    'auth',
    'media',
    'jobs',
    'certificates',
    'observability',
    'bootstrap',
  ],
  ManagedBy: ['terraform', 'app'],
  Repository: ['github.com/engelmannlabs/escolagratisdetecnologia'],
};
```

`tools/check-tags/src/check-tags.ts`:

```ts
import { REQUIRED_TAGS, type TagRules } from './rules.ts';

export interface ResourceChange {
  address: string;
  mode: 'managed' | 'data';
  change: {
    actions: string[];
    after: Record<string, unknown> | null;
    after_unknown?: Record<string, unknown>;
  };
}

export interface TerraformPlan {
  resource_changes?: ResourceChange[];
}

export interface TagViolation {
  address: string;
  missing: string[];
  invalid: { key: string; value: string }[];
  unknown: boolean;
}

export function findTagViolations(
  plan: TerraformPlan,
  rules: TagRules = REQUIRED_TAGS,
): TagViolation[] {
  const violations: TagViolation[] = [];

  for (const rc of plan.resource_changes ?? []) {
    const { after, actions, after_unknown } = rc.change;
    if (rc.mode !== 'managed' || after === null || isDeleteOnly(actions)) continue;

    if (after_unknown?.['tags_all'] === true) {
      violations.push({ address: rc.address, missing: [], invalid: [], unknown: true });
      continue;
    }
    if (!('tags_all' in after)) continue;

    const tags = (after['tags_all'] ?? {}) as Record<string, string>;
    const missing = Object.keys(rules).filter((key) => !(key in tags));
    const invalid = Object.entries(rules)
      .filter(([key, allowed]) => key in tags && !allowed.includes(tags[key] ?? ''))
      .map(([key]) => ({ key, value: tags[key] ?? '' }));

    if (missing.length > 0 || invalid.length > 0) {
      violations.push({ address: rc.address, missing, invalid, unknown: false });
    }
  }

  return violations;
}

export function formatViolations(violations: TagViolation[]): string {
  const lines = violations.map((violation) => {
    if (violation.unknown) {
      return `- ${violation.address}: tags_all só será conhecido no apply (use valores estáticos nas tags)`;
    }
    const problems = [
      ...violation.missing.map((key) => `faltando ${key}`),
      ...violation.invalid.map(({ key, value }) => `${key}="${value}" não permitido`),
    ];
    return `- ${violation.address}: ${problems.join('; ')}`;
  });
  return ['Recursos fora do padrão de tags (veja infra/CLAUDE.md, seção Tags):', ...lines].join(
    '\n',
  );
}

function isDeleteOnly(actions: string[]): boolean {
  return actions.length === 1 && actions[0] === 'delete';
}
```

`tools/check-tags/src/cli.ts`:

```ts
import { readFileSync } from 'node:fs';
import { findTagViolations, formatViolations, type TerraformPlan } from './check-tags.ts';

const [planPath] = process.argv.slice(2);

if (!planPath) {
  console.error('Uso: node tools/check-tags/src/cli.ts <plano.json>');
  process.exit(2);
}

const plan = JSON.parse(readFileSync(planPath, 'utf8')) as TerraformPlan;
const violations = findTagViolations(plan);

if (violations.length > 0) {
  console.error(formatViolations(violations));
  process.exit(1);
}

console.log('Tags OK: todos os recursos tagueáveis têm as tags obrigatórias.');
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test && pnpm --filter @egt/check-tags typecheck`
Expected: PASS — 9 testes de `check-tags.test.ts` + 3 de `cli.test.ts` (mais os 4 da API).

- [ ] **Step 6: Lint e commit**

```bash
pnpm format && pnpm lint
git add tools/check-tags vitest.config.ts pnpm-lock.yaml
git commit -m "feat(tools): adiciona check-tags para validar tags no plano Terraform" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `tag-audit` — relatório semanal de recursos sem a tag `Project`

**Files:**
- Create: `tools/tag-audit/package.json`, `tools/tag-audit/tsconfig.json`, `tools/tag-audit/vitest.config.ts`, `tools/tag-audit/ignore.json`, `tools/tag-audit/src/tag-audit.ts`, `tools/tag-audit/src/cli.ts`
- Test: `tools/tag-audit/test/tag-audit.test.ts`, `tools/tag-audit/test/cli.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: saída JSON de `aws resource-explorer-2 search --query-string "-tag.key:Project"` (`{ Resources: [{ Arn, ResourceType, Region, OwningAccountId }] }`).
- Produces:
  - `findUntaggedResources(output: SearchOutput, ignore: IgnoreRules): ExplorerResource[]`
  - `formatReport(environment: string, resources: ExplorerResource[]): string` (Markdown pt-BR)
  - CLI: `node tools/tag-audit/src/cli.ts <ambiente> < busca.json` → imprime relatório; saída 0 (nada encontrado), 1 (encontrou), 2 (uso incorreto). Usado por `auditoria-tags.yml` (Task 10).

- [ ] **Step 1: Criar o pacote**

`tools/tag-audit/package.json`:

```json
{
  "name": "@egt/tag-audit",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`tools/tag-audit/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`tools/tag-audit/vitest.config.ts`:

```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'tag-audit' },
});
```

`tools/tag-audit/ignore.json` (recursos padrão da AWS que não criamos nem tagueamos):

```json
{
  "resourceTypes": [
    "ec2:vpc",
    "ec2:subnet",
    "ec2:security-group",
    "ec2:security-group-rule",
    "ec2:route-table",
    "ec2:network-acl",
    "ec2:dhcp-options",
    "ec2:internet-gateway"
  ],
  "arnPatterns": [
    ":role/aws-service-role/",
    ":role/aws-reserved/",
    ":role/OrganizationAccountAccessRole$"
  ]
}
```

Atualize `vitest.config.ts` (raiz) para `projects: ['apps/api', 'tools/check-tags', 'tools/tag-audit']`.

```bash
pnpm --filter @egt/tag-audit add -D typescript@~6.0.3 @types/node@^24
```

- [ ] **Step 2: Escrever os testes que falham**

`tools/tag-audit/test/tag-audit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findUntaggedResources, formatReport, type IgnoreRules } from '../src/tag-audit.ts';

const ignore: IgnoreRules = {
  resourceTypes: ['ec2:vpc'],
  arnPatterns: [':role/aws-service-role/'],
};

describe('findUntaggedResources', () => {
  it('keeps resources that are not ignored', () => {
    const bucket = { Arn: 'arn:aws:s3:::egt-dev-site-123', ResourceType: 's3:bucket', Region: 'sa-east-1' };

    expect(findUntaggedResources({ Resources: [bucket] }, ignore)).toEqual([bucket]);
  });

  it('drops ignored resource types and ARN patterns', () => {
    const output = {
      Resources: [
        { Arn: 'arn:aws:ec2:sa-east-1:123:vpc/vpc-1', ResourceType: 'ec2:vpc', Region: 'sa-east-1' },
        {
          Arn: 'arn:aws:iam::123:role/aws-service-role/ops.apigateway.amazonaws.com/AWSServiceRoleForAPIGateway',
          ResourceType: 'iam:role',
          Region: 'global',
        },
      ],
    };

    expect(findUntaggedResources(output, ignore)).toEqual([]);
  });

  it('handles an empty search result', () => {
    expect(findUntaggedResources({}, ignore)).toEqual([]);
  });
});

describe('formatReport', () => {
  it('says everything is fine when nothing was found', () => {
    expect(formatReport('dev', [])).toBe('Nenhum recurso sem a tag Project em dev.');
  });

  it('renders a Markdown table with type, region and ARN', () => {
    const report = formatReport('prod', [
      { Arn: 'arn:aws:s3:::x', ResourceType: 's3:bucket', Region: 'sa-east-1' },
    ]);

    expect(report).toContain('## Recursos sem a tag `Project` em prod');
    expect(report).toContain('| s3:bucket | sa-east-1 | `arn:aws:s3:::x` |');
    expect(report).toContain('tools/tag-audit/ignore.json');
  });
});
```

`tools/tag-audit/test/cli.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

function run(args: string[], input: string) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input });
}

describe('tag-audit CLI', () => {
  it('exits 0 when the search finds only ignored resources', () => {
    const input = JSON.stringify({
      Resources: [{ Arn: 'arn:aws:ec2:sa-east-1:1:vpc/vpc-1', ResourceType: 'ec2:vpc' }],
    });

    const result = run(['dev'], input);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Nenhum recurso sem a tag Project em dev.');
  });

  it('exits 1 and prints the report when untagged resources exist', () => {
    const input = JSON.stringify({
      Resources: [{ Arn: 'arn:aws:s3:::solto', ResourceType: 's3:bucket', Region: 'sa-east-1' }],
    });

    const result = run(['prod'], input);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('| s3:bucket | sa-east-1 | `arn:aws:s3:::solto` |');
  });

  it('exits 2 without the environment argument', () => {
    const result = run([], '{}');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Uso: node tools/tag-audit/src/cli.ts <ambiente>');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test`
Expected: FAIL — `../src/tag-audit.ts` e `../src/cli.ts` não encontrados.

- [ ] **Step 4: Implementar**

`tools/tag-audit/src/tag-audit.ts`:

```ts
export interface ExplorerResource {
  Arn: string;
  ResourceType: string;
  Region?: string;
  OwningAccountId?: string;
}

export interface SearchOutput {
  Resources?: ExplorerResource[];
}

export interface IgnoreRules {
  resourceTypes: readonly string[];
  arnPatterns: readonly string[];
}

export function findUntaggedResources(
  output: SearchOutput,
  ignore: IgnoreRules,
): ExplorerResource[] {
  const patterns = ignore.arnPatterns.map((pattern) => new RegExp(pattern));
  return (output.Resources ?? []).filter(
    (resource) =>
      !ignore.resourceTypes.includes(resource.ResourceType) &&
      !patterns.some((pattern) => pattern.test(resource.Arn)),
  );
}

export function formatReport(environment: string, resources: ExplorerResource[]): string {
  if (resources.length === 0) return `Nenhum recurso sem a tag Project em ${environment}.`;
  return [
    `## Recursos sem a tag \`Project\` em ${environment}`,
    '',
    'Todo recurso do projeto precisa da tag `Project=escola-gratis-de-tecnologia` (ADR 0015).',
    'Corrija no Terraform ou, se for um recurso padrão da AWS que não criamos, adicione-o em `tools/tag-audit/ignore.json`.',
    '',
    '| Tipo | Região | ARN |',
    '|---|---|---|',
    ...resources.map((r) => `| ${r.ResourceType} | ${r.Region ?? '-'} | \`${r.Arn}\` |`),
  ].join('\n');
}
```

`tools/tag-audit/src/cli.ts`:

```ts
import { readFileSync } from 'node:fs';
import {
  findUntaggedResources,
  formatReport,
  type IgnoreRules,
  type SearchOutput,
} from './tag-audit.ts';

const [environment] = process.argv.slice(2);

if (!environment) {
  console.error('Uso: node tools/tag-audit/src/cli.ts <ambiente> < resultado-da-busca.json');
  process.exit(2);
}

const ignore = JSON.parse(
  readFileSync(new URL('../ignore.json', import.meta.url), 'utf8'),
) as IgnoreRules;
const output = JSON.parse(readFileSync(0, 'utf8')) as SearchOutput;
const untagged = findUntaggedResources(output, ignore);

console.log(formatReport(environment, untagged));
process.exit(untagged.length > 0 ? 1 : 0);
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test && pnpm --filter @egt/tag-audit typecheck`
Expected: PASS — 5 testes em `tag-audit.test.ts` + 3 em `cli.test.ts`.

- [ ] **Step 6: Lint e commit**

```bash
pnpm format && pnpm lint
git add tools/tag-audit vitest.config.ts pnpm-lock.yaml
git commit -m "feat(tools): adiciona tag-audit para relatório de recursos sem a tag Project" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Módulo Terraform `tags` e configuração do tflint

**Files:**
- Create: `infra/modules/tags/versions.tf`, `infra/modules/tags/variables.tf`, `infra/modules/tags/main.tf`, `infra/modules/tags/outputs.tf`, `infra/.tflint.hcl`
- Test: `infra/modules/tags/tests/tags.tftest.hcl`

**Interfaces:**
- Produces: `module "tags" { source = ".../modules/tags"; environment = "dev" | "prod" | "shared" }` com saídas:
  - `default_tags` = `{ Project = "escola-gratis-de-tecnologia", Environment = <env>, ManagedBy = "terraform", Repository = "github.com/engelmannlabs/escolagratisdetecnologia" }` (usada em `provider "aws" { default_tags { tags = module.tags.default_tags } }`)
  - `name_prefix` = `"egt-<env>"`

- [ ] **Step 1: Escrever o teste que falha**

`infra/modules/tags/tests/tags.tftest.hcl`:

```hcl
run "dev_tags" {
  command = plan

  variables {
    environment = "dev"
  }

  assert {
    condition = output.default_tags == {
      Project     = "escola-gratis-de-tecnologia"
      Environment = "dev"
      ManagedBy   = "terraform"
      Repository  = "github.com/engelmannlabs/escolagratisdetecnologia"
    }
    error_message = "default_tags fora do padrão para dev."
  }

  assert {
    condition     = output.name_prefix == "egt-dev"
    error_message = "name_prefix deveria ser egt-dev."
  }
}

run "shared_environment_is_allowed" {
  command = plan

  variables {
    environment = "shared"
  }

  assert {
    condition     = output.default_tags.Environment == "shared"
    error_message = "shared deveria ser aceito para a conta de gerenciamento."
  }
}

run "rejects_unknown_environment" {
  command = plan

  variables {
    environment = "staging"
  }

  expect_failures = [var.environment]
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `terraform -chdir=infra/modules/tags init -input=false && terraform -chdir=infra/modules/tags test`
Expected: FAIL — o módulo não declara `var.environment` nem as saídas.

- [ ] **Step 3: Implementar**

`infra/modules/tags/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10.0"
}
```

`infra/modules/tags/variables.tf`:

```hcl
variable "environment" {
  description = "Ambiente dos recursos: dev, prod ou shared (conta de gerenciamento)."
  type        = string

  validation {
    condition     = contains(["dev", "prod", "shared"], var.environment)
    error_message = "environment deve ser dev, prod ou shared."
  }
}
```

`infra/modules/tags/main.tf`:

```hcl
# Fonte única das tags padrão do projeto (ADR 0015). A tag Project identifica 100% dos
# recursos e custos da Escola; Component e DataClassification são definidas por cada módulo.
locals {
  project    = "escola-gratis-de-tecnologia"
  repository = "github.com/engelmannlabs/escolagratisdetecnologia"
}
```

`infra/modules/tags/outputs.tf`:

```hcl
output "default_tags" {
  description = "Tags aplicadas a todo recurso via default_tags do provider AWS."
  value = {
    Project     = local.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = local.repository
  }
}

output "name_prefix" {
  description = "Prefixo dos nomes de recursos: egt-<ambiente>."
  value       = "egt-${var.environment}"
}
```

`infra/.tflint.hcl`:

```hcl
config {
  call_module_type = "local"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "aws" {
  enabled = true
  version = "0.49.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

# Project, Environment, ManagedBy e Repository chegam via default_tags (checadas no plano pelo
# tools/check-tags). Aqui garantimos que cada recurso tagueável declare seu Component.
rule "aws_resource_missing_tags" {
  enabled = true
  tags    = ["Component"]
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
terraform -chdir=infra/modules/tags test
terraform fmt -check -recursive infra
cd infra && tflint --init --config "$PWD/.tflint.hcl" && tflint --recursive --config "$PWD/.tflint.hcl"; cd ..
```

Expected: `Success! 3 passed, 0 failed.`; `fmt` sem saída; tflint sem problemas.

- [ ] **Step 5: Commit**

```bash
git add infra/modules/tags infra/.tflint.hcl
git commit -m "feat(infra): adiciona módulo de tags padrão e configuração do tflint" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Módulos `site` e `edge` (S3, CloudFront, WAF, ACM, DNS e função de borda)

**Files:**
- Create: `infra/modules/site/{versions,variables,main,outputs}.tf`, `infra/modules/edge/{versions,variables,main,outputs}.tf`, `infra/modules/edge/functions/viewer-request.js`
- Test: `infra/modules/edge/functions/viewer-request.test.ts`, `infra/modules/edge/tests/edge.tftest.hcl`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `name_prefix` do módulo `tags` (Task 6).
- Produces:
  - `module "site"`: entrada `name_prefix`; saídas `bucket_id`, `bucket_arn`, `bucket_regional_domain_name`. Bucket `egt-<env>-site-<account_id>`, tags `Component=site`, `DataClassification=public`.
  - `module "edge"` (requer providers `aws` e `aws.us_east_1`): entradas `name_prefix`, `domain_name`, `redirect_www` (bool), `zone_id`, `site_bucket_id`, `site_bucket_arn`, `site_bucket_regional_domain_name`, `rate_limit_per_5min` (padrão 2000); saídas `distribution_id`, `distribution_arn`, `distribution_domain_name`.
  - Função CloudFront `viewer-request`: `www.<domínio>` → 301 para `https://<domínio><uri><query>`; `/x/` e `/x` → `/x/index.html`; arquivos (com `.` no último segmento) intactos.

- [ ] **Step 1: Escrever o teste da função de borda (falhando)**

Atualize `vitest.config.ts` (raiz):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      'apps/api',
      'tools/check-tags',
      'tools/tag-audit',
      { test: { name: 'infra', include: ['infra/**/*.test.ts'] } },
    ],
  },
});
```

`infra/modules/edge/functions/viewer-request.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type QueryString = Record<string, { value: string; multiValue?: { value: string }[] }>;
interface CfRequest {
  uri: string;
  headers: Record<string, { value: string }>;
  querystring: QueryString;
}

const source = readFileSync(new URL('./viewer-request.js', import.meta.url), 'utf8').replace(
  '__CANONICAL_HOST__',
  'escolagratisdetecnologia.com',
);
const handler = new Function(`${source}\nreturn handler;`)() as (event: {
  request: CfRequest;
}) => unknown;

function event(uri: string, host = 'escolagratisdetecnologia.com', querystring: QueryString = {}) {
  return { request: { uri, headers: { host: { value: host } }, querystring } };
}

describe('viewer-request', () => {
  it('serves index.html for the root path', () => {
    expect(handler(event('/'))).toMatchObject({ uri: '/index.html' });
  });

  it('serves index.html for directories with a trailing slash', () => {
    expect(handler(event('/cursos/'))).toMatchObject({ uri: '/cursos/index.html' });
  });

  it('serves index.html for directories without a trailing slash', () => {
    expect(handler(event('/cursos'))).toMatchObject({ uri: '/cursos/index.html' });
  });

  it('keeps file requests untouched', () => {
    expect(handler(event('/_astro/index.4f2a.css'))).toMatchObject({
      uri: '/_astro/index.4f2a.css',
    });
  });

  it('redirects www to the canonical host keeping path and query', () => {
    const result = handler(
      event('/cursos', 'www.escolagratisdetecnologia.com', {
        utm_source: { value: 'instagram' },
        tag: { value: 'a', multiValue: [{ value: 'a' }, { value: 'b' }] },
      }),
    );

    expect(result).toEqual({
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: {
          value: 'https://escolagratisdetecnologia.com/cursos?utm_source=instagram&tag=a&tag=b',
        },
      },
    });
  });

  it('does not redirect other hosts', () => {
    expect(handler(event('/', 'd111111abcdef8.cloudfront.net'))).toMatchObject({
      uri: '/index.html',
    });
  });
});
```

Run: `pnpm test`
Expected: FAIL — `ENOENT: no such file or directory ... viewer-request.js`.

- [ ] **Step 2: Implementar a função de borda**

`infra/modules/edge/functions/viewer-request.js`:

```js
// CloudFront Function (runtime cloudfront-js-2.0). __CANONICAL_HOST__ é substituído pelo
// Terraform com o domínio do ambiente.
var CANONICAL_HOST = '__CANONICAL_HOST__';

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';

  if (host === 'www.' + CANONICAL_HOST) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: {
          value: 'https://' + CANONICAL_HOST + request.uri + toQueryString(request.querystring),
        },
      },
    };
  }

  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.split('/').pop().indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}

function toQueryString(querystring) {
  var parts = [];
  Object.keys(querystring).forEach(function (key) {
    var entry = querystring[key];
    var values = entry.multiValue ? entry.multiValue : [entry];
    values.forEach(function (item) {
      parts.push(item.value === '' ? key : key + '=' + item.value);
    });
  });
  return parts.length > 0 ? '?' + parts.join('&') : '';
}
```

Run: `pnpm test`
Expected: PASS — 6 testes no projeto `infra`.

- [ ] **Step 3: Escrever o teste do módulo `edge` (falhando)**

O módulo `edge` usa um provider com alias, então `terraform validate` direto nele falha; ele é coberto por `terraform test` com providers simulados (e validado de verdade através da raiz `live`, Task 8).

`infra/modules/edge/tests/edge.tftest.hcl`:

```hcl
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_cloudfront_function" {
    defaults = {
      arn = "arn:aws:cloudfront::123456789012:function/egt-test-viewer-request"
    }
  }

  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn            = "arn:aws:cloudfront::123456789012:distribution/E1234567890"
      domain_name    = "d111111abcdef8.cloudfront.net"
      hosted_zone_id = "Z2FDTNDATAQYW2"
    }
  }
}

mock_provider "aws" {
  alias = "us_east_1"

  mock_resource "aws_wafv2_web_acl" {
    defaults = {
      arn = "arn:aws:wafv2:us-east-1:123456789012:global/webacl/egt-test-edge/0000"
    }
  }

  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
      domain_validation_options = [
        for domain in ["escolagratisdetecnologia.com", "www.escolagratisdetecnologia.com", "dev.escolagratisdetecnologia.com"] : {
          domain_name           = domain
          resource_record_name  = "_validacao.${domain}."
          resource_record_type  = "CNAME"
          resource_record_value = "_valor.acm-validations.aws."
        }
      ]
    }
  }
}

variables {
  name_prefix                      = "egt-test"
  zone_id                          = "Z0000000000000"
  site_bucket_id                   = "egt-test-site-123"
  site_bucket_arn                  = "arn:aws:s3:::egt-test-site-123"
  site_bucket_regional_domain_name = "egt-test-site-123.s3.sa-east-1.amazonaws.com"
}

run "prod_serves_apex_and_www" {
  command = apply

  variables {
    domain_name  = "escolagratisdetecnologia.com"
    redirect_www = true
  }

  assert {
    condition     = aws_cloudfront_distribution.site.aliases == toset(["escolagratisdetecnologia.com", "www.escolagratisdetecnologia.com"])
    error_message = "Prod deveria atender o domínio e o www."
  }

  assert {
    condition     = length(aws_route53_record.alias) == 4
    error_message = "Prod precisa de registros A e AAAA para o domínio e o www."
  }

  assert {
    condition     = strcontains(aws_cloudfront_function.viewer_request.code, "var CANONICAL_HOST = 'escolagratisdetecnologia.com';")
    error_message = "A função de borda deveria receber o domínio canônico."
  }
}

run "dev_serves_only_its_domain" {
  command = apply

  variables {
    domain_name = "dev.escolagratisdetecnologia.com"
  }

  assert {
    condition     = aws_cloudfront_distribution.site.aliases == toset(["dev.escolagratisdetecnologia.com"])
    error_message = "Dev não deveria atender www."
  }

  assert {
    condition     = length(aws_route53_record.alias) == 2
    error_message = "Dev precisa só de A e AAAA."
  }

  assert {
    condition     = length(aws_wafv2_web_acl.edge.rule) == 4
    error_message = "O WAF deveria ter 3 grupos gerenciados e o rate limit."
  }

  assert {
    condition     = aws_cloudfront_distribution.site.tags["Component"] == "edge"
    error_message = "Recursos do edge precisam da tag Component=edge."
  }
}
```

Run: `terraform -chdir=infra/modules/edge init -backend=false -input=false && terraform -chdir=infra/modules/edge test`
Expected: FAIL — o módulo ainda não existe (sem `versions.tf`/`main.tf`, as referências a `aws_cloudfront_distribution.site` não resolvem).

- [ ] **Step 4: Implementar o módulo `site`**

`infra/modules/site/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }
}
```

`infra/modules/site/variables.tf`:

```hcl
variable "name_prefix" {
  description = "Prefixo de nomes (egt-<ambiente>), vindo do módulo tags."
  type        = string
}
```

`infra/modules/site/main.tf`:

```hcl
data "aws_caller_identity" "current" {}

locals {
  tags = {
    Component          = "site"
    DataClassification = "public"
  }
}

# Conteúdo do site é reconstruído a cada deploy, então pode ser apagado junto com o bucket.
resource "aws_s3_bucket" "site" {
  bucket        = "${var.name_prefix}-site-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
  tags          = local.tags
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  depends_on = [aws_s3_bucket_versioning.site]
}
```

`infra/modules/site/outputs.tf`:

```hcl
output "bucket_id" {
  description = "Nome do bucket do site."
  value       = aws_s3_bucket.site.id
}

output "bucket_arn" {
  description = "ARN do bucket do site."
  value       = aws_s3_bucket.site.arn
}

output "bucket_regional_domain_name" {
  description = "Domínio regional do bucket, usado como origem do CloudFront."
  value       = aws_s3_bucket.site.bucket_regional_domain_name
}
```

- [ ] **Step 5: Implementar o módulo `edge`**

`infra/modules/edge/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 6.67"
      configuration_aliases = [aws.us_east_1]
    }
  }
}
```

`infra/modules/edge/variables.tf`:

```hcl
variable "name_prefix" {
  description = "Prefixo de nomes (egt-<ambiente>)."
  type        = string
}

variable "domain_name" {
  description = "Domínio canônico do site neste ambiente."
  type        = string
}

variable "redirect_www" {
  description = "Se true, atende www.<domínio> e redireciona para o domínio canônico."
  type        = bool
  default     = false
}

variable "zone_id" {
  description = "ID da zona Route 53 do domínio (criada no bootstrap)."
  type        = string
}

variable "site_bucket_id" {
  description = "Nome do bucket do site."
  type        = string
}

variable "site_bucket_arn" {
  description = "ARN do bucket do site."
  type        = string
}

variable "site_bucket_regional_domain_name" {
  description = "Domínio regional do bucket do site."
  type        = string
}

variable "rate_limit_per_5min" {
  description = "Máximo de requisições por IP a cada 5 minutos antes do bloqueio no WAF."
  type        = number
  default     = 2000
}
```

`infra/modules/edge/main.tf`:

```hcl
locals {
  tags    = { Component = "edge" }
  aliases = var.redirect_www ? [var.domain_name, "www.${var.domain_name}"] : [var.domain_name]
  validation = {
    for option in aws_acm_certificate.site.domain_validation_options : option.domain_name => option
  }
  managed_rule_groups = {
    "aws-common"           = { priority = 10, name = "AWSManagedRulesCommonRuleSet" }
    "aws-known-bad-inputs" = { priority = 20, name = "AWSManagedRulesKnownBadInputsRuleSet" }
    "aws-ip-reputation"    = { priority = 30, name = "AWSManagedRulesAmazonIpReputationList" }
  }
}

# --- Certificado TLS (CloudFront exige us-east-1) ---

resource "aws_acm_certificate" "site" {
  provider                  = aws.us_east_1
  domain_name               = var.domain_name
  subject_alternative_names = var.redirect_www ? ["www.${var.domain_name}"] : []
  validation_method         = "DNS"
  tags                      = local.tags

  lifecycle {
    create_before_destroy = true
  }
}

# Chaves estáticas (os domínios) para o for_each funcionar antes do certificado existir.
resource "aws_route53_record" "certificate_validation" {
  for_each = toset(local.aliases)

  zone_id         = var.zone_id
  name            = local.validation[each.key].resource_record_name
  type            = local.validation[each.key].resource_record_type
  records         = [local.validation[each.key].resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

# --- WAF (escopo CLOUDFRONT em us-east-1; obrigatório nos planos flat-rate) ---

resource "aws_wafv2_web_acl" "edge" {
  provider = aws.us_east_1
  name     = "${var.name_prefix}-edge"
  scope    = "CLOUDFRONT"
  tags     = local.tags

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups

    content {
      name     = rule.key
      priority = rule.value.priority

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.value.name
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name_prefix}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "rate-limit-ip"
    priority = 40

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5min
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-rate-limit-ip"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-edge"
    sampled_requests_enabled   = true
  }
}

# --- CloudFront ---

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name_prefix}-site"
  description                       = "Acesso do CloudFront ao bucket do site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "viewer_request" {
  name    = "${var.name_prefix}-viewer-request"
  runtime = "cloudfront-js-2.0"
  comment = "Redireciona www e resolve index.html de diretórios"
  publish = true
  code    = replace(file("${path.module}/functions/viewer-request.js"), "__CANONICAL_HOST__", var.domain_name)
  tags    = local.tags
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.name_prefix}-security-headers"
  comment = "Cabeçalhos de segurança da Escola"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    content_security_policy {
      content_security_policy = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
      override                = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), interest-cohort=()"
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = "PriceClass_All" # inclui pontos de presença na América do Sul
  comment             = "${var.name_prefix} site"
  aliases             = local.aliases
  default_root_object = "index.html"
  web_acl_id          = aws_wafv2_web_acl.edge.arn
  tags                = local.tags

  origin {
    origin_id                = "site"
    domain_name              = var.site_bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_request.arn
    }
  }

  # Sem s3:ListBucket, objeto inexistente responde 403; mostramos a página 404 do site.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_route53_record" "alias" {
  for_each = {
    for pair in setproduct(local.aliases, ["A", "AAAA"]) : "${pair[0]}-${pair[1]}" => {
      name = pair[0]
      type = pair[1]
    }
  }

  zone_id = var.zone_id
  name    = each.value.name
  type    = each.value.type

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

# --- Acesso do CloudFront ao bucket ---

data "aws_iam_policy_document" "site_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${var.site_bucket_arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [var.site_bucket_arn, "${var.site_bucket_arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = var.site_bucket_id
  policy = data.aws_iam_policy_document.site_bucket.json
}
```

`infra/modules/edge/outputs.tf`:

```hcl
output "distribution_id" {
  description = "ID da distribuição CloudFront (usado para invalidação)."
  value       = aws_cloudfront_distribution.site.id
}

output "distribution_arn" {
  description = "ARN da distribuição CloudFront."
  value       = aws_cloudfront_distribution.site.arn
}

output "distribution_domain_name" {
  description = "Domínio *.cloudfront.net da distribuição."
  value       = aws_cloudfront_distribution.site.domain_name
}
```

- [ ] **Step 6: Validar os módulos**

```bash
terraform fmt -recursive infra
terraform -chdir=infra/modules/site init -backend=false -input=false >/dev/null && terraform -chdir=infra/modules/site validate
terraform -chdir=infra/modules/edge test
cd infra && tflint --recursive --config "$PWD/.tflint.hcl"; cd ..
pnpm format && pnpm lint && pnpm test
```

Expected: `Success! The configuration is valid.` no `site`; `Success! 2 passed, 0 failed.` no teste do `edge`; tflint sem problemas (o `aws_resource_missing_tags` confirma `Component` nos recursos tagueáveis); lint e testes verdes.

- [ ] **Step 7: Commit**

```bash
git add infra/modules/site infra/modules/edge vitest.config.ts
git commit -m "feat(infra): adiciona módulos site e edge com CloudFront, WAF, ACM e função de borda" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Módulo `observability`, raiz `infra/live`, wrapper `infra/tf` e Infracost

**Files:**
- Create: `infra/modules/observability/{versions,variables,main,outputs}.tf`, `infra/live/{versions,providers,variables,main,outputs}.tf`, `infra/live/env/dev.tfvars`, `infra/live/env/dev.backend.hcl`, `infra/live/env/prod.tfvars`, `infra/live/env/prod.backend.hcl`, `infra/tf`, `infracost.yml`, `infra/infracost-usage.yml`

**Interfaces:**
- Consumes: módulos `tags`, `site`, `edge` (Tasks 6–7); zona Route 53 `var.domain_name` criada pelo bootstrap (Task 9).
- Produces:
  - `infra/tf <raiz> <ambiente> <comando> [args]` — roda `terraform init -reconfigure -backend-config=env/<ambiente>.backend.hcl` e repassa o comando, acrescentando `-var-file=env/<ambiente>.tfvars` em `plan|apply|destroy|import|console|refresh`. Sai com 2 sem argumentos suficientes e 1 para ambiente desconhecido.
  - Saídas da raiz `live`: `site_bucket_name`, `distribution_id`, `distribution_domain_name`, `site_url`.
  - Estado: bucket `escolagratis-tfstate-<env>`, chave `live/terraform.tfstate`, lock nativo.

- [ ] **Step 1: Escrever o teste do wrapper (falhando)**

Run:

```bash
infra/tf; echo "exit=$?"
infra/tf live staging plan; echo "exit=$?"
```

Expected: FAIL — `infra/tf: No such file or directory` (o wrapper não existe).

- [ ] **Step 2: Implementar o wrapper**

`infra/tf`:

```bash
#!/usr/bin/env bash
# Executa o Terraform numa raiz do projeto com o backend e as variáveis do ambiente.
# Uso: infra/tf <raiz> <ambiente> <comando> [argumentos...]
# Exemplos: infra/tf live dev plan · infra/tf bootstrap/account prod apply
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Uso: infra/tf <raiz> <ambiente> <comando> [argumentos...]" >&2
  exit 2
fi

root="$1"
environment="$2"
shift 2
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$root"

if [[ ! -f "$dir/env/$environment.tfvars" || ! -f "$dir/env/$environment.backend.hcl" ]]; then
  echo "Ambiente desconhecido para $root: $environment (esperado env/$environment.tfvars e env/$environment.backend.hcl)" >&2
  exit 1
fi

terraform -chdir="$dir" init -reconfigure -input=false -backend-config="env/$environment.backend.hcl" >/dev/null

command="$1"
shift
case "$command" in
  plan | apply | destroy | import | console | refresh)
    terraform -chdir="$dir" "$command" -var-file="env/$environment.tfvars" "$@"
    ;;
  *)
    terraform -chdir="$dir" "$command" "$@"
    ;;
esac
```

```bash
chmod +x infra/tf
infra/tf; echo "exit=$?"
infra/tf live staging plan; echo "exit=$?"
```

Expected: `Uso: infra/tf ...` e `exit=2`; depois `Ambiente desconhecido para live: staging ...` e `exit=1`.

- [ ] **Step 3: Implementar o módulo `observability`**

`infra/modules/observability/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }
}
```

`infra/modules/observability/variables.tf`:

```hcl
variable "name_prefix" {
  description = "Prefixo de nomes (egt-<ambiente>)."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Orçamento mensal da conta em USD."
  type        = number
}

variable "alert_emails" {
  description = "E-mails que recebem alertas de orçamento. Vazio desliga as notificações."
  type        = list(string)
  default     = []
}
```

`infra/modules/observability/main.tf`:

```hcl
locals {
  tags = { Component = "observability" }
  notifications = [
    { threshold = 50, type = "ACTUAL" },
    { threshold = 80, type = "ACTUAL" },
    { threshold = 100, type = "FORECASTED" },
  ]
}

# A conta é dedicada ao projeto, então o orçamento cobre a conta inteira (inclusive custos
# que a AWS não permite taguear).
resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = format("%.2f", var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  tags         = local.tags

  dynamic "notification" {
    for_each = length(var.alert_emails) > 0 ? local.notifications : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.threshold
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.type
      subscriber_email_addresses = var.alert_emails
    }
  }
}
```

`infra/modules/observability/outputs.tf`:

```hcl
output "budget_name" {
  description = "Nome do orçamento mensal."
  value       = aws_budgets_budget.monthly.name
}
```

- [ ] **Step 4: Implementar a raiz `infra/live`**

`infra/live/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }

  # Configurado por env/<ambiente>.backend.hcl (veja infra/tf).
  backend "s3" {}
}
```

`infra/live/providers.tf`:

```hcl
provider "aws" {
  region = "sa-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}
```

`infra/live/variables.tf`:

```hcl
variable "environment" {
  description = "Ambiente da aplicação: dev ou prod."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment deve ser dev ou prod."
  }
}

variable "domain_name" {
  description = "Domínio do site neste ambiente (a zona Route 53 é criada no bootstrap)."
  type        = string
}

variable "redirect_www" {
  description = "Atende www.<domínio> redirecionando para o domínio (somente prod)."
  type        = bool
  default     = false
}

variable "monthly_budget_usd" {
  description = "Orçamento mensal da conta em USD."
  type        = number
}

variable "alert_emails" {
  description = "E-mails de alerta. Defina via TF_VAR_alert_emails; nunca versione e-mails pessoais."
  type        = list(string)
  default     = []
}
```

`infra/live/main.tf`:

```hcl
module "tags" {
  source      = "../modules/tags"
  environment = var.environment
}

data "aws_route53_zone" "site" {
  name = var.domain_name
}

module "site" {
  source      = "../modules/site"
  name_prefix = module.tags.name_prefix
}

module "edge" {
  source = "../modules/edge"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix                      = module.tags.name_prefix
  domain_name                      = var.domain_name
  redirect_www                     = var.redirect_www
  zone_id                          = data.aws_route53_zone.site.zone_id
  site_bucket_id                   = module.site.bucket_id
  site_bucket_arn                  = module.site.bucket_arn
  site_bucket_regional_domain_name = module.site.bucket_regional_domain_name
}

module "observability" {
  source             = "../modules/observability"
  name_prefix        = module.tags.name_prefix
  monthly_budget_usd = var.monthly_budget_usd
  alert_emails       = var.alert_emails
}
```

`infra/live/outputs.tf`:

```hcl
output "site_bucket_name" {
  description = "Bucket que recebe o build do site."
  value       = module.site.bucket_id
}

output "distribution_id" {
  description = "Distribuição CloudFront do site."
  value       = module.edge.distribution_id
}

output "distribution_domain_name" {
  description = "Domínio *.cloudfront.net da distribuição."
  value       = module.edge.distribution_domain_name
}

output "site_url" {
  description = "URL pública do site neste ambiente."
  value       = "https://${var.domain_name}"
}
```

`infra/live/env/dev.tfvars`:

```hcl
environment        = "dev"
domain_name        = "dev.escolagratisdetecnologia.com"
redirect_www       = false
monthly_budget_usd = 20
```

`infra/live/env/dev.backend.hcl`:

```hcl
bucket       = "escolagratis-tfstate-dev"
key          = "live/terraform.tfstate"
region       = "sa-east-1"
encrypt      = true
use_lockfile = true
```

`infra/live/env/prod.tfvars`:

```hcl
environment        = "prod"
domain_name        = "escolagratisdetecnologia.com"
redirect_www       = true
monthly_budget_usd = 50
```

`infra/live/env/prod.backend.hcl`:

```hcl
bucket       = "escolagratis-tfstate-prod"
key          = "live/terraform.tfstate"
region       = "sa-east-1"
encrypt      = true
use_lockfile = true
```

- [ ] **Step 5: Configurar o Infracost**

`infracost.yml`:

```yaml
version: 0.1
projects:
  - path: infra/live
    name: live-dev
    terraform_var_files:
      - env/dev.tfvars
    usage_file: infra/infracost-usage.yml
  - path: infra/live
    name: live-prod
    terraform_var_files:
      - env/prod.tfvars
    usage_file: infra/infracost-usage.yml
```

`infra/infracost-usage.yml`:

```yaml
# Premissas de uso para a estimativa do Infracost (pay-as-you-go). O plano flat-rate do
# CloudFront (ADR 0004) não é modelado pelo Infracost: trate o valor de CloudFront/WAF como teto.
# Atualize estas premissas quando o padrão de uso mudar (ver infra/CLAUDE.md).
version: 0.1
resource_type_default_usage:
  aws_cloudfront_distribution:
    monthly_data_transfer_to_internet_gb:
      south_america: 100
    monthly_https_requests:
      south_america: 1000000
  aws_wafv2_web_acl:
    monthly_requests: 1000000
  aws_route53_record:
    monthly_standard_queries: 1000000
  aws_s3_bucket:
    standard:
      storage_gb: 1
      monthly_tier_1_requests: 10000
      monthly_tier_2_requests: 100000
```

- [ ] **Step 6: Validar**

```bash
terraform fmt -recursive infra
terraform -chdir=infra/modules/observability init -backend=false -input=false >/dev/null && terraform -chdir=infra/modules/observability validate
terraform -chdir=infra/live init -backend=false -input=false >/dev/null && terraform -chdir=infra/live validate
cd infra && tflint --recursive --config "$PWD/.tflint.hcl"; cd ..
docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable infra/tf
```

Expected: os dois `validate` com `Success!`; tflint e shellcheck sem problemas. (O `plan` real exige credenciais e acontece na Task 17 pelo pipeline.)

- [ ] **Step 7: Commit**

```bash
git add infra/modules/observability infra/live infra/tf infracost.yml infra/infracost-usage.yml
git commit -m "feat(infra): adiciona raiz live, orçamento mensal, wrapper infra/tf e Infracost" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bootstrap das contas (estado, OIDC, DNS, Resource Explorer, tag policy, anomalias)

**Files:**
- Create: `infra/modules/state-bucket/{versions,variables,main,outputs}.tf`
- Create: `infra/bootstrap/account/{versions,providers,variables,main,outputs}.tf`, `infra/bootstrap/account/env/{dev,prod}.tfvars`, `infra/bootstrap/account/env/{dev,prod}.backend.hcl`
- Create: `infra/bootstrap/management/{versions,providers,variables,main,outputs}.tf`, `infra/bootstrap/management/env/shared.tfvars`, `infra/bootstrap/management/env/shared.backend.hcl`
- Create: `infra/.trivyignore`

**Interfaces:**
- Consumes: módulo `tags` (Task 6). Bucket de estado criado antes via AWS CLI (runbook, Task 14) e adotado por bloco `import`.
- Produces (por conta dev/prod):
  - Roles `egt-<env>-github-plan` (ReadOnlyAccess + escrita de `*.tflock`; confia em `repo:engelmannlabs/escolagratisdetecnologia:pull_request`), `egt-<env>-github-apply` (AdministratorAccess; confia em `...:environment:<env>`), `egt-<env>-github-audit` (Resource Explorer; confia em `...:ref:refs/heads/main`).
  - Zona Route 53 `var.zone_name` (+ delegações NS opcionais) com saída `zone_name_servers`.
  - Índice agregador do Resource Explorer em sa-east-1, índice local em us-east-1 e view padrão `egt-<env>-all` com tags.
- Produces (gerenciamento): tag policy anexada às contas-membro; monitor de anomalia de custo por conta-membro com assinatura por e-mail; cost allocation tags `Project`, `Environment`, `Component` quando `activate_cost_allocation_tags = true`.

- [ ] **Step 1: Módulo `state-bucket`**

`infra/modules/state-bucket/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }
}
```

`infra/modules/state-bucket/variables.tf`:

```hcl
variable "bucket_name" {
  description = "Nome do bucket de estado do Terraform (criado antes via CLI e importado)."
  type        = string
}
```

`infra/modules/state-bucket/main.tf`:

```hcl
locals {
  tags = {
    Component          = "bootstrap"
    DataClassification = "internal"
  }
}

resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name
  tags   = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "expire-noncurrent-state"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}

data "aws_iam_policy_document" "tls_only" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.this.arn, "${aws_s3_bucket.this.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.tls_only.json
}
```

`infra/modules/state-bucket/outputs.tf`:

```hcl
output "bucket_id" {
  description = "Nome do bucket de estado."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "ARN do bucket de estado."
  value       = aws_s3_bucket.this.arn
}
```

- [ ] **Step 2: Raiz `infra/bootstrap/account`**

`infra/bootstrap/account/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }

  backend "s3" {}
}
```

`infra/bootstrap/account/providers.tf`:

```hcl
provider "aws" {
  region = "sa-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}
```

`infra/bootstrap/account/variables.tf`:

```hcl
variable "environment" {
  description = "Ambiente desta conta: dev ou prod."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment deve ser dev ou prod."
  }
}

variable "state_bucket_name" {
  description = "Bucket de estado desta conta (criado via CLI, ver docs/runbooks/bootstrap-aws.md)."
  type        = string
}

variable "zone_name" {
  description = "Zona DNS hospedada nesta conta."
  type        = string
}

variable "subdomain_delegations" {
  description = "Subdomínios delegados a outras contas: nome => lista de name servers."
  type        = map(list(string))
  default     = {}
}

variable "github_repository" {
  description = "Repositório autorizado a assumir as roles via OIDC (owner/nome)."
  type        = string
  default     = "engelmannlabs/escolagratisdetecnologia"
}
```

`infra/bootstrap/account/main.tf`:

```hcl
module "tags" {
  source      = "../../modules/tags"
  environment = var.environment
}

locals {
  prefix = module.tags.name_prefix
  tags   = { Component = "bootstrap" }

  github_subjects = {
    plan  = "repo:${var.github_repository}:pull_request"
    apply = "repo:${var.github_repository}:environment:${var.environment}"
    audit = "repo:${var.github_repository}:ref:refs/heads/main"
  }
}

# --- Estado do Terraform (bucket criado via CLI e adotado aqui) ---

import {
  to = module.state_bucket.aws_s3_bucket.this
  id = var.state_bucket_name
}

module "state_bucket" {
  source      = "../../modules/state-bucket"
  bucket_name = var.state_bucket_name
}

# --- GitHub Actions via OIDC (sem chaves de longa duração) ---

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = local.tags
}

data "aws_iam_policy_document" "github_trust" {
  for_each = local.github_subjects

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [each.value]
    }
  }
}

resource "aws_iam_role" "github" {
  for_each = local.github_subjects

  name                 = "${local.prefix}-github-${each.key}"
  description          = "GitHub Actions (${each.key}) para ${var.github_repository}"
  assume_role_policy   = data.aws_iam_policy_document.github_trust[each.key].json
  max_session_duration = 3600
  tags                 = local.tags
}

resource "aws_iam_role_policy_attachment" "plan_read_only" {
  role       = aws_iam_role.github["plan"].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "plan_state_lock" {
  statement {
    sid       = "TerraformLockFiles"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${module.state_bucket.bucket_arn}/*.tflock"]
  }
}

resource "aws_iam_role_policy" "plan_state_lock" {
  name   = "terraform-state-lock"
  role   = aws_iam_role.github["plan"].id
  policy = data.aws_iam_policy_document.plan_state_lock.json
}

# Apply amplo, restrito a jobs em GitHub Environments protegidos (ADR 0014).
resource "aws_iam_role_policy_attachment" "apply_admin" {
  role       = aws_iam_role.github["apply"].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

data "aws_iam_policy_document" "audit" {
  statement {
    sid = "ResourceExplorerSearch"
    actions = [
      "resource-explorer-2:Search",
      "resource-explorer-2:GetView",
      "resource-explorer-2:GetDefaultView",
      "resource-explorer-2:ListViews",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "audit" {
  name   = "tag-audit"
  role   = aws_iam_role.github["audit"].id
  policy = data.aws_iam_policy_document.audit.json
}

# --- Resource Explorer (inventário por tag; usado pela auditoria semanal) ---

resource "aws_resourceexplorer2_index" "aggregator" {
  type = "AGGREGATOR"
  tags = local.tags
}

resource "aws_resourceexplorer2_index" "us_east_1" {
  provider = aws.us_east_1
  type     = "LOCAL"
  tags     = local.tags
}

resource "aws_resourceexplorer2_view" "all" {
  name         = "${local.prefix}-all"
  default_view = true
  tags         = local.tags

  included_property {
    name = "tags"
  }

  depends_on = [aws_resourceexplorer2_index.aggregator]
}

# --- DNS ---

resource "aws_route53_zone" "this" {
  name    = var.zone_name
  comment = "Escola Gratis de Tecnologia (${var.environment})"
  tags    = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "delegation" {
  for_each = var.subdomain_delegations

  zone_id = aws_route53_zone.this.zone_id
  name    = each.key
  type    = "NS"
  ttl     = 172800
  records = each.value
}
```

`infra/bootstrap/account/outputs.tf`:

```hcl
output "zone_name_servers" {
  description = "Name servers da zona desta conta (copiar para o registrador ou para a delegação)."
  value       = aws_route53_zone.this.name_servers
}

output "github_role_arns" {
  description = "ARNs das roles assumidas pelo GitHub Actions."
  value       = { for key, role in aws_iam_role.github : key => role.arn }
}

output "state_bucket" {
  description = "Bucket de estado desta conta."
  value       = module.state_bucket.bucket_id
}
```

`infra/bootstrap/account/env/dev.tfvars`:

```hcl
environment       = "dev"
state_bucket_name = "escolagratis-tfstate-dev"
zone_name         = "dev.escolagratisdetecnologia.com"
```

`infra/bootstrap/account/env/dev.backend.hcl`:

```hcl
bucket       = "escolagratis-tfstate-dev"
key          = "bootstrap/terraform.tfstate"
region       = "sa-east-1"
encrypt      = true
use_lockfile = true
```

`infra/bootstrap/account/env/prod.tfvars` (a delegação de `dev` é preenchida durante o bootstrap — runbook, passo 6):

```hcl
environment       = "prod"
state_bucket_name = "escolagratis-tfstate-prod"
zone_name         = "escolagratisdetecnologia.com"

# Preenchido com a saída `zone_name_servers` do bootstrap de dev (docs/runbooks/bootstrap-aws.md).
subdomain_delegations = {}
```

`infra/bootstrap/account/env/prod.backend.hcl`:

```hcl
bucket       = "escolagratis-tfstate-prod"
key          = "bootstrap/terraform.tfstate"
region       = "sa-east-1"
encrypt      = true
use_lockfile = true
```

- [ ] **Step 3: Raiz `infra/bootstrap/management`**

`infra/bootstrap/management/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }

  backend "s3" {}
}
```

`infra/bootstrap/management/providers.tf`:

```hcl
provider "aws" {
  region = "sa-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}

# Cost Explorer (anomalias e cost allocation tags) atende em us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}
```

`infra/bootstrap/management/variables.tf`:

```hcl
variable "state_bucket_name" {
  description = "Bucket de estado da conta de gerenciamento (criado via CLI)."
  type        = string
}

variable "member_account_ids" {
  description = "Contas-membro do projeto, ex.: { dev = \"111...\", prod = \"222...\" }. Defina via TF_VAR_member_account_ids."
  type        = map(string)
}

variable "alert_emails" {
  description = "E-mails que recebem alertas de anomalia de custo. Defina via TF_VAR_alert_emails."
  type        = list(string)
  default     = []
}

variable "anomaly_threshold_usd" {
  description = "Impacto mínimo (USD) de uma anomalia para gerar alerta."
  type        = number
  default     = 10
}

variable "activate_cost_allocation_tags" {
  description = "Ativa Project/Environment/Component como cost allocation tags (só depois que as tags aparecerem no billing, ~24 h após o primeiro deploy)."
  type        = bool
  default     = false
}
```

`infra/bootstrap/management/main.tf`:

```hcl
module "tags" {
  source      = "../../modules/tags"
  environment = "shared"
}

locals {
  tags = { Component = "bootstrap" }

  # Tipos com enforcement: operações de tag com valores fora do padrão são bloqueadas.
  # Se a AWS rejeitar algum tipo (InvalidInputException), remova-o desta lista.
  enforced_resource_types = [
    "s3:bucket",
    "dynamodb:table",
    "lambda:function",
    "acm:certificate",
    "cloudfront:distribution",
  ]

  tag_policy = {
    tags = {
      Project = {
        tag_key      = { "@@assign" = "Project" }
        tag_value    = { "@@assign" = ["escola-gratis-de-tecnologia"] }
        enforced_for = { "@@assign" = local.enforced_resource_types }
      }
      Environment = {
        tag_key      = { "@@assign" = "Environment" }
        tag_value    = { "@@assign" = ["dev", "prod", "shared"] }
        enforced_for = { "@@assign" = local.enforced_resource_types }
      }
    }
  }
}

import {
  to = module.state_bucket.aws_s3_bucket.this
  id = var.state_bucket_name
}

module "state_bucket" {
  source      = "../../modules/state-bucket"
  bucket_name = var.state_bucket_name
}

# --- Tag policy: anexada só às contas do projeto, nunca à raiz da organização ---

resource "aws_organizations_policy" "tags" {
  name        = "egt-tag-policy"
  description = "Padrão de tags da Escola Gratis de Tecnologia (ADR 0015)"
  type        = "TAG_POLICY"
  content     = jsonencode(local.tag_policy)
  tags        = local.tags
}

resource "aws_organizations_policy_attachment" "tags" {
  for_each = var.member_account_ids

  policy_id = aws_organizations_policy.tags.id
  target_id = each.value
}

# --- Detecção de anomalias de custo nas contas do projeto ---

resource "aws_ce_anomaly_monitor" "member_accounts" {
  provider     = aws.us_east_1
  name         = "egt-contas-do-projeto"
  monitor_type = "CUSTOM"
  tags         = local.tags

  monitor_specification = jsonencode({
    And            = null
    CostCategories = null
    Not            = null
    Or             = null
    Tags           = null
    Dimensions = {
      Key          = "LINKED_ACCOUNT"
      MatchOptions = null
      Values       = values(var.member_account_ids)
    }
  })
}

resource "aws_ce_anomaly_subscription" "email" {
  count = length(var.alert_emails) > 0 ? 1 : 0

  provider         = aws.us_east_1
  name             = "egt-anomalias-de-custo"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.member_accounts.arn]
  tags             = local.tags

  dynamic "subscriber" {
    for_each = var.alert_emails

    content {
      type    = "EMAIL"
      address = subscriber.value
    }
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.anomaly_threshold_usd)]
    }
  }
}

# --- Cost allocation tags (custo por projeto, ambiente e componente) ---

resource "aws_ce_cost_allocation_tag" "this" {
  for_each = var.activate_cost_allocation_tags ? toset(["Project", "Environment", "Component"]) : toset([])

  provider = aws.us_east_1
  tag_key  = each.key
  status   = "Active"
}
```

`infra/bootstrap/management/outputs.tf`:

```hcl
output "tag_policy_id" {
  description = "ID da tag policy do projeto."
  value       = aws_organizations_policy.tags.id
}

output "anomaly_monitor_arn" {
  description = "Monitor de anomalias de custo das contas do projeto."
  value       = aws_ce_anomaly_monitor.member_accounts.arn
}
```

`infra/bootstrap/management/env/shared.tfvars`:

```hcl
state_bucket_name = "escolagratis-tfstate-management"
```

`infra/bootstrap/management/env/shared.backend.hcl`:

```hcl
bucket       = "escolagratis-tfstate-management"
key          = "bootstrap/terraform.tfstate"
region       = "sa-east-1"
encrypt      = true
use_lockfile = true
```

- [ ] **Step 4: Validar e rodar o Trivy**

```bash
terraform fmt -recursive infra
for root in modules/state-bucket bootstrap/account bootstrap/management live; do
  terraform -chdir=infra/$root init -backend=false -input=false >/dev/null && terraform -chdir=infra/$root validate
done
cd infra && tflint --recursive --config "$PWD/.tflint.hcl"; cd ..
trivy config --severity HIGH,CRITICAL --exit-code 1 infra
```

Expected: `Success!` em todas as raízes; tflint limpo. O Trivy 0.75 aponta só `AWS-0132` (HIGH, bucket sem CMK) nos três buckets — escolha consciente, registrada em `infra/.trivyignore`. Qualquer outro achado HIGH/CRITICAL: corrija no código ou, se for escolha consciente, registre o ID com justificativa em comentário. Conteúdo de `infra/.trivyignore`:

```
# Buckets usam SSE-S3 (AES256): os dados são públicos (site) ou estado sem segredos; CMK custaria
# US$1/mês por chave + requisições sem ganho de segurança relevante (ADR 0014).
AWS-0132
```

Rode `trivy config --severity HIGH,CRITICAL --exit-code 1 --ignorefile infra/.trivyignore infra` até sair com código 0.

- [ ] **Step 5: Commit**

```bash
git add infra/modules/state-bucket infra/bootstrap infra/.trivyignore
git commit -m "feat(infra): adiciona bootstrap das contas com estado, OIDC, DNS, tag policy e anomalias de custo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: CI/CD e governança do repositório

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/infra.yml`, `.github/workflows/deploy.yml`, `.github/workflows/auditoria-tags.yml`, `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `renovate.json`, `tools/deploy-site.sh`, `tools/smoke.sh`

**Interfaces:**
- Consumes: scripts `pnpm` (Tasks 1–3), `node tools/check-tags/src/cli.ts` (Task 4), `node tools/tag-audit/src/cli.ts` (Task 5), `infra/tf` e saídas `site_bucket_name`/`distribution_id` (Task 8), roles `egt-<env>-github-{plan,apply,audit}` (Task 9).
- Produces: GitHub Variables esperadas — repositório: `AWS_ACCOUNT_ID_DEV`, `AWS_ACCOUNT_ID_PROD`, `ALERT_EMAILS` (lista JSON); environments `dev` e `prod`: `AWS_ACCOUNT_ID`. Secret: `INFRACOST_API_KEY`. Jobs obrigatórios para branch protection: `verify` (ci).
  - `tools/deploy-site.sh <dev|prod>` — build com `SITE_URL`/`SITE_ENV`, `aws s3 sync` (assets `_astro/*` imutáveis por 1 ano; HTML `max-age=0, s-maxage=600`) e invalidação `/*`.
  - `tools/smoke.sh <url>` — confere nome da escola, 404 e (em https) HSTS e CSP.

- [ ] **Step 1: Escrever o smoke test e vê-lo falhar contra um servidor sem o site**

`tools/smoke.sh`:

```bash
#!/usr/bin/env bash
# Verifica um ambiente publicado. Uso: tools/smoke.sh <url-base>
set -euo pipefail

url="${1:?Uso: tools/smoke.sh <url-base>}"
url="${url%/}"

body=""
for attempt in 1 2 3 4 5 6; do
  if body="$(curl -fsSL --max-time 10 "$url/")"; then
    break
  fi
  echo "Tentativa $attempt falhou; nova tentativa em 20 s." >&2
  sleep 20
done

if ! grep -q 'Escola Grátis de Tecnologia' <<<"$body"; then
  echo "A página inicial não contém o nome da escola." >&2
  exit 1
fi

status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url/nao-existe")"
if [[ "$status" != "404" ]]; then
  echo "Esperado 404 em rota inexistente, recebido $status." >&2
  exit 1
fi

if [[ "$url" == https://* ]]; then
  headers="$(curl -fsSI --max-time 10 "$url/")"
  grep -qi '^strict-transport-security:' <<<"$headers" || { echo "HSTS ausente." >&2; exit 1; }
  grep -qi '^content-security-policy:' <<<"$headers" || { echo "CSP ausente." >&2; exit 1; }
fi

echo "Smoke OK: $url"
```

```bash
chmod +x tools/smoke.sh
python3 -m http.server 4399 --directory /tmp >/dev/null 2>&1 & sleep 1
tools/smoke.sh http://localhost:4399 ; echo "exit=$?"
kill %1
```

Expected: FAIL — `A página inicial não contém o nome da escola.` e `exit=1` (servidor sem o site; as 6 tentativas não são usadas porque o `curl` responde).

- [ ] **Step 2: Ver o smoke test passar contra o preview do site**

```bash
pnpm --filter @egt/web build
(pnpm --filter @egt/web preview --port 4398 >/dev/null 2>&1 &) ; sleep 4
tools/smoke.sh http://localhost:4398 ; echo "exit=$?"
pkill -f "astro preview"
```

Expected: `Smoke OK: http://localhost:4398` e `exit=0`.

- [ ] **Step 3: Script de deploy do site**

`tools/deploy-site.sh`:

```bash
#!/usr/bin/env bash
# Publica o site no ambiente indicado. Requer credenciais AWS da conta e `infra/tf live <env>`
# já inicializado (o workflow roda o apply antes). Uso: tools/deploy-site.sh <dev|prod>
set -euo pipefail

environment="${1:?Uso: tools/deploy-site.sh <dev|prod>}"
case "$environment" in
  dev) site_url="https://dev.escolagratisdetecnologia.com" ;;
  prod) site_url="https://escolagratisdetecnologia.com" ;;
  *) echo "Ambiente inválido: $environment (use dev ou prod)." >&2; exit 2 ;;
esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist="$root/apps/web/dist"

SITE_URL="$site_url" SITE_ENV="$environment" pnpm --filter @egt/web build

bucket="$(terraform -chdir="$root/infra/live" output -raw site_bucket_name)"
distribution="$(terraform -chdir="$root/infra/live" output -raw distribution_id)"

aws s3 sync "$dist" "s3://$bucket" --delete --exclude '*' --include '_astro/*' \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 sync "$dist" "s3://$bucket" --delete --exclude '_astro/*' \
  --cache-control 'public,max-age=0,s-maxage=600,must-revalidate'
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' >/dev/null

echo "Site publicado em $site_url"
```

```bash
chmod +x tools/deploy-site.sh
tools/deploy-site.sh staging ; echo "exit=$?"
```

Expected: `Ambiente inválido: staging (use dev ou prod).` e `exit=2`.

- [ ] **Step 4: Workflows**

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version-file: .node-version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
        env:
          SITE_ENV: prod
          SITE_URL: https://escolagratisdetecnologia.com
      - run: pnpm --filter @egt/web exec playwright install --with-deps chromium webkit
      - run: pnpm --filter @egt/web test:e2e
      - run: pnpm --filter @egt/web lighthouse
      - if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: relatorios-web
          path: |
            apps/web/playwright-report
            apps/web/.lighthouseci
          if-no-files-found: ignore
```

`.github/workflows/infra.yml`:

```yaml
name: infra

on:
  pull_request:
    paths:
      - 'infra/**'
      - 'tools/check-tags/**'
      - 'infracost.yml'
      - '.github/workflows/infra.yml'

permissions:
  contents: read
  id-token: write
  pull-requests: write

concurrency:
  group: infra-${{ github.ref }}
  cancel-in-progress: true

env:
  TF_IN_AUTOMATION: 'true'

jobs:
  static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: hashicorp/setup-terraform@v4
        with:
          terraform_version: 1.16.5
          terraform_wrapper: false
      - run: terraform fmt -check -recursive infra
      - name: terraform validate (todas as raízes)
        run: |
          # modules/edge usa provider com alias: é validado via live e testado com mocks abaixo.
          for root in modules/tags modules/site modules/observability modules/state-bucket bootstrap/account bootstrap/management live; do
            terraform -chdir=infra/$root init -backend=false -input=false >/dev/null
            terraform -chdir=infra/$root validate
          done
      - name: terraform test
        run: |
          terraform -chdir=infra/modules/tags test
          terraform -chdir=infra/modules/edge init -backend=false -input=false >/dev/null
          terraform -chdir=infra/modules/edge test
      - uses: terraform-linters/setup-tflint@v6
        with:
          tflint_version: v0.64.0
      - name: tflint
        working-directory: infra
        run: |
          tflint --init --config "$PWD/.tflint.hcl"
          tflint --recursive --config "$PWD/.tflint.hcl"
        env:
          GITHUB_TOKEN: ${{ github.token }}
      - uses: aquasecurity/trivy-action@v0.36.0
        with:
          scan-type: config
          scan-ref: infra
          severity: HIGH,CRITICAL
          exit-code: '1'
          trivyignores: infra/.trivyignore

  plan:
    if: github.event.pull_request.head.repo.full_name == github.repository
    needs: static
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        env: [dev, prod]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .node-version
      - uses: hashicorp/setup-terraform@v4
        with:
          terraform_version: 1.16.5
          terraform_wrapper: false
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::${{ matrix.env == 'prod' && vars.AWS_ACCOUNT_ID_PROD || vars.AWS_ACCOUNT_ID_DEV }}:role/egt-${{ matrix.env }}-github-plan
          aws-region: sa-east-1
      - name: terraform plan
        run: infra/tf live ${{ matrix.env }} plan -input=false -lock-timeout=5m -out=tfplan
        env:
          TF_VAR_alert_emails: ${{ vars.ALERT_EMAILS }}
      - run: terraform -chdir=infra/live show -json tfplan > plan.json
      - name: check-tags
        run: node tools/check-tags/src/cli.ts plan.json
      - name: resumo do plano
        run: |
          {
            echo "### Plano Terraform: ${{ matrix.env }}"
            echo '```'
            terraform -chdir=infra/live show -no-color tfplan | tail -n 200
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"

  infracost:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          path: head
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.pull_request.base.ref }}
          path: base
      - uses: infracost/actions/diff@v4
        with:
          api-key: ${{ secrets.INFRACOST_API_KEY }}
          base-path: base
          head-path: head
```

`.github/workflows/deploy.yml`:

```yaml
name: deploy

on:
  push:
    branches: [main]
    paths:
      - 'apps/web/**'
      - 'apps/api/**'
      - 'infra/**'
      - 'tools/deploy-site.sh'
      - 'tools/smoke.sh'
      - 'pnpm-lock.yaml'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy
  cancel-in-progress: false

env:
  TF_IN_AUTOMATION: 'true'

jobs:
  dev:
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version-file: .node-version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: hashicorp/setup-terraform@v4
        with:
          terraform_version: 1.16.5
          terraform_wrapper: false
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/egt-dev-github-apply
          aws-region: sa-east-1
      - name: terraform apply
        run: infra/tf live dev apply -input=false -auto-approve -lock-timeout=5m
        env:
          TF_VAR_alert_emails: ${{ vars.ALERT_EMAILS }}
      - run: tools/deploy-site.sh dev
      - run: tools/smoke.sh https://dev.escolagratisdetecnologia.com

  prod:
    needs: dev
    runs-on: ubuntu-latest
    environment: prod
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version-file: .node-version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: hashicorp/setup-terraform@v4
        with:
          terraform_version: 1.16.5
          terraform_wrapper: false
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/egt-prod-github-apply
          aws-region: sa-east-1
      - name: terraform apply
        run: infra/tf live prod apply -input=false -auto-approve -lock-timeout=5m
        env:
          TF_VAR_alert_emails: ${{ vars.ALERT_EMAILS }}
      - run: tools/deploy-site.sh prod
      - run: tools/smoke.sh https://escolagratisdetecnologia.com
      - name: www redireciona para o domínio
        run: |
          location="$(curl -s -o /dev/null -w '%{redirect_url}' https://www.escolagratisdetecnologia.com/)"
          test "$location" = "https://escolagratisdetecnologia.com/" || { echo "Redirect inesperado: $location"; exit 1; }
```

`.github/workflows/auditoria-tags.yml`:

```yaml
name: auditoria-tags

on:
  schedule:
    - cron: '0 11 * * 1' # segundas, 08:00 em Brasília
  workflow_dispatch:

permissions:
  contents: read
  id-token: write
  issues: write

jobs:
  audit:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        env: [dev, prod]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .node-version
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::${{ matrix.env == 'prod' && vars.AWS_ACCOUNT_ID_PROD || vars.AWS_ACCOUNT_ID_DEV }}:role/egt-${{ matrix.env }}-github-audit
          aws-region: sa-east-1
      - id: audit
        continue-on-error: true
        run: |
          aws resource-explorer-2 search --query-string "-tag.key:Project" --output json > resources.json
          node tools/tag-audit/src/cli.ts ${{ matrix.env }} < resources.json > report.md
      - if: steps.audit.outcome == 'failure'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          title="Auditoria de tags: recursos sem a tag Project em ${{ matrix.env }}"
          existing="$(gh issue list --state open --search "in:title \"$title\"" --json number --jq '.[0].number')"
          if [ -n "$existing" ]; then
            gh issue comment "$existing" --body-file report.md
          else
            gh issue create --title "$title" --body-file report.md
          fi
```

- [ ] **Step 5: Governança: CODEOWNERS, template de PR e Renovate**

`.github/CODEOWNERS`:

```
* @engelmannlabs
/infra/ @engelmannlabs
/content/transparency/ @engelmannlabs
```

`.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## O que muda

<!-- 1 a 3 frases. -->

## Como testar

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm test:e2e` (se mexeu no site)
- [ ] `terraform validate` + `tflint` (se mexeu em `infra/`)

## Delta de custo

<!-- Obrigatório se tocar em infra/: resuma o comentário do Infracost ou escreva "sem impacto". -->

## Pilares Well-Architected afetados

- [ ] Excelência operacional
- [ ] Segurança
- [ ] Confiabilidade
- [ ] Eficiência de performance
- [ ] Otimização de custos
- [ ] Sustentabilidade

## ADR

<!-- Link para a ADR nova ou atualizada, ou "não se aplica". -->

## Checklist

- [ ] Recursos AWS novos com as tags padrão (Project, Environment, Component, ManagedBy, Repository)
- [ ] Nenhum segredo, e-mail pessoal ou ID de conta no código
- [ ] Docs e CLAUDE.md atualizados se algum padrão mudou
```

`renovate.json`:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", "group:allNonMajor", ":semanticCommitTypeAll(chore)"],
  "timezone": "America/Sao_Paulo",
  "schedule": ["before 6am on monday"],
  "packageRules": [
    {
      "matchManagers": ["terraform"],
      "groupName": "terraform"
    },
    {
      "matchManagers": ["github-actions"],
      "groupName": "github actions"
    }
  ]
}
```

- [ ] **Step 6: Validar workflows e scripts**

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color
docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable tools/smoke.sh tools/deploy-site.sh infra/tf
pnpm format && pnpm lint
```

Expected: actionlint e shellcheck sem erros; lint verde.

- [ ] **Step 7: Commit**

```bash
git add .github renovate.json tools/smoke.sh tools/deploy-site.sh
git commit -m "ci: adiciona workflows de CI, infra com Infracost e check-tags, deploy e auditoria de tags" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Guias do Claude (CLAUDE.md), permissões e MCP

**Files:**
- Create: `CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`, `tools/CLAUDE.md`, `infra/CLAUDE.md`, `.claude/settings.json`, `.mcp.json`, `docs/runbooks/mcp.md`

**Interfaces:**
- Consumes: comandos e estrutura das Tasks 1–10.
- Produces: `infra/CLAUDE.md` com a seção **Tags** (referenciada pela saída do `check-tags`); `.mcp.json` com servidores `heygen`, `buffer`, `stripe`, `github` lendo `BUFFER_API_KEY`, `STRIPE_MCP_KEY`, `GITHUB_MCP_PAT`.

- [ ] **Step 1: `CLAUDE.md` da raiz**

```markdown
# Escola Grátis de Tecnologia — guia para o Claude

## Missão

Escola online 100% gratuita e beneficente para brasileiros (maioria geração Z, pouca experiência com tecnologia) aprenderem em microcursos, saírem resolvendo um problema real e receberem certificado verificável.

- Design (fonte de verdade): `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`
- Decisões: `docs/adr/` · Well-Architected: `docs/arquitetura/well-architected.md` · Operação: `docs/runbooks/`
- Planos por fase: `docs/superpowers/plans/`

## Mapa do repositório

| Caminho | O que é | Guia |
|---|---|---|
| `apps/web` | Site Astro static-first (PWA a partir da Fase 1) | `apps/web/CLAUDE.md` |
| `apps/api` | API Hono (Lambda + servidor local) | `apps/api/CLAUDE.md` |
| `tools/` | CLIs e scripts do repositório | `tools/CLAUDE.md` |
| `infra/` | Terraform: `bootstrap/`, `modules/`, raiz `live/` | `infra/CLAUDE.md` |
| `docs/` | Specs, planos, ADRs, arquitetura, runbooks | — |

## Comandos

- `mise install` — Node 24, pnpm, Terraform, tflint, Trivy, Infracost nas versões do projeto
- `pnpm install`
- `pnpm dev` — site em http://localhost:4321 e API em http://localhost:3001 (o site encaminha `/api`)
- `pnpm lint` · `pnpm format` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm build`
- `infra/tf <raiz> <ambiente> <comando>` — Terraform com backend e variáveis do ambiente (ex.: `infra/tf live dev plan`)

## Convenções

- **Idioma:** documentação, ADRs, commits e PRs em pt-BR. Identificadores, comentários técnicos, logs e mensagens de exceção em inglês. Todo texto exibido a pessoas (UI, respostas da API, saída de CLIs do repo) em pt-BR, no tom da Escola: próximo, simples, sem jargão sem explicação.
- **TDD:** teste que falha → ver falhar → implementação mínima → ver passar → commit.
- **TypeScript:** estrito, ESM, imports relativos com extensão `.ts` (o Node 24 executa TypeScript direto; esbuild e Astro empacotam).
- **Commits:** Conventional Commits em pt-BR (`feat(api): ...`, `fix(web): ...`, `docs: ...`).
- **PRs:** toda mudança entra por PR na `main`. Preencha o template (delta de custo, pilares, ADR).
- **Arquitetura:** decisão nova ou alterada exige ADR em `docs/adr/` e atualização de `docs/arquitetura/well-architected.md`.
- **Infra:** PR com plano Terraform e delta de custo (Infracost). Nunca rode `apply` em prod fora do pipeline.
- **Tags AWS:** obrigatórias em todo recurso — veja `infra/CLAUDE.md`, seção Tags.
- **Segredos:** nunca no repositório (nem e-mails pessoais ou IDs de conta). Use SSM Parameter Store, GitHub Secrets/Variables e `.env` local (ignorado pelo git).
- **Produto:** pré-requisitos mínimos, mobile-first e acessibilidade são requisitos, não extras.

## Antes de dizer que terminou

`pnpm lint && pnpm typecheck && pnpm test` verdes. Mexeu no site: `pnpm test:e2e`. Mexeu em `infra/`: `terraform fmt -check -recursive infra`, `terraform validate` da raiz afetada, `tflint` e `trivy config`.

## MCP e ações externas

`.mcp.json` declara HeyGen, Buffer, Stripe e GitHub — chaves e usos em `docs/runbooks/mcp.md`. Publicar post, criar link de pagamento, gerar vídeo (consome créditos), mudar DNS ou criar recursos na AWS só com aprovação explícita do mantenedor.
```

- [ ] **Step 2: `apps/web/CLAUDE.md`**

```markdown
# apps/web — site Astro

- **Static-first:** páginas geradas no build, zero JavaScript por padrão. Interatividade só em ilhas (Preact, a partir da Fase 1), carregadas sob demanda.
- **Orçamentos (CI bloqueia):** ≤ 30 KB de JS por página de conteúdo, LCP ≤ 2,0 s, CLS ≤ 0,05, Lighthouse ≥ 95 em performance, acessibilidade, boas práticas e SEO.
- **CSP estrita:** nada de `<script>` ou `<style>` inline (`build.inlineStylesheets: 'never'`). Precisa de script? Arquivo externo.
- **Acessibilidade (WCAG 2.2 AA):** `lang="pt-BR"`, um `h1` por página, alvos de toque ≥ 48 px, contraste, foco visível, `prefers-reduced-motion`, texto alternativo. O e2e roda axe em todas as páginas novas.
- **Mobile-first:** CSS começa no celular; media queries só ampliam.
- **Design tokens:** cores, espaços e raios em `src/styles/global.css` (claro e escuro). Não use cores soltas.
- **Variáveis de build:** `SITE_URL` (URL canônica) e `SITE_ENV` (`local` | `dev` | `prod`, via `astro:env`). Fora de `prod`, páginas `noindex` e `robots.txt` bloqueando tudo.
- **Microcopy:** tom da Escola — trate por "você", frases curtas, verbos de ação ("Bora começar", "Concluir e continuar"), sem gíria forçada, sem "clique aqui".
- **Astro 7:** compilador estrito — feche todas as tags; `compressHTML: true` mantém o espaço entre elementos inline.
- **Estrutura:** `src/layouts/`, `src/pages/`, `src/styles/`, `public/`, `e2e/` (Playwright: Pixel 7 e iPhone 14).
```

- [ ] **Step 3: `apps/api/CLAUDE.md`**

```markdown
# apps/api — API Hono

- **Composição:** `createApp(config)` em `src/app.ts` monta as rotas. Cada recurso fica em `src/routes/<recurso>.ts`, exportando uma função que recebe dependências e devolve um `Hono`.
- **Entradas finas:** `src/lambda.ts` (handler AWS) e `src/server.ts` (servidor local) não têm lógica.
- **Configuração:** só `src/config.ts` lê `process.env` (`loadConfig`). O resto recebe `AppConfig` por parâmetro.
- **Erros:** sempre `{ error: { code, message } }` — `code` em snake_case inglês, `message` em pt-BR no tom da Escola. 404 `not_found`, 500 `internal_error`; validação (zod, Fase 1) → 400 `invalid_request`.
- **Testes:** Vitest com `app.request()`; um arquivo por rota em `test/`; nada de rede real.
- **Logs:** JSON estruturado em inglês (Powertools for AWS Lambda a partir da Fase 1).
- **Bundle:** esbuild → `dist/lambda.mjs` (Node 24, ESM, arm64). Mantenha dependências enxutas — tamanho do bundle afeta o cold start.
```

- [ ] **Step 4: `tools/CLAUDE.md`**

```markdown
# tools — CLIs e scripts do repositório

- **CLIs em TypeScript** rodam direto no Node 24: `node tools/<nome>/src/cli.ts`. Evite dependências de runtime para que rodem no CI sem `pnpm install`.
- **Separação:** lógica pura e testada em `src/<nome>.ts`; `src/cli.ts` só faz entrada/saída e códigos de saída (0 ok, 1 encontrou problema, 2 uso incorreto).
- **Saída para pessoas em pt-BR.**
- **Scripts bash:** `set -euo pipefail`, validar argumentos com mensagem de uso, passar no shellcheck.
- **Existentes:** `check-tags` (tags no plano Terraform), `tag-audit` (recursos sem tag `Project`), `deploy-site.sh`, `smoke.sh`.
```

- [ ] **Step 5: `infra/CLAUDE.md`**

```markdown
# infra — Terraform

## Layout

- `bootstrap/account` — por conta (dev, prod): bucket de estado, OIDC do GitHub, roles `egt-<env>-github-{plan,apply,audit}`, Resource Explorer, zona DNS.
- `bootstrap/management` — conta de gerenciamento: tag policy, anomalias de custo, cost allocation tags.
- `modules/*` — blocos reutilizáveis (tags, site, edge, observability, state-bucket…).
- `live/` — raiz única da aplicação; `env/<env>.tfvars` e `env/<env>.backend.hcl` por ambiente.
- `tf` — wrapper: `infra/tf <raiz> <env> <comando>`.

## Regiões

`sa-east-1` para tudo que a AWS permite. `us-east-1` (alias `aws.us_east_1`) só para ACM e WAF do CloudFront e Cost Explorer.

## Tags

Todo recurso AWS tagueável precisa de:

| Chave | Valores | Origem |
|---|---|---|
| `Project` | `escola-gratis-de-tecnologia` | `default_tags` (módulo `tags`) |
| `Environment` | `dev`, `prod`, `shared` | `default_tags` |
| `ManagedBy` | `terraform` (ou `app` para recursos criados pela aplicação) | `default_tags` |
| `Repository` | `github.com/engelmannlabs/escolagratisdetecnologia` | `default_tags` |
| `Component` | `edge`, `site`, `api`, `data`, `auth`, `media`, `jobs`, `certificates`, `observability`, `bootstrap` | `tags = local.tags` em cada recurso do módulo |
| `DataClassification` | `public`, `internal`, `personal` | só em S3, DynamoDB e Cognito |

- Todo provider AWS (inclusive aliases) usa `default_tags { tags = module.tags.default_tags }`.
- Todo recurso tagueável num módulo declara `tags = local.tags` com `Component`.
- Recursos criados pela aplicação (ex.: jobs do MediaConvert) recebem as mesmas tags via variáveis de ambiente, com `ManagedBy=app`.
- O PR falha se faltar tag: `tools/check-tags` lê o plano; o tflint confere `Component`.
- Componente novo? Atualize `tools/check-tags/src/rules.ts`, esta tabela e a ADR 0015.

## Nomes

`egt-<env>-<component>-<nome>`. Buckets levam o ID da conta como sufixo para unicidade global (exceto os de estado, criados antes do Terraform).

## Segurança e custo

- Menor privilégio; S3 sem acesso público e com política só-TLS; criptografia em repouso.
- Nenhuma chave de longa duração: GitHub assume roles via OIDC.
- Prefira serviços pagos por uso. Se o padrão de uso mudar, atualize `infra/infracost-usage.yml`.
- Achado do Trivy só vai para `infra/.trivyignore` com justificativa em comentário.

## Testes

`terraform fmt -check -recursive infra`, `terraform validate` em toda raiz afetada (`init -backend=false`), `terraform test` em módulos com lógica (módulos com provider em alias, como `edge`, são testados com `mock_provider` em vez de `validate`), `tflint --recursive`, `trivy config`.

## Proibido

- `apply`/`destroy` local em prod (o pipeline faz isso com aprovação).
- Recursos criados à mão no console, exceto o que um runbook manda (ex.: plano flat-rate do CloudFront).
- Mudar arquitetura sem ADR e sem atualizar `docs/arquitetura/well-architected.md`.
```

- [ ] **Step 6: Permissões do Claude Code e MCP**

`.claude/settings.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(pnpm install)",
      "Bash(pnpm lint)",
      "Bash(pnpm format)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm test)",
      "Bash(pnpm test:e2e)",
      "Bash(pnpm build)",
      "Bash(pnpm --filter:*)",
      "Bash(terraform fmt:*)",
      "Bash(terraform -chdir=infra/modules/tags test)",
      "Bash(node tools/check-tags/src/cli.ts:*)",
      "Bash(node tools/tag-audit/src/cli.ts:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)"
    ],
    "deny": [
      "Bash(terraform apply:*)",
      "Bash(terraform destroy:*)",
      "Bash(infra/tf live prod apply:*)",
      "Bash(infra/tf live prod destroy:*)",
      "Bash(infra/tf bootstrap/account prod destroy:*)",
      "Bash(infra/tf bootstrap/management shared destroy:*)",
      "Read(./.env)",
      "Read(./.env.*)"
    ]
  }
}
```

`.mcp.json`:

```json
{
  "mcpServers": {
    "heygen": {
      "type": "http",
      "url": "https://mcp.heygen.com/mcp/v1/"
    },
    "buffer": {
      "type": "http",
      "url": "https://mcp.buffer.com/mcp",
      "headers": { "Authorization": "Bearer ${BUFFER_API_KEY:-}" }
    },
    "stripe": {
      "type": "http",
      "url": "https://mcp.stripe.com",
      "headers": { "Authorization": "Bearer ${STRIPE_MCP_KEY:-}" }
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GITHUB_MCP_PAT:-}" }
    }
  }
}
```

`docs/runbooks/mcp.md`:

```markdown
# Servidores MCP do projeto

O `.mcp.json` declara os conectores usados pelas skills de operação (ADR 0011). As chaves vêm de variáveis de ambiente do seu shell — nunca do repositório.

| Servidor | URL | Autenticação | Variável | Uso |
|---|---|---|---|---|
| HeyGen | `https://mcp.heygen.com/mcp/v1/` | OAuth (sem chave) | — | Elenco, Video Agent, cortes. **Só no Claude Code local do mantenedor.** |
| Buffer | `https://mcp.buffer.com/mcp` | Bearer | `BUFFER_API_KEY` | Agendar posts e ler métricas |
| Stripe | `https://mcp.stripe.com` | Bearer (chave restrita) | `STRIPE_MCP_KEY` | Payment Links e consultas de receita |
| GitHub | `https://api.githubcopilot.com/mcp/` | Bearer (PAT fine-grained) | `GITHUB_MCP_PAT` | Branches, PRs, issues |

## Configurar

1. Gere as chaves:
   - Buffer: https://publish.buffer.com/settings/api
   - Stripe: Dashboard → Developers → API keys → **Restricted key**. Para consultas use só leitura (Balance, Balance transactions, Charges, Payment Links). Para criar links de doação, gere uma chave separada com escrita apenas em Payment Links e Prices/Products, e apague-a depois do uso.
   - GitHub: Settings → Developer settings → Fine-grained token, só neste repositório (Contents, Pull requests e Issues: read/write).
2. Exporte no seu shell (ex.: `~/.bashrc` ou `direnv`), nunca em arquivo versionado:
   `export BUFFER_API_KEY=... STRIPE_MCP_KEY=... GITHUB_MCP_PAT=...`
3. Abra o Claude Code na raiz do repo, aprove os servidores do projeto e rode `/mcp`. No HeyGen, conclua o login OAuth.

Se você já usa os conectores do claude.ai para o mesmo serviço, recuse o servidor duplicado do projeto.

## No CI

Workflows que usam Buffer ou Stripe (Fases 4 e 5) recebem as chaves por GitHub Secrets. O HeyGen não aceita chave no MCP remoto; por isso a geração de vídeos não roda no CI.

## Regras

- Publicar post, criar link de pagamento e gerar vídeo (consome créditos) só com aprovação explícita.
- Chave vazou? Revogue no painel do serviço imediatamente e gere outra.
```

- [ ] **Step 7: Validar e commitar**

```bash
python3 -m json.tool .mcp.json >/dev/null && python3 -m json.tool .claude/settings.json >/dev/null && echo "json ok"
pnpm format && pnpm lint
git add CLAUDE.md apps/web/CLAUDE.md apps/api/CLAUDE.md tools/CLAUDE.md infra/CLAUDE.md .claude/settings.json .mcp.json docs/runbooks/mcp.md
git commit -m "docs: adiciona guias CLAUDE.md, permissões do Claude Code e servidores MCP" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `json ok`; lint verde.

---

### Task 12: Licenças, marca, README e CONTRIBUTING (com verificação dos termos do HeyGen)

**Files:**
- Create: `LICENSE`, `LICENSE-CONTENT.md`, `TRADEMARK.md`, `README.md`, `CONTRIBUTING.md`

**Interfaces:**
- Produces: decisão registrada sobre a licença dos vídeos (seção "Vídeos" de `LICENSE-CONTENT.md`), usada pela ADR 0016 (Task 13).

- [ ] **Step 1: Texto oficial da AGPL**

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
head -2 LICENSE
```

Expected: a primeira linha contém `GNU AFFERO GENERAL PUBLIC LICENSE`.

- [ ] **Step 2: Verificar os termos do HeyGen**

Leia os termos de serviço do HeyGen (https://www.heygen.com/terms, e a política de uso de avatares/conteúdo se houver link) procurando: (a) titularidade dos vídeos gerados, (b) licença de uso comercial dos avatares e vozes de estoque e dos avatares criados por prompt, (c) proibição de redistribuir ou sublicenciar os vídeos, (d) exigência de atribuição. Registre um resumo com a data de leitura e os trechos relevantes; ele entra na seção "Vídeos" abaixo e na ADR 0016.

- Se os termos atribuem os vídeos ao cliente e não proíbem redistribuição/sublicenciamento → use o **Texto A**.
- Caso contrário (ou se houver dúvida) → use o **Texto B**.

- [ ] **Step 3: `LICENSE-CONTENT.md`**

```markdown
# Licença do conteúdo

Salvo indicação em contrário, o conteúdo educacional da Escola Grátis de Tecnologia — textos, roteiros, quizzes, rubricas, imagens e materiais em `content/` e `docs/conteudo/` — está licenciado sob a **Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional (CC BY-SA 4.0)**: https://creativecommons.org/licenses/by-sa/4.0/legalcode.pt

Você pode copiar, adaptar e redistribuir, inclusive comercialmente, desde que:

- dê o crédito: "Escola Grátis de Tecnologia — escolagratisdetecnologia.com — CC BY-SA 4.0";
- indique se fez alterações;
- distribua obras derivadas sob a mesma licença.

## Vídeos

<Cole aqui o Texto A ou o Texto B, conforme a verificação do Step 2, seguido do resumo da verificação com data.>

## O que não está coberto

- Nome, logo e identidade visual: veja `TRADEMARK.md`.
- Código-fonte: AGPL-3.0-or-later (`LICENSE`).
- Materiais de terceiros citados nas aulas seguem a licença de cada autor.
```

**Texto A:**

```markdown
Os vídeos das aulas também estão sob CC BY-SA 4.0, nas mesmas condições acima. Eles são produzidos com avatares e vozes do HeyGen; ao reutilizá-los, respeite também os termos do HeyGen que se aplicarem a você.
```

**Texto B:**

```markdown
Os vídeos das aulas são produzidos com avatares e vozes do HeyGen, cujos termos não permitem sublicenciá-los sob CC BY-SA. Por isso, os vídeos são **de uso livre e gratuito para assistir e compartilhar o link**, mas não podem ser baixados para redistribuição ou edição. Os roteiros e transcrições de cada vídeo continuam sob CC BY-SA 4.0.
```

Substitua o marcador `<Cole aqui...>` pelo texto escolhido e pelo resumo — o arquivo final não pode conter o marcador.

- [ ] **Step 4: `TRADEMARK.md`**

```markdown
# Uso do nome e da marca

O código é livre (AGPL-3.0) e o conteúdo também (CC BY-SA 4.0), mas o nome **"Escola Grátis de Tecnologia"**, o logo e a identidade visual não estão incluídos nessas licenças.

## Pode

- Citar o projeto pelo nome, inclusive em artigos, vídeos e trabalhos acadêmicos.
- Dizer que seu material é baseado no conteúdo da Escola, com o crédito pedido em `LICENSE-CONTENT.md`.
- Linkar para escolagratisdetecnologia.com.

## Não pode

- Emitir certificados, cobrar cursos ou pedir doações usando o nome ou o logo da Escola.
- Sugerir que a Escola apoia, patrocina ou revisou o seu trabalho sem autorização.
- Publicar um fork como serviço com o mesmo nome: forks devem usar outro nome e outra identidade visual.

Dúvidas: abra uma issue no repositório.
```

- [ ] **Step 5: `README.md`**

```markdown
# Escola Grátis de Tecnologia

Aprenda tecnologia de graça, em aulas curtinhas pensadas pro celular, e saia de cada curso resolvendo um problema de verdade — com certificado que qualquer pessoa consegue conferir.

> **Status:** Fase 0 (fundação). Site: https://escolagratisdetecnologia.com

## Por que existe

- **100% grátis e beneficente:** sem anúncios, sem venda de dados.
- **Mão na massa:** todo curso termina num projeto real, corrigido e certificado (Open Badges 3.0).
- **Aberto e transparente:** código e conteúdo abertos; finanças públicas na página de transparência (Fase 4).

## Rodar localmente

1. Instale o [mise](https://mise.jdx.dev) e rode `mise install` (Node 24, pnpm, Terraform e ferramentas).
2. `pnpm install`
3. `pnpm dev` → site em http://localhost:4321 e API em http://localhost:3001/api/health

Verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.

## Estrutura

| Caminho | O que é |
|---|---|
| `apps/web` | Site (Astro, static-first) |
| `apps/api` | API (Hono em AWS Lambda) |
| `tools/` | CLIs e scripts do repositório |
| `infra/` | Infraestrutura como código (Terraform, AWS) |
| `docs/` | Design, decisões (ADRs), arquitetura e runbooks |

## Documentação

- Design completo: `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`
- Decisões de arquitetura: `docs/adr/`
- Revisão AWS Well-Architected: `docs/arquitetura/well-architected.md`
- Runbooks de operação: `docs/runbooks/`

## Contribua

Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licenças

- Código: [AGPL-3.0-or-later](LICENSE)
- Conteúdo: [CC BY-SA 4.0](LICENSE-CONTENT.md)
- Nome e marca: [TRADEMARK.md](TRADEMARK.md)
```

- [ ] **Step 6: `CONTRIBUTING.md`**

```markdown
# Como contribuir

Que bom que você quer ajudar! A Escola é feita em aberto e toda contribuição passa por pull request.

## Fluxo

1. Abra uma issue descrevendo o que quer mudar (ou comente numa existente).
2. Crie uma branch a partir da `main` (ou um fork).
3. Rode o projeto localmente (veja o README) e faça a mudança com testes.
4. Rode `pnpm lint && pnpm typecheck && pnpm test` (e `pnpm test:e2e` se mexeu no site).
5. Abra o PR preenchendo o template.

## Convenções

- **Idioma:** docs, commits e PRs em pt-BR; código (nomes, comentários técnicos) em inglês; textos que aparecem para as pessoas em pt-BR.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) — ex.: `feat(web): adiciona página do curso`.
- **Testes primeiro:** escreva o teste que falha antes da implementação.
- **Infra:** mudanças em `infra/` precisam do plano Terraform e do delta de custo no PR; decisões de arquitetura precisam de ADR (`docs/adr/`).
- **Tags AWS:** todo recurso novo segue o padrão de `infra/CLAUDE.md`.
- **Segredos:** nunca commite chaves, e-mails pessoais ou IDs de conta.

## Conteúdo dos cursos

A partir da Fase 3, cursos ficam em `content/courses/` e seguem o guia de estilo em `docs/conteudo/`. Ao contribuir com conteúdo, você concorda em licenciá-lo sob CC BY-SA 4.0.

## Convivência

Seja gentil e paciente: muita gente aqui está começando. Críticas vão para o código, nunca para a pessoa.
```

- [ ] **Step 7: Verificar e commitar**

```bash
grep -n "Cole aqui" LICENSE-CONTENT.md && echo "ERRO: marcador não substituído" || echo "ok"
pnpm format && pnpm lint
git add LICENSE LICENSE-CONTENT.md TRADEMARK.md README.md CONTRIBUTING.md
git commit -m "docs: adiciona licenças AGPL e CC BY-SA, política de marca, README e CONTRIBUTING" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `ok`; lint verde.

---

### Task 13: ADRs 0001–0018 e revisão Well-Architected

**Files:**
- Create: `docs/adr/README.md`, `docs/adr/0000-modelo.md`, `docs/adr/0001-static-first-astro.md` … `docs/adr/0018-entidade-doacoes-parametrizada.md`, `docs/arquitetura/well-architected.md`

**Interfaces:**
- Consumes: decisão de licença dos vídeos (Task 12) para a ADR 0016.
- Produces: ADRs numeradas e referenciadas por CLAUDE.md, `tag-audit` (ADR 0015) e template de PR.

- [ ] **Step 1: Índice e modelo**

`docs/adr/0000-modelo.md`:

```markdown
# NNNN. Título curto da decisão

- Status: proposta | aceita | substituída por NNNN
- Data: AAAA-MM-DD
- Decisão do spec: Dn (se houver)

## Contexto

O problema e as forças em jogo.

## Decisão

O que foi decidido, de forma direta.

## Alternativas consideradas

- Alternativa — por que não.

## Consequências

- Positivas: ...
- Negativas: ...

## Pilares Well-Architected

Quais pilares a decisão afeta e como.

## Revisar quando

Gatilho objetivo para reabrir a decisão.
```

`docs/adr/README.md`:

```markdown
# Decisões de arquitetura (ADRs)

Cada decisão relevante vira um arquivo `NNNN-titulo.md` a partir de `0000-modelo.md`. Decisão nova ou alterada entra no mesmo PR da mudança e atualiza `docs/arquitetura/well-architected.md`.

| # | Decisão | Status |
|---|---|---|
| 0001 | Site static-first com Astro e API serverless | aceita |
| 0002 | Conteúdo como código | aceita |
| 0003 | Vídeos hospedados na AWS | aceita |
| 0004 | CloudFront com plano flat-rate | aceita |
| 0005 | API única em Lambda com Hono e Node 24 | aceita |
| 0006 | DynamoDB on-demand em tabela única | aceita |
| 0007 | Amazon Cognito para identidade | aceita |
| 0008 | Política de SMS | aceita |
| 0009 | Avaliação com quizzes formativos e projeto corrigido por IA | aceita |
| 0010 | Certificados Open Badges 3.0 assinados no KMS | aceita |
| 0011 | Operações via Claude Code + MCP, sempre em PR | aceita |
| 0012 | Números financeiros por scripts determinísticos | aceita |
| 0013 | Região sa-east-1 | aceita |
| 0014 | Contas AWS separadas e acesso do GitHub via OIDC | aceita |
| 0015 | Padrão obrigatório de tags | aceita |
| 0016 | Licenças | aceita |
| 0017 | Idioma de docs e código | aceita |
| 0018 | Entidade de doações parametrizada | aceita |
```

- [ ] **Step 2: Escrever as ADRs**

Crie cada arquivo com a estrutura do modelo, `Status: aceita`, `Data: 2026-10-03` e o conteúdo abaixo (Contexto, Decisão, Alternativas, Consequências, Pilares, Revisar quando).

`docs/adr/0001-static-first-astro.md` — D1
- Contexto: público majoritariamente em celular intermediário com 4G e plano de dados limitado; requisito de carregamento muito rápido; custo ocioso deve ser ~zero.
- Decisão: Astro gera HTML estático servido pelo CloudFront; interatividade só em ilhas (Preact) sob demanda; dados dinâmicos pela API em `/api`.
- Alternativas: Next.js SSR em Lambda (OpenNext) — mais JS e cold start por página; SPA React — tela branca até o JS carregar, SEO fraco.
- Consequências: + páginas na borda, orçamento de 30 KB viável, custo ocioso ~0; − publicar curso exige rebuild; dados por usuário são montados no cliente.
- Pilares: performance, custo, sustentabilidade.
- Revisar quando: o build passar de 10 minutos ou surgir conteúdo personalizado que precise de renderização no servidor.

`docs/adr/0002-conteudo-como-codigo.md` — D2
- Contexto: projeto aberto, autoria assistida pelo Claude Code, revisão pedagógica obrigatória.
- Decisão: cursos em Markdown/YAML em `content/`, validados por schema na CI; vídeos no S3 referenciados por ID.
- Alternativas: CMS headless (custo e lock-in); painel admin próprio (mais código e superfície de ataque).
- Consequências: + revisão por PR, histórico, contribuição externa, zero custo de CMS; − autores sem Git dependem de mantenedores ou do Claude Code; gabaritos dos quizzes ficam públicos (quizzes são formativos — o projeto final é o portão do certificado).
- Pilares: excelência operacional, custo.
- Revisar quando: houver volume de autores não técnicos.

`docs/adr/0003-videos-na-aws.md` — D3
- Contexto: muitos vídeos; sem anúncios nem rastreamento de terceiros (LGPD); controle de player, legendas e economia de dados.
- Decisão: S3 + MediaConvert (HLS 360/540/720p, segmentos de 6 s) + CloudFront.
- Alternativas: YouTube (grátis, mas anúncios, cookies de terceiros, player pesado e distrações); Vimeo (pago por armazenamento).
- Consequências: + experiência limpa e acessível; − custo de transcodificação e entrega (mitigado pela ADR 0004).
- Pilares: performance, segurança (privacidade), custo.
- Revisar quando: entrega de vídeo passar de 30% dos gastos mensais.

`docs/adr/0004-cloudfront-flat-rate.md` — D4
- Contexto: site público e beneficente exposto a picos e ataques; transparência exige custo previsível.
- Decisão: uma distribuição por ambiente com WAF associado; plano flat-rate Free no beta, subindo para Pro (US$ 15) ou Business (US$ 200) conforme requisições. Assinatura feita pelo console (o provider AWS 6.67 não suporta — verificado em 2026-10-03), conforme `docs/runbooks/cloudfront-flat-rate.md`.
- Alternativas: pay-as-you-go (free tier de 1 TB, mas risco de conta-surpresa e WAF pago à parte).
- Consequências: + sem cobrança de excedente; WAF, DDoS e DNS inclusos; − sem real-time logs, continuous deployment e rule groups próprios; excesso sustentado pode degradar a entrega.
- Pilares: custo, segurança, confiabilidade.
- Revisar quando: uso acima de 50% da franquia por 2 meses (subir de plano) ou o provider passar a suportar o plano (gerenciar no Terraform).

`docs/adr/0005-api-lambda-hono.md` — D5
- Contexto: poucas rotas no início; cold start afeta a experiência; precisa rodar igual na máquina local.
- Decisão: um Lambda `api` (Hono, Node 24, arm64) atrás de API Gateway HTTP API; tarefas assíncronas em Lambdas separados; o mesmo app roda como servidor Node local.
- Alternativas: um Lambda por rota (mais cold starts); Function URL com OAC (exige hash do corpo nos POSTs).
- Consequências: + menos cold starts, deploy simples, paridade local; − o pacote cresce com o tempo (manter bundle enxuto e workers separados).
- Pilares: performance, excelência operacional, custo.
- Revisar quando: bundle passar de 5 MB ou p95 de cold start passar de 1 s.

`docs/adr/0006-dynamodb-tabela-unica.md` — D6
- Contexto: acessos por chave (usuário, curso, certificado); pagar só pelo uso; rodar localmente.
- Decisão: tabela única on-demand com PITR, GSI1 e TTL, modelada com ElectroDB.
- Alternativas: Aurora Serverless v2 (retomada lenta após pausa); Aurora DSQL (restrições de SQL).
- Consequências: + custo proporcional, latência baixa, DynamoDB Local; − consultas analíticas exigem exportação; modelagem planejada por padrão de acesso.
- Pilares: custo, performance, confiabilidade.
- Revisar quando: consultas ad hoc frequentes não couberem em índices secundários.

`docs/adr/0007-cognito.md` — D7
- Contexto: SSO Google, login sem senha por e-mail e MFA via SMS; preferência do mantenedor por serviço gerenciado.
- Decisão: pool de alunos no plano Essentials (Google + código por e-mail, telas próprias via BFF com cookies HttpOnly); pool da equipe no plano Lite (senha + SMS MFA obrigatório).
- Alternativas: biblioteca open source no Lambda (Better Auth) — ~US$ 5/mês com 100 mil MAU e roda localmente, mas a segurança fica conosco; Cognito Lite com gatilhos customizados.
- Consequências: + gerenciado, menos código de segurança; − custo cresce (US$ 0,015/MAU acima de 10 mil; ~US$ 600/mês com 50 mil MAU); não roda localmente (usamos emissor OIDC falso); MFA do Cognito não se aplica a federados nem a login sem senha.
- Pilares: segurança, custo.
- Revisar quando: **30 mil MAU** — reavaliar Lite com gatilhos ou autenticação própria.

`docs/adr/0008-politica-de-sms.md` — D8
- Contexto: o Cognito não combina MFA com login sem senha; público com pouca experiência; cada SMS custa.
- Decisão: equipe com SMS MFA obrigatório a cada login; aluno confirma o celular uma vez antes do primeiro certificado; regra 1 celular = 1 conta; máximo de 3 SMS por dia.
- Alternativas: e-mail + SMS a cada login (mais atrito e custo); MFA opcional para alunos (fluxo confuso).
- Consequências: + atrito mínimo, antifraude no certificado, custo previsível; − conta de aluno sem segundo fator (risco baixo: não há dados financeiros).
- Pilares: segurança, custo.
- Revisar quando: houver tomada de contas de alunos ou a conta passar a guardar algo de maior valor.

`docs/adr/0009-avaliacao.md` — D9
- Contexto: o certificado precisa provar que o problema real foi resolvido.
- Decisão: quizzes formativos (resposta imediata, tentativas ilimitadas) e projeto final corrigido pelo Claude com rubrica pública; nota calculada por código a partir dos critérios; revisão humana sob demanda e por amostragem de 5%.
- Alternativas: só quiz (não prova a habilidade); checklist autodeclarado (fácil de fraudar).
- Consequências: + certificado com valor de mercado; − custo de IA (~US$ 0,02 por correção) e risco de injeção de prompt (mitigado com evidência marcada como não confiável, saída estruturada, verificações determinísticas e evals ≥ 90%).
- Pilares: segurança, custo.
- Revisar quando: a concordância com avaliadores humanos ficar abaixo de 90% em algum curso.

`docs/adr/0010-certificados-open-badges.md` — D10
- Contexto: certificados publicáveis e verificáveis por terceiros (LinkedIn, empregadores, clientes).
- Decisão: `OpenBadgeCredential` (W3C VC 2.0) como VC-JWT ES256; chave no KMS (`ECC_NIST_P256`); emissor `did:web:escolagratisdetecnologia.com`; revogação por Bitstring Status List; página pública com Open Graph e botão do LinkedIn.
- Alternativas: PDF com QR code (não verificável por máquina); blockchain (custo e complexidade sem ganho para o público).
- Consequências: + padrão aberto, chave privada nunca exposta, verificação por qualquer ferramenta compatível; − rotação de chaves exige manter as antigas no `did.json`.
- Pilares: segurança, confiabilidade.
- Revisar quando: houver mudança relevante no padrão Open Badges ou VC.

`docs/adr/0011-operacoes-claude-code-mcp.md` — D11
- Contexto: o blueprint define o Claude Code como hub de conectores; ações externas têm risco de marca e de custo.
- Decisão: skills em `.claude/skills/` e servidores em `.mcp.json`; toda operação termina em PR; ações externas só após aprovação humana. O MCP remoto do HeyGen só aceita OAuth, então vídeos são gerados no Claude Code local do mantenedor; Buffer e Stripe aceitam chave e podem rodar no GitHub Actions.
- Alternativas: integrações dentro do app em tempo de execução (app mais pesado, sem revisão humana).
- Consequências: + app enxuto, trilha de auditoria, humano no circuito; − operações dependem de alguém com acesso aos conectores.
- Pilares: excelência operacional, segurança.
- Revisar quando: o HeyGen aceitar chave no MCP remoto.

`docs/adr/0012-financas-deterministicas.md` — D12
- Contexto: a transparência financeira precisa ser auditável por qualquer pessoa.
- Decisão: valores vêm de scripts determinísticos (Stripe, Cost Explorer, API de custos da Anthropic, assinaturas, PTAX do Banco Central) gravados em JSON versionado; a IA só redige o resumo em linguagem simples.
- Alternativas: relatório gerado por IA via MCP (não reprodutível).
- Consequências: + reprodutível e revisável em PR; − manutenção dos scripts quando as APIs mudarem.
- Pilares: excelência operacional.
- Revisar quando: surgir nova fonte de receita ou custo.

`docs/adr/0013-regiao-sa-east-1.md` — D13
- Contexto: público só no Brasil; latência da API; dados pessoais.
- Decisão: `sa-east-1` para tudo que a AWS permite; `us-east-1` só para ACM e WAF do CloudFront e Cost Explorer.
- Alternativas: `us-east-1` (mais barata, ~120 ms a mais por requisição).
- Consequências: + latência baixa e dados no Brasil; − preços 30–50% maiores em alguns serviços (impacto pequeno em serverless de baixo volume).
- Pilares: performance, custo.
- Revisar quando: algum serviço necessário não existir em `sa-east-1`.

`docs/adr/0014-contas-e-oidc.md` — D14
- Contexto: isolar falhas e acessos entre ambientes; custo por ambiente claro; nenhuma chave de longa duração.
- Decisão: AWS Organizations com conta de gerenciamento + `egt-dev` + `egt-prod`; estado Terraform em S3 por conta com lock nativo (`use_lockfile`); GitHub assume roles via OIDC: `plan` (ReadOnlyAccess, PRs), `apply` (AdministratorAccess, só em GitHub Environments protegidos; prod exige aprovação), `audit` (Resource Explorer, branch main). Buckets com SSE-S3 (sem CMK) por custo e baixo ganho.
- Alternativas: conta única com prefixos (blast radius maior); chaves de acesso no GitHub (risco de vazamento).
- Consequências: + isolamento e nenhuma chave longa; − role `apply` ampla (mitigada por environments com aprovação).
- Pilares: segurança, excelência operacional.
- Revisar quando: ao final da Fase 2 — restringir a role `apply` com permissions boundary.

`docs/adr/0015-padrao-de-tags.md` — D15
- Contexto: o mantenedor precisa enxergar o custo e remover 100% do projeto por uma única tag, e separar dev de prod.
- Decisão: tags obrigatórias `Project` (tag única do projeto), `Environment`, `Component`, `ManagedBy`, `Repository` e `DataClassification` em dados (tabela em `infra/CLAUDE.md`). Garantia em camadas: `default_tags` + `Component` por módulo; `tools/check-tags` no plano do PR; tflint; tag policy nas contas-membro; cost allocation tags; auditoria semanal com Resource Explorer (`tools/tag-audit`); runbook de remoção total.
- Alternativas: tags só por convenção (sem garantia).
- Consequências: + custo e inventário por projeto, ambiente e componente; remoção total guiada; − manutenção da lista de ignorados da auditoria e das listas de componentes.
- Pilares: custo, excelência operacional.
- Revisar quando: entrar um componente novo (atualizar `rules.ts`, `infra/CLAUDE.md` e esta ADR).

`docs/adr/0016-licencas.md` — D16
- Contexto: projeto beneficente e aberto; evitar clones comerciais fechados; conteúdo reutilizável por alunos e educadores.
- Decisão: código AGPL-3.0-or-later; conteúdo CC BY-SA 4.0; vídeos conforme a verificação dos termos do HeyGen (copie aqui o resumo e a data registrados em `LICENSE-CONTENT.md`); nome e marca reservados (`TRADEMARK.md`).
- Alternativas: MIT/Apache (permite fork fechado oferecido como serviço); CC BY-NC (impediria uso comercial legítimo pelos próprios alunos).
- Consequências: + derivados continuam livres; − algumas empresas evitam AGPL.
- Pilares: —
- Revisar quando: os termos do HeyGen mudarem ou houver pedido de licenciamento diferente.

`docs/adr/0017-idioma.md` — D17
- Contexto: comunidade e público brasileiros; código convive com bibliotecas e serviços em inglês.
- Decisão: docs, ADRs, commits e PRs em pt-BR; identificadores, comentários técnicos, logs e exceções em inglês; texto exibido a pessoas em pt-BR.
- Alternativas: tudo em pt-BR (foge do padrão de mercado que os alunos vão encontrar); tudo em inglês (afasta o público).
- Consequências: + acessível para a comunidade e alinhado ao mercado; − exige atenção na fronteira (mensagens de erro).
- Pilares: excelência operacional.
- Revisar quando: houver contribuidores frequentes fora do Brasil.

`docs/adr/0018-entidade-doacoes-parametrizada.md` — D18
- Contexto: ainda não está definido se as doações serão recebidas pela Engelmann Labs ou por uma associação sem fins lucrativos — isso muda textos legais e impostos.
- Decisão: nome, CNPJ e regime fiscal ficam em `content/transparency/entidade.yaml`; `/apoie` só é publicada com o arquivo preenchido (validado na CI, Fase 4).
- Alternativas: decidir agora (bloquearia o projeto).
- Consequências: + o sistema fica neutro e pronto; − a Fase 4 só vai ao ar após a decisão jurídica.
- Pilares: —
- Revisar quando: a entidade for definida (substituir esta ADR por uma nova).

- [ ] **Step 3: `docs/arquitetura/well-architected.md`**

```markdown
# Revisão AWS Well-Architected

Atualize este documento em todo PR que mudar a arquitetura (veja `infra/CLAUDE.md`). Status: **feito** (já em produção), **planejado** (fase indicada).

## Excelência operacional

| Prática | Status |
|---|---|
| Toda infraestrutura em Terraform, mudanças por PR com plano e delta de custo | feito (Fase 0) |
| Decisões registradas em ADRs | feito (Fase 0) |
| Deploy automatizado dev → aprovação → prod com smoke tests | feito (Fase 0) |
| Runbooks de bootstrap, GitHub, flat-rate, remoção total e MCP | feito (Fase 0) |
| Logs estruturados (Powertools) e alarmes de erro | planejado (Fase 1) |
| Operações (conteúdo, social, transparência) via skills do Claude Code terminando em PR | planejado (Fases 3–5) |

## Segurança

| Prática | Status |
|---|---|
| GitHub → AWS via OIDC, sem chaves de longa duração | feito (Fase 0) |
| Contas separadas por ambiente; role de apply só em environment protegido | feito (Fase 0) |
| S3 privado com OAC, política só-TLS e criptografia em repouso | feito (Fase 0) |
| WAF com regras gerenciadas e rate limit; CSP, HSTS e cabeçalhos de segurança | feito (Fase 0) |
| Tag policy e auditoria semanal de tags | feito (Fase 0) |
| Cognito, BFF com cookies HttpOnly, SMS MFA da equipe | planejado (Fase 1) |
| Proteções contra SSRF e injeção de prompt no corretor | planejado (Fase 2) |
| Chave de assinatura de certificados no KMS | planejado (Fase 2) |
| Permissions boundary na role de apply | planejado (fim da Fase 2) |

## Confiabilidade

| Prática | Status |
|---|---|
| Serviços gerenciados multi-AZ (S3, CloudFront) | feito (Fase 0) |
| Estado Terraform versionado com lock nativo | feito (Fase 0) |
| DynamoDB com PITR; SQS com DLQ; workers idempotentes | planejado (Fases 1–2) |

## Eficiência de performance

| Prática | Status |
|---|---|
| Site estático na borda, HTTP/3, compressão | feito (Fase 0) |
| Orçamentos de desempenho na CI (Lighthouse, 30 KB de JS) | feito (Fase 0) |
| Vídeo HLS adaptativo; Lambda arm64 | planejado (Fase 1) |

## Otimização de custos

| Prática | Status |
|---|---|
| Serverless pago por uso; nada ocioso | feito (Fase 0) |
| Infracost em todo PR de infra | feito (Fase 0) |
| Budgets por conta e detecção de anomalias por conta-membro | feito (Fase 0) |
| Tags de custo (Project, Environment, Component) | feito (Fase 0; ativação 24 h após o primeiro deploy) |
| CloudFront flat-rate | feito (Fase 0, via runbook) |
| Gatilho de revisão do Cognito em 30 mil MAU | planejado (Fase 1) |

## Sustentabilidade

| Prática | Status |
|---|---|
| Conteúdo estático com cache longo para assets imutáveis | feito (Fase 0) |
| Ciclo de vida para versões antigas no S3 | feito (Fase 0) |
| Graviton (arm64) nas Lambdas; originais de vídeo em camada fria | planejado (Fase 1) |
```

- [ ] **Step 4: Verificar e commitar**

```bash
ls docs/adr | wc -l   # 20 arquivos: README, modelo e 18 ADRs
grep -L "## Revisar quando" docs/adr/00[0-1][0-9]-*.md | grep -v 0000 || echo "todas as ADRs completas"
pnpm format && pnpm lint
git add docs/adr docs/arquitetura
git commit -m "docs: adiciona ADRs 0001-0018 e revisão Well-Architected" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `20`; `todas as ADRs completas`; lint verde.

---

### Task 14: Runbooks de operação

**Files:**
- Create: `docs/runbooks/bootstrap-aws.md`, `docs/runbooks/configurar-github.md`, `docs/runbooks/cloudfront-flat-rate.md`, `docs/runbooks/remover-projeto.md`

**Interfaces:**
- Consumes: raízes e saídas das Tasks 8–9; workflows e variáveis da Task 10.
- Produces: procedimentos seguidos nas Tasks 15–17.

- [ ] **Step 1: `docs/runbooks/bootstrap-aws.md`**

````markdown
# Bootstrap da AWS

Executado uma única vez pelo mantenedor, com acesso administrativo. Ordem: organização → buckets de estado → gerenciamento → dev → prod → DNS no GoDaddy → GitHub → primeiro deploy → tags de custo.

## 0. Pré-requisitos

- `mise install` (Terraform 1.16.5) e AWS CLI v2.
- Conta de gerenciamento com MFA no root e acesso administrativo pelo IAM Identity Center.

## 1. Organização e contas

```bash
aws organizations create-organization --feature-set ALL   # pule se a organização já existir
root_id="$(aws organizations list-roots --query 'Roots[0].Id' --output text)"
aws organizations enable-policy-type --root-id "$root_id" --policy-type TAG_POLICY
aws organizations create-account --email "<e-mail-raiz-dev>" --account-name egt-dev
aws organizations create-account --email "<e-mail-raiz-prod>" --account-name egt-prod
aws organizations list-accounts --query "Accounts[?starts_with(Name,'egt-')].[Name,Id]" --output table
```

Use e-mails distintos que você controla (ex.: endereços com `+`). Anote os IDs — eles **não** vão para o repositório.

## 2. Perfis de acesso

No IAM Identity Center, atribua o permission set `AdministratorAccess` ao seu usuário nas contas `egt-dev` e `egt-prod`. Crie perfis `egt-management`, `egt-dev` e `egt-prod` em `~/.aws/config` (`aws configure sso`) e faça login: `aws sso login --profile egt-dev`.

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

Se algum nome já existir na AWS (`BucketAlreadyExists`), use `escolagratis-tfstate-<env>-<id-da-conta>` e atualize `state_bucket_name` no `env/*.tfvars` e `bucket` no `env/*.backend.hcl` da raiz correspondente (bootstrap e `live`) num PR.

## 4. Conta de gerenciamento

```bash
export AWS_PROFILE=egt-management
export TF_VAR_member_account_ids='{"dev":"<id-dev>","prod":"<id-prod>"}'
export TF_VAR_alert_emails='["<seu-e-mail>"]'
infra/tf bootstrap/management shared plan
infra/tf bootstrap/management shared apply
```

Se a criação da tag policy falhar com `InvalidInputException` citando um tipo de recurso, remova esse tipo de `enforced_resource_types` em `infra/bootstrap/management/main.tf` e rode de novo.

## 5. Conta dev

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

(os valores acima são exemplos — use os da sua saída). Depois:

```bash
export AWS_PROFILE=egt-prod
infra/tf bootstrap/account prod apply
infra/tf bootstrap/account prod output -json zone_name_servers
```

## 7. DNS no GoDaddy

GoDaddy → Meus produtos → `escolagratisdetecnologia.com` → DNS → Servidores de nomes → **Alterar** → "Usarei meus próprios servidores de nomes" → cole os 4 name servers da etapa 6. A propagação pode levar algumas horas; confira:

```bash
curl -s "https://dns.google/resolve?name=escolagratisdetecnologia.com&type=NS" | python3 -m json.tool
```

## 8. GitHub

Siga `docs/runbooks/configurar-github.md` (variáveis com os IDs das contas e `ALERT_EMAILS`).

## 9. Primeiro deploy

Pelo pipeline (merge na `main` → job `dev` → aprovação → job `prod`). Depois, assine os planos flat-rate: `docs/runbooks/cloudfront-flat-rate.md`.

## 10. Tags de custo (24 h depois do primeiro deploy)

```bash
export AWS_PROFILE=egt-management
TF_VAR_activate_cost_allocation_tags=true infra/tf bootstrap/management shared apply
```

As tags passam a aparecer no Cost Explorer em até 24 h.
````

- [ ] **Step 2: `docs/runbooks/configurar-github.md`**

```markdown
# Configuração do repositório no GitHub

Repositório: `engelmannlabs/escolagratisdetecnologia` (público).

## Geral

- Settings → General → Pull Requests: permitir só **Squash merge**; marcar **Automatically delete head branches**.
- Settings → Actions → General → Workflow permissions: **Read repository contents**; marcar **Allow GitHub Actions to create and approve pull requests** (usado nas Fases 3–5).

## Proteção da `main` (Settings → Rules → Rulesets → New branch ruleset)

- Alvo: branch padrão.
- Exigir pull request antes do merge. Enquanto houver um único mantenedor, aprovações obrigatórias = 0 (o GitHub não permite aprovar o próprio PR); aumente para 1 quando houver outra pessoa mantenedora e ative "Require review from Code Owners".
- Exigir status checks: `verify`. (Os jobs de `infra` só rodam quando `infra/` muda; não os torne obrigatórios.)
- Bloquear force push e exclusão.

## Environments (Settings → Environments)

| Environment | Revisores | Branches | Variável |
|---|---|---|---|
| `dev` | nenhum | só `main` | `AWS_ACCOUNT_ID` = ID da conta egt-dev |
| `prod` | `engelmannlabs` (obrigatório) | só `main` | `AWS_ACCOUNT_ID` = ID da conta egt-prod |

## Variáveis e segredos (Settings → Secrets and variables → Actions)

| Tipo | Nome | Valor |
|---|---|---|
| Variable | `AWS_ACCOUNT_ID_DEV` | ID da conta egt-dev |
| Variable | `AWS_ACCOUNT_ID_PROD` | ID da conta egt-prod |
| Variable | `ALERT_EMAILS` | lista JSON, ex.: `["voce@exemplo.com"]` |
| Secret | `INFRACOST_API_KEY` | chave gratuita em https://dashboard.infracost.io |

## Segurança (Settings → Advanced Security)

- Dependabot alerts: ligado.
- Secret scanning e push protection: ligados.
- Code scanning: **CodeQL default setup** (JavaScript/TypeScript e GitHub Actions).

## Renovate

Instale o app **Renovate** (https://github.com/apps/renovate) só neste repositório e aceite o PR de onboarding.
```

- [ ] **Step 3: `docs/runbooks/cloudfront-flat-rate.md`**

```markdown
# Plano flat-rate do CloudFront

O provider Terraform AWS (6.67, verificado em 2026-10-03) não gerencia a assinatura do plano (ADR 0004). Faça pelo console, uma vez por distribuição (dev e prod).

## Assinar

1. Console do CloudFront (conta do ambiente) → Distributions → distribuição `egt-<env> site`.
2. **Manage plan** → escolha **Free** no beta (cada conta pode ter até 3 planos Free).
3. Em **Manage plan**, anexe a zona Route 53 do ambiente ao plano (passa a cobrir zona, registros e consultas).
4. Confirme que não há recursos não suportados (real-time logs, continuous deployment, rule groups próprios). O Terraform já associa o WAF exigido pelo plano.

## Depois de assinar

Rode `infra/tf live <env> plan`. O esperado é "No changes". Se o Terraform quiser desfazer algo do plano, abra uma issue e proponha, por PR, um `lifecycle { ignore_changes = [...] }` no atributo afetado do módulo `edge`.

## Quando subir de plano

A AWS envia e-mails em 50%, 80% e 100% da franquia mensal. Suba de plano quando o uso passar de 50% por 2 meses seguidos:

| Plano | Preço | Requisições/mês | Transferência/mês |
|---|---|---|---|
| Free | US$ 0 | 1 milhão | 100 GB |
| Pro | US$ 15 | 10 milhões | 50 TB |
| Business | US$ 200 | 125 milhões | 50 TB |

Registre a mudança na transparência (Fase 4) e no comentário de custo do PR mais próximo.
```

- [ ] **Step 4: `docs/runbooks/remover-projeto.md`**

````markdown
# Remover 100% do projeto da AWS

Irreversível. Só com decisão explícita do mantenedor. A tag `Project=escola-gratis-de-tecnologia` é a referência para achar tudo (ADR 0015).

## 1. Aplicação (prod, depois dev)

```bash
export AWS_PROFILE=egt-prod && infra/tf live prod destroy
export AWS_PROFILE=egt-dev && infra/tf live dev destroy
```

O bucket do site tem `force_destroy`, então é esvaziado automaticamente. Cancele antes os planos flat-rate no console do CloudFront.

## 2. Bootstrap das contas

O estado do bootstrap mora no bucket que será apagado. Para cada conta (prod, depois dev):

```bash
export AWS_PROFILE=egt-prod
infra/tf bootstrap/account prod state pull > /tmp/bootstrap-prod.tfstate
```

1. Remova localmente (sem commitar) os blocos `lifecycle { prevent_destroy = true }` de `infra/modules/state-bucket/main.tf` e da zona em `infra/bootstrap/account/main.tf`.
2. `infra/tf bootstrap/account prod destroy -target=aws_route53_zone.this -target=aws_resourceexplorer2_view.all -target=aws_resourceexplorer2_index.aggregator -target=aws_resourceexplorer2_index.us_east_1 -target=aws_iam_role.github -target=aws_iam_openid_connect_provider.github`
3. Esvazie e apague o bucket de estado:
   `aws s3api delete-objects --bucket escolagratis-tfstate-prod --delete "$(aws s3api list-object-versions --bucket escolagratis-tfstate-prod --query '{Objects: [Versions,DeleteMarkers][][].{Key: Key, VersionId: VersionId}}' --output json)"` e depois `aws s3api delete-bucket --bucket escolagratis-tfstate-prod`.

## 3. Conta de gerenciamento

```bash
export AWS_PROFILE=egt-management
infra/tf bootstrap/management shared destroy
```

Depois esvazie e apague `escolagratis-tfstate-management` como no passo 2.3.

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

- `aws organizations close-account --account-id <id>` para `egt-dev` e `egt-prod` (perfil de gerenciamento).
- No GoDaddy, volte os servidores de nomes para os padrões.
````

- [ ] **Step 5: Verificar e commitar**

```bash
pnpm format && pnpm lint
git add docs/runbooks
git commit -m "docs: adiciona runbooks de bootstrap AWS, GitHub, flat-rate e remoção total" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: lint verde.

---

### Task 15: [mantenedor] Publicar no GitHub e configurar o repositório

**Files:** nenhum arquivo novo (ações externas).

**Interfaces:**
- Consumes: `docs/runbooks/configurar-github.md` (Task 14).
- Produces: repositório público com `main` (spec + plano) e PR `fase-0/fundacao` aberto; settings, environments, variáveis e segredos configurados.

- [ ] **Step 1: Verificação final local**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @egt/web test:e2e
git status --short
```

Expected: tudo verde; `git status` vazio.

- [ ] **Step 2: Pedir aprovação e publicar**

Pergunte ao mantenedor antes de qualquer push. Com aprovação:

```bash
git ls-remote origin >/dev/null 2>&1 && echo "remoto existe" || echo "criar o repositório público engelmannlabs/escolagratisdetecnologia no GitHub (sem README) antes de seguir"
git push -u origin main
git push -u origin fase-0/fundacao
```

Abra o PR `fase-0/fundacao` → `main` com o título "Fase 0: fundação do monorepo, infra e governança", usando o template (delta de custo: "primeira infra; ver comentário do Infracost"; pilares: todos; ADR: 0001–0018). O corpo termina com:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 3: Configurar o repositório**

O mantenedor segue `docs/runbooks/configurar-github.md` (o Claude acompanha e confere cada item). As variáveis com IDs de conta só podem ser preenchidas depois da Task 16, passo 1.

---

### Task 16: [mantenedor] Bootstrap da AWS

**Files:**
- Modify: `infra/bootstrap/account/env/prod.tfvars` (delegação de `dev.`), commitado no PR da Fase 0.

**Interfaces:**
- Consumes: `docs/runbooks/bootstrap-aws.md` (Task 14); raízes de bootstrap (Task 9).
- Produces: contas, roles OIDC, zonas DNS e políticas; IDs das contas nas GitHub Variables.

- [ ] **Step 1: Seguir o runbook, passos 1 a 3**

O mantenedor executa (ou autoriza o Claude a executar, comando a comando, após `! aws sso login --profile <perfil>`). Cada `apply` só com aprovação explícita.

- [ ] **Step 2: Passos 4 a 6 do runbook (gerenciamento, dev, prod)**

Antes de cada `apply`, mostre o resumo do `plan` ao mantenedor. Depois do passo 6, faça commit da delegação:

```bash
git add infra/bootstrap/account/env/prod.tfvars
git commit -m "feat(infra): delega dev.escolagratisdetecnologia.com para a conta dev" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 3: DNS (passo 7) e GitHub (passo 8)**

O mantenedor troca os name servers no GoDaddy e preenche `AWS_ACCOUNT_ID_DEV`, `AWS_ACCOUNT_ID_PROD`, `ALERT_EMAILS` e o `AWS_ACCOUNT_ID` de cada environment. Confirme a propagação com `curl -s "https://dns.google/resolve?name=escolagratisdetecnologia.com&type=NS"`.

- [ ] **Step 4: Reexecutar os checks do PR**

Rode de novo o workflow `infra` no PR. Expected: `static` verde; `plan (dev)` e `plan (prod)` verdes, com `check-tags` dizendo "Tags OK"; comentário do Infracost publicado no PR com o custo mensal estimado.

---

### Task 17: [mantenedor] Primeiro deploy e aceite da Fase 0

**Files:** nenhum.

**Interfaces:**
- Consumes: workflows `deploy` e `auditoria-tags` (Task 10); runbooks (Task 14).
- Produces: "Em breve" no ar em dev e prod; critérios de pronto da Fase 0 conferidos.

- [ ] **Step 1: Merge e deploy**

Com `ci / verify` e `infra` verdes, o mantenedor faz o squash merge. O workflow `deploy` roda o job `dev` (apply + publicação + smoke) e para no environment `prod` aguardando aprovação. O mantenedor aprova; o job `prod` publica e confere o redirect do `www`.

- [ ] **Step 2: Conferir no ar**

```bash
tools/smoke.sh https://dev.escolagratisdetecnologia.com
tools/smoke.sh https://escolagratisdetecnologia.com
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.escolagratisdetecnologia.com/
curl -s https://dev.escolagratisdetecnologia.com/robots.txt
```

Expected: dois `Smoke OK`; `301 https://escolagratisdetecnologia.com/`; robots de dev com `Disallow: /`.

- [ ] **Step 3: Planos flat-rate e auditoria de tags**

O mantenedor segue `docs/runbooks/cloudfront-flat-rate.md` para dev e prod. Depois, dispare manualmente o workflow `auditoria-tags` (Actions → auditoria-tags → Run workflow). Expected: sem issue aberta, ou issue listando recursos padrão da AWS — nesse caso, adicione-os a `tools/tag-audit/ignore.json` num PR e rode de novo.

- [ ] **Step 4: Tags de custo (24 h depois)**

Runbook `bootstrap-aws.md`, passo 10.

- [ ] **Step 5: Checklist de pronto da Fase 0 (spec §17)**

- [ ] `pnpm dev` mostra a página e `/api/health` localmente (Task 3, Step 6)
- [ ] CI verde na `main`
- [ ] PR de infra recebeu comentário do Infracost e passou no `check-tags`
- [ ] Página "Em breve" no ar em `dev.escolagratisdetecnologia.com` e `escolagratisdetecnologia.com`
- [ ] Verificação da licença do HeyGen registrada (`LICENSE-CONTENT.md` e ADR 0016)
- [ ] Bootstrap aplicado: estado, OIDC, tag policy, anomalias de custo e (após 24 h) cost allocation tags

Atualize a memória do projeto e o `README.md` (linha de status) para "Fase 0 concluída" num PR curto.
