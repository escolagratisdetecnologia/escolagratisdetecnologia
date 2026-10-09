# Fase 1B — API e dados: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr a API no ar em dev e prod atrás do CloudFront (`/api/*`), com DynamoDB, alarmes por e-mail e ambiente local com DynamoDB Local, e entregar as rotas de progresso (ler, concluir aula, mesclar o progresso do aparelho) testadas com um login falso, prontas para o login de verdade do 1C.

**Architecture:** O pacote `@egt/db` define a tabela única e o repositório de progresso em duas implementações que passam pelos mesmos testes de contrato: DynamoDB (ElectroDB, mescla sem ler-e-regravar) e memória (testes e `pnpm dev` sem Docker). A API Hono recebe tudo por injeção (`createApp(deps)`): na Lambda, DynamoDB e nenhum login até o 1C; localmente, DynamoDB Local ou memória e login falso pelo cabeçalho `x-dev-user`. Na AWS, o módulo `data` cria a tabela com PITR, o `api` cria a Lambda (Node 24, arm64, bundle com o SDK) atrás de um API Gateway HTTP, o `observability` ganha o tópico SNS dos alarmes, e o `edge` passa `/api/*` para o API Gateway com um cabeçalho secreto, trocando só o 403 pela página 404 (ADR 0022).

**Tech Stack:** Hono 4, zod 4, ElectroDB 3, AWS SDK v3 (DynamoDB), Powertools Logger 2, esbuild 0.28, Vitest 5, DynamoDB Local 3.3.1 (Docker), Terraform 1.16 (providers `aws` ~> 6.67, `archive` ~> 2.8, `random` ~> 3.9).

**Spec:** `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md` (§3.2, §3.5, §3.6, §5.4, §11, §13 e §14). Escopo decidido com o mantenedor em 2026-10-09: a base da API na AWS **e** a camada de dados com as rotas de progresso, testadas com login falso; o 1C só pluga o login de verdade.

## Global Constraints

- Node `24.21.0`; pnpm `10.34.6`; TypeScript `~6.0.3`; `hono` `^4.13.13`; `@hono/node-server` `^2.1.3`; `zod` `^4.6.5`; `electrodb` `^3.9.3`; `@aws-sdk/client-dynamodb` e `@aws-sdk/lib-dynamodb` `^3.1149.0`; `@aws-lambda-powertools/logger` `^2.36.0`; `esbuild` `^0.28.2`.
- DynamoDB Local: imagem `amazon/dynamodb-local:3.3.1@sha256:ff89bd48ff32cd8d9be5fee8873b65b8854dc408f1afe881be6eb00247bc0dab` (a mesma no `docker-compose.yml` e na CI).
- Terraform `1.16.5`; providers `hashicorp/aws` `~> 6.67`, `hashicorp/archive` `~> 2.8`, `hashicorp/random` `~> 3.9`.
- Nomes (`egt-<env>-<componente>-<nome>`): tabela `egt-<env>-data-main` (local: `egt-local-data-main`); Lambda e role `egt-<env>-api-handler`; API `egt-<env>-api-http`; log groups `/aws/lambda/egt-<env>-api-handler` e `/aws/apigateway/egt-<env>-api-http`; tópico `egt-<env>-observability-alerts`; alarmes `egt-<env>-api-5xx`, `egt-<env>-api-lambda-errors` e `egt-<env>-api-lambda-throttles`.
- Tags: todo recurso tagueável declara `tags = local.tags`; `Component = "api"` no módulo `api`, `Component = "data"` **e** `DataClassification = "personal"` no `data`, `Component = "observability"` no tópico. Metadados que vão para a AWS (`description`, `comment`) em inglês e só ASCII.
- Erros da API sempre `{ error: { code, message } }`, `message` em pt-BR. **A API nunca responde 403 pelo CloudFront** (a borda troca 403 pela página 404 do site): só o acesso direto sem o cabeçalho `x-origin-verify` recebe 403. Os outros códigos são 400 `invalid_request`/`invalid_origin`, 401 `unauthenticated`, 404 `not_found`, 413 `payload_too_large`, 500 `internal_error` e 503 no health.
- Corpo de requisição até 8 KB (o limite da regra `SizeRestrictions_BODY` do WAF). Mudanças (tudo que não é GET, HEAD ou OPTIONS) exigem `Origin` igual ao site.
- Privacidade: nada de IP, e-mail ou corpo de requisição nos logs. `alert_emails` continua `sensitive`: use `count` com `nonsensitive(length(...))`, nunca `for_each` nem `nonsensitive` sobre os endereços (o plano é público nos logs do GitHub).
- Ninguém aplica Terraform neste plano: as tarefas só rodam `fmt`, `validate`, `test`, `tflint` e `trivy`. O `apply` acontece no deploy, depois do merge.
- `terraform validate` da raiz `live` sempre com dados isolados, porque a pasta `.terraform` do repositório pode ter o backend real configurado: `export TF_DATA_DIR="$(mktemp -d)" AWS_PROFILE= AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null` antes do `init -backend=false`. Para reaproveitar providers: `export TF_PLUGIN_CACHE_DIR="$HOME/.cache/terraform-plugins"`.
- Testes com DynamoDB Local: `pnpm db:up` e `DYNAMODB_ENDPOINT=http://localhost:8000`. Sem a variável, esses testes são pulados localmente; na CI (`CI=true`) eles sempre rodam.
- Idioma: docs, commits e PRs em pt-BR; identificadores, comentários técnicos, logs e mensagens de exceção em inglês; texto exibido a pessoas (respostas da API, avisos do servidor local) em pt-BR, no tom da Escola.
- TDD em toda lógica (teste que falha → implementação mínima → passa → commit). Commits em Conventional Commits pt-BR.
- Antes de `pnpm lint`, rode `pnpm format` (o Prettier ajusta os arquivos novos; o lint só confere). Para Terraform, `terraform fmt -recursive infra`.
- Em shells não interativos: `export PATH="$HOME/.local/share/mise/shims:$PATH"`. Os comandos assumem a raiz do repositório como diretório atual.

## Mapa de arquivos

| Caminho | Responsabilidade |
|---|---|
| `packages/db/src/client.ts` | `connect()`: clientes do DynamoDB (AWS ou DynamoDB Local) e o nome da tabela |
| `packages/db/src/table.ts` | Definição da tabela única (igual ao Terraform), `ensureTable`, `deleteTable`, `checkDatabase` |
| `packages/db/src/progress-repository.ts` | Interface `ProgressRepository` e regras comuns (conjuntos, datas) |
| `packages/db/src/memory-progress.ts` | Repositório em memória (testes e `pnpm dev` sem Docker) |
| `packages/db/src/dynamo-progress.ts` | Repositório no DynamoDB com ElectroDB (`USER#<sub>` / `COURSE#<slug>`) |
| `packages/db/test/progress-contract.ts` | Testes de contrato que as duas implementações passam |
| `apps/api/src/config.ts` | Configuração por ambiente (`loadConfig`) |
| `apps/api/src/logger.ts`, `errors.ts` | Logger do Powertools; formato dos erros |
| `apps/api/src/security.ts` | Segredo de origem, CSRF por `Origin`, `no-store`, limite de 8 KB |
| `apps/api/src/auth.ts` | `Authenticate`, `requireIdentity`, login falso local |
| `apps/api/src/routes/health.ts`, `routes/progress.ts` | Health com banco; rotas de progresso |
| `apps/api/src/local.ts` | DynamoDB Local ou memória para o `pnpm dev` |
| `apps/api/scripts/build.ts` | Bundle da Lambda (esbuild, com o AWS SDK) |
| `docker-compose.yml` | DynamoDB Local (`pnpm db:up`) |
| `infra/modules/data/` | Tabela DynamoDB |
| `infra/modules/api/` | Lambda, API Gateway HTTP, IAM, log groups, alarmes, segredo de origem |
| `infra/modules/observability/` | Ganha o tópico SNS dos alarmes |
| `infra/modules/edge/` | Ganha a origem `api`, o comportamento `/api/*`, o 403 como único erro mapeado e o 429 do WAF |
| `infra/live/` | Liga `data` e `api` e passa a API ao `edge` |
| `tools/smoke.sh` | Passa a conferir `/api/health`, a versão e o 404 em JSON da API |
| `docs/adr/0022-…`, `docs/adr/0023-…` | API na mesma distribuição; chaves da AWS em dados, logs e alertas |

## Rotas da API

| Rota | Quem pode | Resposta |
|---|---|---|
| `GET /api/health` | qualquer pessoa | 200 `{ status: "ok", environment, version, checks: { database: "ok" } }`; 503 com `status: "degraded"` e `database: "unavailable"` |
| `GET /api/progress` | aluno logado | 200 `Progress` (`{ version: 1, courses }`, o mesmo formato do `localStorage` do 1A) |
| `PUT /api/progress/{curso}/lessons/{aula}` | aluno logado, `Origin` do site | 200 `Progress`: a aula entra nas concluídas e vira a última |
| `POST /api/progress/merge` | aluno logado, `Origin` do site | 200 `Progress` completo depois da mescla (corpo: `{ version: 1, courses }`, até 50 cursos) |

Mescla (spec §4.4): aulas concluídas e respostas certas são unidas, nada é apagado; `lastLesson` e `updatedAt` seguem a atualização mais recente; datas no futuro contam como "agora". Até o 1C, a Lambda não tem login, então as rotas de progresso respondem 401 na AWS.

## Fora deste plano

- **Login de verdade** (Cognito, BFF com cookies, `mock-oauth2-server`, Mailpit), perfil, LGPD (baixar e excluir dados) e celular: 1C.
- **Site chamando a API** (sincronizar o progresso depois do login): 1C, junto com o login.
- **Rate limits próprios** de `/api/auth/*` e `/api/projects/*` (spec §5.4): 1C e Fase 2.
- **Conferir cursos e aulas contra o catálogo e calcular a conclusão no servidor:** Fase 2, com os certificados (até lá, o servidor só valida o formato dos slugs).
- **CloudTrail e IAM Access Analyzer** (spec §5.4): 1C, com a segurança das contas.
- **Dashboard do CloudWatch, X-Ray e concorrência reservada da Lambda:** só quando houver uma necessidade medida.
- **Pendências pequenas do 1A** (registradas no ledger): ficam fora, a não ser que uma tarefa passe por elas.

---

### Task 1: Pacote `@egt/db`: tabela, conexão e progresso em memória

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/vitest.config.ts`
- Create: `packages/db/src/client.ts`, `src/table.ts`, `src/progress-repository.ts`, `src/memory-progress.ts`, `src/index.ts`
- Create: `packages/db/test/progress-contract.ts`, `test/memory-progress.test.ts`
- Modify: `vitest.config.ts` (raiz)

**Interfaces:**
- Consumes: `CourseProgress` e `Progress` de `@egt/core` (Fase 1A).
- Produces (usados nas Tasks 2, 3 e 5):
  - `interface Database { raw: DynamoDBClient; document: DynamoDBDocumentClient; table: string }`
  - `connect(options: { table: string; endpoint?: string }): Database`
  - `tableDefinition(table: string): CreateTableCommandInput`, `ensureTable(db): Promise<'created' | 'exists'>`, `deleteTable(db): Promise<void>`, `checkDatabase(db): Promise<void>` (lança se a tabela não puder ser lida)
  - `interface ProgressRepository { get(sub: string): Promise<Progress>; merge(sub: string, courses: Record<string, CourseProgress>, now: Date): Promise<Progress> }`
  - `sortedUnique(values): string[]`, `normalizeTimestamp(value: string, now: Date): string`
  - `createMemoryProgressRepository(): ProgressRepository`
  - `describeProgressRepository(name: string, create: () => ProgressRepository): void` em `test/progress-contract.ts` (a Task 2 roda o mesmo contrato no DynamoDB)

- [ ] **Step 1: Criar o pacote**

`packages/db/package.json` (as dependências do ElectroDB e do SDK já entram aqui; a Task 2 as usa):

```json
{
  "name": "@egt/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.1149.0",
    "@aws-sdk/lib-dynamodb": "^3.1149.0",
    "@egt/core": "workspace:*",
    "electrodb": "^3.9.3"
  },
  "devDependencies": {
    "@types/node": "^24.19.1",
    "typescript": "~6.0.3"
  }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/db/vitest.config.ts`:

```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'db' },
});
```

No `vitest.config.ts` da raiz, acrescente `'packages/db',` logo depois de `'packages/core',` na lista `projects`. Depois:

Run: `pnpm install`
Expected: termina sem erro e cria `packages/db/node_modules`.

- [ ] **Step 2: Escrever os testes de contrato e o da memória**

`packages/db/test/progress-contract.ts` (não termina em `.test.ts`: é chamado pelos arquivos de teste de cada implementação):

```ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ProgressRepository } from '../src/index.ts';

const NOW = new Date('2026-10-09T12:00:00.000Z');

/** Behavior every ProgressRepository must have (memory and DynamoDB run the same tests). */
export function describeProgressRepository(name: string, create: () => ProgressRepository): void {
  describe(`${name}: ProgressRepository`, () => {
    const learner = () => `learner-${randomUUID()}`;

    it('starts empty', async () => {
      expect(await create().get(learner())).toEqual({ version: 1, courses: {} });
    });

    it('stores what a device sends', async () => {
      const repository = create();
      const sub = learner();

      const progress = await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['b', 'a'],
            correctAnswers: ['a#0'],
            lastLesson: 'b',
            updatedAt: '2026-10-09T10:00:00Z',
          },
        },
        NOW,
      );

      const expected = {
        version: 1,
        courses: {
          site: {
            completedLessons: ['a', 'b'],
            correctAnswers: ['a#0'],
            lastLesson: 'b',
            updatedAt: '2026-10-09T10:00:00.000Z',
          },
        },
      };
      expect(progress).toEqual(expected);
      expect(await repository.get(sub)).toEqual(expected);
    });

    it('unions lessons and answers and never removes anything', async () => {
      const repository = create();
      const sub = learner();
      await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['a', 'b'],
            correctAnswers: ['a#0'],
            updatedAt: '2026-10-09T10:00:00.000Z',
          },
        },
        NOW,
      );

      const progress = await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['c'],
            correctAnswers: [],
            updatedAt: '2026-10-09T09:00:00.000Z',
          },
        },
        NOW,
      );

      expect(progress.courses.site?.completedLessons).toEqual(['a', 'b', 'c']);
      expect(progress.courses.site?.correctAnswers).toEqual(['a#0']);
    });

    it('keeps the lastLesson of the newest update', async () => {
      const repository = create();
      const sub = learner();
      const course = (lastLesson: string, updatedAt: string) => ({
        site: { completedLessons: [], correctAnswers: [], lastLesson, updatedAt },
      });

      await repository.merge(sub, course('b', '2026-10-09T11:00:00.000Z'), NOW);
      const older = await repository.merge(sub, course('a', '2026-10-09T10:00:00.000Z'), NOW);
      expect(older.courses.site).toMatchObject({
        lastLesson: 'b',
        updatedAt: '2026-10-09T11:00:00.000Z',
      });

      const newer = await repository.merge(sub, course('c', '2026-10-09T11:30:00.000Z'), NOW);
      expect(newer.courses.site).toMatchObject({
        lastLesson: 'c',
        updatedAt: '2026-10-09T11:30:00.000Z',
      });
    });

    it('keeps the stored lastLesson when a newer update has none', async () => {
      const repository = create();
      const sub = learner();
      await repository.merge(
        sub,
        {
          site: {
            completedLessons: [],
            correctAnswers: [],
            lastLesson: 'b',
            updatedAt: '2026-10-09T10:00:00.000Z',
          },
        },
        NOW,
      );

      const progress = await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['a'],
            correctAnswers: [],
            updatedAt: '2026-10-09T11:00:00.000Z',
          },
        },
        NOW,
      );

      expect(progress.courses.site).toMatchObject({
        lastLesson: 'b',
        updatedAt: '2026-10-09T11:00:00.000Z',
      });
    });

    it('treats timestamps from the future as now', async () => {
      const repository = create();
      const sub = learner();

      const progress = await repository.merge(
        sub,
        {
          site: {
            completedLessons: ['a'],
            correctAnswers: [],
            updatedAt: '2030-01-01T00:00:00.000Z',
          },
        },
        NOW,
      );

      expect(progress.courses.site?.updatedAt).toBe(NOW.toISOString());
    });

    it('keeps learners and courses apart', async () => {
      const repository = create();
      const ana = learner();
      const bia = learner();
      const lesson = (slug: string) => ({
        completedLessons: [slug],
        correctAnswers: [],
        updatedAt: '2026-10-09T10:00:00.000Z',
      });

      await repository.merge(ana, { site: lesson('a'), planilhas: lesson('x') }, NOW);
      await repository.merge(bia, { site: lesson('b') }, NOW);

      expect(Object.keys((await repository.get(ana)).courses).sort()).toEqual([
        'planilhas',
        'site',
      ]);
      expect((await repository.get(bia)).courses).toEqual({ site: lesson('b') });
    });
  });
}
```

`packages/db/test/memory-progress.test.ts`:

```ts
import { createMemoryProgressRepository } from '../src/index.ts';
import { describeProgressRepository } from './progress-contract.ts';

describeProgressRepository('memory', createMemoryProgressRepository);
```

- [ ] **Step 3: Ver falhar**

Run: `pnpm exec vitest run --project db`
Expected: FAIL, porque `../src/index.ts` ainda não existe.

- [ ] **Step 4: Implementar**

`packages/db/src/client.ts`:

```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface Database {
  /** Low-level client, for table operations. */
  raw: DynamoDBClient;
  /** Document client, used by the ElectroDB entities. */
  document: DynamoDBDocumentClient;
  /** Table name: egt-<env>-data-main. */
  table: string;
}

export interface ConnectOptions {
  table: string;
  /** DynamoDB Local URL (http://localhost:8000). Omit it to use AWS with the default credentials. */
  endpoint?: string;
}

export function connect({ table, endpoint }: ConnectOptions): Database {
  const raw = endpoint
    ? new DynamoDBClient({
        endpoint,
        region: 'sa-east-1',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      })
    : new DynamoDBClient({});
  return { raw, document: DynamoDBDocumentClient.from(raw), table };
}
```

`packages/db/src/table.ts` (o esquema tem de ser igual ao de `infra/modules/data/main.tf`, Task 6):

```ts
import {
  CreateTableCommand,
  DeleteTableCommand,
  ResourceInUseException,
  type CreateTableCommandInput,
} from '@aws-sdk/client-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { Database } from './client.ts';

/** Single table (ADR 0006). Keep in sync with infra/modules/data/main.tf. */
export function tableDefinition(table: string): CreateTableCommandInput {
  return {
    TableName: table,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  };
}

/** Creates the table when missing. Local use only: in AWS the table comes from Terraform. */
export async function ensureTable(db: Database): Promise<'created' | 'exists'> {
  try {
    await db.raw.send(new CreateTableCommand(tableDefinition(db.table)));
    return 'created';
  } catch (error) {
    if (error instanceof ResourceInUseException) return 'exists';
    throw error;
  }
}

/** Local and tests only. */
export async function deleteTable(db: Database): Promise<void> {
  await db.raw.send(new DeleteTableCommand({ TableName: db.table }));
}

/** Throws when the table cannot be read (used by /api/health). */
export async function checkDatabase(db: Database): Promise<void> {
  await db.document.send(
    new GetCommand({ TableName: db.table, Key: { PK: 'HEALTH', SK: 'HEALTH' } }),
  );
}
```

`packages/db/src/progress-repository.ts`:

```ts
import type { CourseProgress, Progress } from '@egt/core';

/** Server-side learning progress. Merging never removes anything (spec §4.4). */
export interface ProgressRepository {
  get(sub: string): Promise<Progress>;
  /**
   * Merges courses sent by a device: completed lessons and correct answers are unioned; the
   * newest `updatedAt` decides `lastLesson`. Timestamps from the future count as `now`.
   * Returns the learner's whole progress.
   */
  merge(sub: string, courses: Record<string, CourseProgress>, now: Date): Promise<Progress>;
}

export const sortedUnique = (values: Iterable<string>): string[] => [...new Set(values)].sort();

/** ISO timestamp in the canonical toISOString() form, never after `now`. */
export function normalizeTimestamp(value: string, now: Date): string {
  return new Date(Math.min(Date.parse(value), now.getTime())).toISOString();
}
```

`packages/db/src/memory-progress.ts`:

```ts
import type { CourseProgress, Progress } from '@egt/core';
import {
  normalizeTimestamp,
  sortedUnique,
  type ProgressRepository,
} from './progress-repository.ts';

/** In-memory repository: for tests and for `pnpm dev` without Docker (lost on restart). */
export function createMemoryProgressRepository(): ProgressRepository {
  const learners = new Map<string, Map<string, CourseProgress>>();

  const read = (sub: string): Progress => {
    const courses: Record<string, CourseProgress> = {};
    for (const [slug, course] of learners.get(sub) ?? []) courses[slug] = structuredClone(course);
    return { version: 1, courses };
  };

  return {
    async get(sub) {
      return read(sub);
    },
    async merge(sub, courses, now) {
      const stored = learners.get(sub) ?? new Map<string, CourseProgress>();
      learners.set(sub, stored);
      for (const [slug, incoming] of Object.entries(courses)) {
        const updatedAt = normalizeTimestamp(incoming.updatedAt, now);
        const current = stored.get(slug);
        const newer = current === undefined || current.updatedAt < updatedAt;
        const lastLesson = newer
          ? (incoming.lastLesson ?? current?.lastLesson)
          : current.lastLesson;
        stored.set(slug, {
          completedLessons: sortedUnique([
            ...(current?.completedLessons ?? []),
            ...incoming.completedLessons,
          ]),
          correctAnswers: sortedUnique([
            ...(current?.correctAnswers ?? []),
            ...incoming.correctAnswers,
          ]),
          ...(lastLesson === undefined ? {} : { lastLesson }),
          updatedAt: newer ? updatedAt : current.updatedAt,
        });
      }
      return read(sub);
    },
  };
}
```

`packages/db/src/index.ts`:

```ts
export * from './client.ts';
export * from './memory-progress.ts';
export * from './progress-repository.ts';
export * from './table.ts';
```

- [ ] **Step 5: Ver passar**

Run: `pnpm exec vitest run --project db && pnpm --filter @egt/db typecheck`
Expected: 7 testes passam (`memory: ProgressRepository`); o typecheck termina sem erros.

- [ ] **Step 6: Commit**

```bash
git add packages/db vitest.config.ts pnpm-lock.yaml
git commit -m "feat(db): pacote @egt/db com a tabela única e o progresso em memória"
```

---

### Task 2: DynamoDB Local e progresso no DynamoDB (ElectroDB)

**Files:**
- Create: `docker-compose.yml`, `packages/db/src/dynamo-progress.ts`, `packages/db/test/dynamo.test.ts`
- Modify: `package.json` (raiz), `packages/db/src/index.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `Database`, `ensureTable`, `deleteTable`, `checkDatabase`, `ProgressRepository`, `describeProgressRepository` (Task 1).
- Produces: `createDynamoProgressRepository(db: Database): ProgressRepository` (usado nas Tasks 3 e 5); script raiz `pnpm db:up`.

O item fica em `PK = USER#<sub>`, `SK = COURSE#<slug>` (spec §3.5), com `casing: 'none'` para o ElectroDB não mudar maiúsculas. A mescla faz duas escritas por curso, seguras mesmo com vários aparelhos ao mesmo tempo: `ADD` une os conjuntos e um `SET` condicional só avança `lastLesson`/`updatedAt` (`updatedAt` ausente ou mais antigo). Quando a condição falha, o ElectroDB lança um erro cujo `cause.name` é `ConditionalCheckFailedException`: isso quer dizer "já existe algo mais novo" e é ignorado. O DynamoDB não aceita conjunto vazio, então o `ADD` só vai quando há algo a acrescentar.

- [ ] **Step 1: DynamoDB Local**

`docker-compose.yml` (raiz):

```yaml
# Local services (spec §13). `pnpm db:up` starts them; the API creates its table on startup.
# In memory: data lasts while the container runs (`docker compose down` erases it).
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
```

No `package.json` da raiz, acrescente aos `scripts`, depois de `content:check`:

```json
"db:up": "docker compose up -d --wait dynamodb"
```

Run: `pnpm db:up`
Expected: termina com o contêiner `dynamodb` em `Healthy`.

- [ ] **Step 2: Escrever o teste**

`packages/db/test/dynamo.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkDatabase,
  connect,
  createDynamoProgressRepository,
  deleteTable,
  ensureTable,
} from '../src/index.ts';
import { describeProgressRepository } from './progress-contract.ts';

// DynamoDB Local: `pnpm db:up` locally (export DYNAMODB_ENDPOINT=http://localhost:8000); the CI
// runs it as a service. Without it, these tests are skipped locally but never in the CI.
const endpoint =
  process.env.DYNAMODB_ENDPOINT ?? (process.env.CI ? 'http://localhost:8000' : undefined);

describe.skipIf(endpoint === undefined)('DynamoDB Local', () => {
  const db = connect({ endpoint, table: `egt-test-${randomUUID()}` });

  beforeAll(async () => {
    await ensureTable(db);
  });

  afterAll(async () => {
    await deleteTable(db);
  });

  it('ensureTable is idempotent', async () => {
    expect(await ensureTable(db)).toBe('exists');
  });

  it('checkDatabase passes for the table and fails without it', async () => {
    await expect(checkDatabase(db)).resolves.toBeUndefined();
    await expect(checkDatabase({ ...db, table: 'egt-test-nao-existe' })).rejects.toThrow();
  });

  describeProgressRepository('dynamodb', () => createDynamoProgressRepository(db));
});
```

- [ ] **Step 3: Ver falhar**

Run: `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm exec vitest run --project db`
Expected: FAIL em `dynamo.test.ts`, porque `createDynamoProgressRepository` ainda não existe.

- [ ] **Step 4: Implementar**

`packages/db/src/dynamo-progress.ts`:

```ts
import type { CourseProgress, Progress } from '@egt/core';
import { Entity } from 'electrodb';
import type { Database } from './client.ts';
import {
  normalizeTimestamp,
  sortedUnique,
  type ProgressRepository,
} from './progress-repository.ts';

/** PK USER#<sub> · SK COURSE#<slug> (spec §3.5). */
function courseProgressEntity(db: Database) {
  return new Entity(
    {
      model: { entity: 'courseProgress', version: '1', service: 'egt' },
      attributes: {
        sub: { type: 'string', required: true },
        course: { type: 'string', required: true },
        completedLessons: { type: 'set', items: 'string' },
        correctAnswers: { type: 'set', items: 'string' },
        lastLesson: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      indexes: {
        byUser: {
          pk: { field: 'PK', composite: ['sub'], template: 'USER#${sub}', casing: 'none' },
          sk: { field: 'SK', composite: ['course'], template: 'COURSE#${course}', casing: 'none' },
        },
      },
    },
    { client: db.document, table: db.table },
  );
}

const isConditionalCheckFailure = (error: unknown): boolean =>
  error instanceof Error &&
  (error.cause as { name?: string } | undefined)?.name === 'ConditionalCheckFailedException';

/**
 * Two writes per course, both safe to run concurrently from several devices: ADD unions the
 * sets, and the conditional SET only moves lastLesson/updatedAt forward. No read-modify-write.
 */
export function createDynamoProgressRepository(db: Database): ProgressRepository {
  const entity = courseProgressEntity(db);

  async function get(sub: string): Promise<Progress> {
    const { data } = await entity.query.byUser({ sub }).go({ pages: 'all' });
    const courses: Record<string, CourseProgress> = {};
    for (const item of data) {
      courses[item.course] = {
        completedLessons: sortedUnique(item.completedLessons ?? []),
        correctAnswers: sortedUnique(item.correctAnswers ?? []),
        ...(item.lastLesson === undefined ? {} : { lastLesson: item.lastLesson }),
        updatedAt: item.updatedAt ?? new Date(0).toISOString(),
      };
    }
    return { version: 1, courses };
  }

  return {
    get,
    async merge(sub, courses, now) {
      for (const [course, incoming] of Object.entries(courses)) {
        const sets: { completedLessons?: string[]; correctAnswers?: string[] } = {};
        if (incoming.completedLessons.length > 0) sets.completedLessons = incoming.completedLessons;
        if (incoming.correctAnswers.length > 0) sets.correctAnswers = incoming.correctAnswers;
        if (sets.completedLessons || sets.correctAnswers) {
          await entity.update({ sub, course }).add(sets).go();
        }

        const updatedAt = normalizeTimestamp(incoming.updatedAt, now);
        const latest =
          incoming.lastLesson === undefined
            ? { updatedAt }
            : { updatedAt, lastLesson: incoming.lastLesson };
        try {
          await entity
            .update({ sub, course })
            .set(latest)
            .where(
              (attributes, { notExists, lt }) =>
                `${notExists(attributes.updatedAt)} OR ${lt(attributes.updatedAt, updatedAt)}`,
            )
            .go();
        } catch (error) {
          // A newer update is already stored: keep it.
          if (!isConditionalCheckFailure(error)) throw error;
        }
      }
      return get(sub);
    },
  };
}
```

`packages/db/src/index.ts`:

```ts
export * from './client.ts';
export * from './dynamo-progress.ts';
export * from './memory-progress.ts';
export * from './progress-repository.ts';
export * from './table.ts';
```

- [ ] **Step 5: Ver passar, com e sem o DynamoDB Local**

Run: `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm exec vitest run --project db`
Expected: 16 testes passam (7 da memória, 7 do contrato no DynamoDB e os 2 de tabela).

Run: `pnpm exec vitest run --project db`
Expected: 7 passam e 9 são pulados (sem `DYNAMODB_ENDPOINT`, fora da CI).

Run: `pnpm --filter @egt/db typecheck`
Expected: sem erros.

- [ ] **Step 6: DynamoDB Local na CI**

Em `.github/workflows/ci.yml`, no job `verify`, acrescente o serviço logo depois de `runs-on: ubuntu-latest`:

```yaml
    services:
      # Same image as docker-compose.yml: repository and route integration tests.
      dynamodb:
        image: amazon/dynamodb-local:3.3.1@sha256:ff89bd48ff32cd8d9be5fee8873b65b8854dc408f1afe881be6eb00247bc0dab
        ports:
          - 8000:8000
```

e troque o passo `- run: pnpm test` por:

```yaml
      - run: pnpm test
        env:
          DYNAMODB_ENDPOINT: http://localhost:8000
```

(O serviço usa o comando padrão da imagem, `-jar DynamoDBLocal.jar -inMemory`.)

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml package.json packages/db .github/workflows/ci.yml
git commit -m "feat(db): progresso no DynamoDB com ElectroDB e DynamoDB Local"
```

---

### Task 3: API: configuração por ambiente, logs e health com banco

**Files:**
- Modify: `apps/api/package.json`, `apps/api/src/config.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/lambda.ts`, `apps/api/src/server.ts`
- Modify: `apps/api/test/app.test.ts`, `apps/api/test/config.test.ts`
- Create: `apps/api/src/logger.ts`, `apps/api/src/errors.ts`, `apps/api/src/local.ts`, `apps/api/test/helpers.ts`, `apps/api/test/local.test.ts`, `.env.example`

**Interfaces:**
- Consumes: `connect`, `ensureTable`, `checkDatabase`, `deleteTable`, `createDynamoProgressRepository`, `createMemoryProgressRepository`, `ProgressRepository` (Tasks 1 e 2).
- Produces (usados nas Tasks 4 e 5):
  - `interface AppConfig { environment: 'local' | 'dev' | 'prod'; version: string; tableName: string; dynamodbEndpoint?: string; siteOrigin: string; originVerifySecret?: string }` e `loadConfig(env?)`. Local tem padrões; em dev e prod, `APP_VERSION`, `TABLE_NAME`, `SITE_ORIGIN` e `ORIGIN_VERIFY_SECRET` são obrigatórias.
  - `createLogger(config): Logger` (Powertools); `apiError(code, message): ApiError`
  - `interface AppDeps { config: AppConfig; logger: Logger; checkDatabase: () => Promise<void> }` e `createApp(deps)` (a Task 5 acrescenta `progress`, `authenticate` e `now`)
  - `connectLocalStorage(config): Promise<{ mode: 'dynamodb' | 'memory'; progress: ProgressRepository; checkDatabase: () => Promise<void> }>`
  - Em `test/helpers.ts`: `SITE`, `config` e `testApp(overrides?: Partial<AppDeps>)`

- [ ] **Step 1: Dependências**

`apps/api/package.json` (o `dev` passa a ler um `.env` opcional da raiz; o `build` muda na Task 4):

```json
{
  "name": "@egt/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch --env-file-if-exists=../../.env src/server.ts",
    "build": "esbuild src/lambda.ts --bundle --platform=node --target=node24 --format=esm --sourcemap --outfile=dist/lambda.mjs",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@aws-lambda-powertools/logger": "^2.36.0",
    "@egt/db": "workspace:*",
    "@hono/node-server": "^2.1.3",
    "hono": "^4.13.13"
  },
  "devDependencies": {
    "@types/node": "^24.19.1",
    "esbuild": "^0.28.2",
    "typescript": "~6.0.3"
  }
}
```

Run: `pnpm install`
Expected: termina sem erro.

- [ ] **Step 2: Escrever os testes**

`apps/api/test/helpers.ts`:

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import { createApp, type AppDeps } from '../src/app.ts';
import type { AppConfig } from '../src/config.ts';

export const SITE = 'http://localhost:4321';

export const config: AppConfig = {
  environment: 'local',
  version: '9.9.9',
  tableName: 'egt-test-data-main',
  siteOrigin: SITE,
};

/** The app with a database that always answers; override what a test needs. */
export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    config,
    logger: new Logger({ logLevel: 'SILENT' }),
    checkDatabase: async () => {},
    ...overrides,
  });
}
```

`apps/api/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('uses local defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      environment: 'local',
      version: '0.0.0-local',
      tableName: 'egt-local-data-main',
      dynamodbEndpoint: 'http://localhost:8000',
      siteOrigin: 'http://localhost:4321',
    });
  });

  it('reads everything AWS sets', () => {
    expect(
      loadConfig({
        APP_ENV: 'prod',
        APP_VERSION: '1.2.3',
        TABLE_NAME: 'egt-prod-data-main',
        SITE_ORIGIN: 'https://escolagratisdetecnologia.com.br',
        ORIGIN_VERIFY_SECRET: 'segredo',
      }),
    ).toEqual({
      environment: 'prod',
      version: '1.2.3',
      tableName: 'egt-prod-data-main',
      siteOrigin: 'https://escolagratisdetecnologia.com.br',
      originVerifySecret: 'segredo',
    });
  });

  it('requires every AWS setting outside local', () => {
    expect(() =>
      loadConfig({ APP_ENV: 'dev', APP_VERSION: '1', SITE_ORIGIN: 'x', ORIGIN_VERIFY_SECRET: 'y' }),
    ).toThrow('Missing TABLE_NAME (required when APP_ENV is dev).');
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
import { testApp } from './helpers.ts';

describe('GET /api/health', () => {
  it('reports status, environment, version and the database check', async () => {
    const res = await testApp().request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ok',
      environment: 'local',
      version: '9.9.9',
      checks: { database: 'ok' },
    });
  });

  it('answers 503 when the database is unavailable', async () => {
    const app = testApp({
      checkDatabase: async () => {
        throw new Error('connection refused');
      },
    });

    const res = await app.request('/api/health');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: 'degraded',
      environment: 'local',
      version: '9.9.9',
      checks: { database: 'unavailable' },
    });
  });
});

describe('errors', () => {
  it('answer 404 with a pt-BR payload for unknown routes', async () => {
    const res = await testApp().request('/api/nao-existe');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Rota não encontrada.' },
    });
  });
});
```

`apps/api/test/local.test.ts` (a porta 9 nunca tem nada ouvindo, então a conexão é recusada na hora):

```ts
import { connect, deleteTable } from '@egt/db';
import { describe, expect, it } from 'vitest';
import { connectLocalStorage } from '../src/local.ts';
import { config } from './helpers.ts';

const endpoint =
  process.env.DYNAMODB_ENDPOINT ?? (process.env.CI ? 'http://localhost:8000' : undefined);

describe('connectLocalStorage', () => {
  it('falls back to memory when DynamoDB Local is down', async () => {
    const storage = await connectLocalStorage({
      ...config,
      dynamodbEndpoint: 'http://127.0.0.1:9',
    });

    expect(storage.mode).toBe('memory');
    await expect(storage.checkDatabase()).resolves.toBeUndefined();
  });

  it.skipIf(endpoint === undefined)('uses DynamoDB Local and creates the table', async () => {
    const tableName = `egt-test-local-${Date.now()}`;
    const storage = await connectLocalStorage({ ...config, tableName, dynamodbEndpoint: endpoint });

    try {
      expect(storage.mode).toBe('dynamodb');
      await expect(storage.checkDatabase()).resolves.toBeUndefined();
    } finally {
      await deleteTable(connect({ table: tableName, endpoint }));
    }
  });
});
```

- [ ] **Step 3: Ver falhar**

Run: `pnpm exec vitest run --project api`
Expected: FAIL (`loadConfig` sem os campos novos, `../src/local.ts` inexistente, health sem `checks`).

- [ ] **Step 4: Implementar**

`apps/api/src/config.ts`:

```ts
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

`apps/api/src/logger.ts`:

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import type { AppConfig } from './config.ts';

export function createLogger(config: AppConfig): Logger {
  return new Logger({
    serviceName: 'api',
    persistentKeys: { environment: config.environment, version: config.version },
  });
}
```

`apps/api/src/errors.ts`:

```ts
export interface ApiError {
  error: { code: string; message: string };
}

/** Error body of every route: code in English snake_case, message in pt-BR. */
export function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}
```

`apps/api/src/routes/health.ts`:

```ts
import type { Logger } from '@aws-lambda-powertools/logger';
import { Hono } from 'hono';
import type { AppConfig } from '../config.ts';

export interface HealthDeps {
  config: AppConfig;
  logger: Logger;
  checkDatabase: () => Promise<void>;
}

export function healthRoutes({ config, logger, checkDatabase }: HealthDeps) {
  return new Hono().get('/', async (c) => {
    const about = { environment: config.environment, version: config.version };
    try {
      await checkDatabase();
      return c.json({ status: 'ok', ...about, checks: { database: 'ok' } });
    } catch (error) {
      logger.warn('database_check_failed', { error });
      return c.json({ status: 'degraded', ...about, checks: { database: 'unavailable' } }, 503);
    }
  });
}
```

`apps/api/src/app.ts`:

```ts
import type { Logger } from '@aws-lambda-powertools/logger';
import { Hono } from 'hono';
import type { AppConfig } from './config.ts';
import { apiError } from './errors.ts';
import { healthRoutes } from './routes/health.ts';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  checkDatabase: () => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath('/api');
  app.route('/health', healthRoutes(deps));
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

`apps/api/src/local.ts`:

```ts
import {
  checkDatabase,
  connect,
  createDynamoProgressRepository,
  createMemoryProgressRepository,
  ensureTable,
  type ProgressRepository,
} from '@egt/db';
import type { AppConfig } from './config.ts';

export interface LocalStorage {
  mode: 'dynamodb' | 'memory';
  progress: ProgressRepository;
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
      checkDatabase: () => checkDatabase(db),
    };
  } catch {
    return {
      mode: 'memory',
      progress: createMemoryProgressRepository(),
      checkDatabase: async () => {},
    };
  }
}
```

- [ ] **Step 5: Ver passar**

Run: `pnpm exec vitest run --project api`
Expected: passam todos, menos o caso do DynamoDB Local em `local.test.ts`, que é pulado.

Run: `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm exec vitest run --project api`
Expected: passam todos (com `pnpm db:up` rodando).

- [ ] **Step 6: Entradas da Lambda e do servidor local**

`apps/api/src/lambda.ts`:

```ts
import { checkDatabase, connect } from '@egt/db';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const logger = createLogger(config);
const db = connect({ table: config.tableName });
const handleRequest = handle(createApp({ config, logger, checkDatabase: () => checkDatabase(db) }));

export const handler: typeof handleRequest = async (event, context) => {
  logger.addContext(context);
  return handleRequest(event, context);
};
```

`apps/api/src/server.ts`:

```ts
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { connectLocalStorage } from './local.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const port = Number(process.env.PORT ?? 3001);
const storage = await connectLocalStorage(config);
if (storage.mode === 'memory') {
  console.warn(
    'DynamoDB Local fora do ar: o progresso fica na memória e some ao reiniciar. Para usar o banco, rode pnpm db:up.',
  );
}

const app = createApp({
  config,
  logger: createLogger(config),
  checkDatabase: storage.checkDatabase,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API local em http://localhost:${info.port}/api/health`);
});
```

`.env.example` (raiz):

```bash
# Local settings for the API (pnpm dev). Copy to .env, which git ignores.
# Every value below is the default: uncomment only what you want to change.
# DYNAMODB_ENDPOINT=http://localhost:8000
# TABLE_NAME=egt-local-data-main
# SITE_ORIGIN=http://localhost:4321
# PORT=3001
```

Run: `pnpm --filter @egt/api typecheck`
Expected: sem erros.

Confira à mão, com o DynamoDB Local de pé (`pnpm db:up`):

```bash
PORT=3091 node apps/api/src/server.ts &
sleep 2 && curl -s localhost:3091/api/health
```

Expected: `{"status":"ok","environment":"local","version":"0.0.0-local","checks":{"database":"ok"}}`. Pare o servidor pelo PID (`ss -ltnp | grep 3091` mostra o PID; `kill <pid>`), rode `docker compose stop dynamodb`, suba o servidor de novo e confira que ele avisa "DynamoDB Local fora do ar: o progresso fica na memória e some ao reiniciar. Para usar o banco, rode pnpm db:up." e que o health continua `ok`. Pare o servidor e rode `pnpm db:up` outra vez.

- [ ] **Step 7: Commit**

```bash
git add apps/api .env.example pnpm-lock.yaml
git commit -m "feat(api): configuração por ambiente, logs com Powertools e health com banco"
```

---

### Task 4: API: origem protegida, CSRF, limite de corpo e bundle da Lambda

**Files:**
- Create: `apps/api/src/security.ts`, `apps/api/scripts/build.ts`, `apps/api/test/bundle.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/test/app.test.ts`, `apps/api/package.json`, `apps/api/tsconfig.json`

**Interfaces:**
- Consumes: `AppDeps`, `testApp`, `config`, `SITE`, `apiError` (Task 3).
- Produces:
  - `requireOriginVerify(secret?: string)`, `requireSiteOrigin(siteOrigin: string)`, `noStore`, `limitBody` (middlewares do Hono)
  - `buildLambda(outdir: string): Promise<void>` e o script `pnpm --filter @egt/api build`, que gera `apps/api/dist/lambda.mjs` (+ `.map`), empacotado pelo Terraform na Task 8

Regras (ADR 0022, escrita na Task 9): só o acesso direto sem `x-origin-verify` recebe 403, porque pelo CloudFront um 403 vira a página 404 do site. A `Origin` errada recebe 400. O corpo vai até 8 KB, como no WAF. O bundle **inclui** o AWS SDK, na versão fixada pelo lockfile: o ElectroDB é CommonJS e chama `require()` em tempo de execução, o que quebra num bundle ESM com o SDK externo. Por isso o banner cria um `require` com `createRequire`. Um teste carrega o bundle num Node separado, do jeito que a Lambda faz.

- [ ] **Step 1: Escrever os testes**

`apps/api/test/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { config, SITE, testApp } from './helpers.ts';

describe('GET /api/health', () => {
  it('reports status, environment, version and the database check', async () => {
    const res = await testApp().request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ok',
      environment: 'local',
      version: '9.9.9',
      checks: { database: 'ok' },
    });
  });

  it('answers 503 when the database is unavailable', async () => {
    const app = testApp({
      checkDatabase: async () => {
        throw new Error('connection refused');
      },
    });

    const res = await app.request('/api/health');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: 'degraded',
      environment: 'local',
      version: '9.9.9',
      checks: { database: 'unavailable' },
    });
  });
});

describe('errors', () => {
  it('answer 404 with a pt-BR payload for unknown routes', async () => {
    const res = await testApp().request('/api/nao-existe');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Rota não encontrada.' },
    });
  });
});

describe('origin secret (ADR 0022)', () => {
  const app = testApp({ config: { ...config, originVerifySecret: 'segredo-da-borda' } });

  it('refuses requests without the CloudFront secret', async () => {
    for (const secret of [undefined, 'errado', 'segredo-da-bordx']) {
      const headers: Record<string, string> =
        secret === undefined ? {} : { 'x-origin-verify': secret };
      const res = await app.request('/api/health', { headers });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: { code: 'forbidden', message: 'Acesso direto à API não é permitido.' },
      });
    }
  });

  it('lets CloudFront requests through', async () => {
    const res = await app.request('/api/health', {
      headers: { 'x-origin-verify': 'segredo-da-borda' },
    });

    expect(res.status).toBe(200);
  });
});

describe('changes only from the site (CSRF)', () => {
  it('refuses a change without the site Origin, with 400 (never 403)', async () => {
    for (const origin of [undefined, 'https://outro-site.example']) {
      const headers: Record<string, string> = origin === undefined ? {} : { origin };

      const res = await testApp().request('/api/nao-existe', { method: 'POST', headers });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: {
          code: 'invalid_origin',
          message:
            'Não conseguimos confirmar de onde veio o pedido. Recarregue a página e tente de novo.',
        },
      });
    }
  });

  it('lets changes from the site through', async () => {
    const res = await testApp().request('/api/nao-existe', {
      method: 'POST',
      headers: { origin: SITE },
    });

    expect(res.status).toBe(404);
  });

  it('allows reads from anywhere', async () => {
    const res = await testApp().request('/api/health');

    expect(res.status).toBe(200);
  });
});

describe('API answers', () => {
  it('are never cached', async () => {
    for (const path of ['/api/health', '/api/nao-existe']) {
      const res = await testApp().request(path);

      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('refuse bodies above 8 KB with 413, like the WAF', async () => {
    const res = await testApp().request('/api/nao-existe', {
      method: 'POST',
      headers: { origin: SITE, 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(8 * 1024) }),
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: {
        code: 'payload_too_large',
        message: 'O pedido ficou grande demais. Tente enviar menos de uma vez.',
      },
    });
  });
});
```

- [ ] **Step 2: Ver falhar**

Run: `pnpm exec vitest run --project api`
Expected: FAIL nos casos novos (segredo de origem, CSRF, `no-store` e 413).

- [ ] **Step 3: Implementar**

`apps/api/src/security.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { apiError } from './errors.ts';

// Through CloudFront a 403 becomes the site's 404 page (ADR 0022): only direct access, which
// never passes through CloudFront, may get 403.

/** Only CloudFront knows the secret it sends in x-origin-verify. Skipped locally. */
export function requireOriginVerify(secret: string | undefined): MiddlewareHandler {
  if (secret === undefined) return async (_c, next) => next();
  const expected = Buffer.from(secret);
  return async (c, next) => {
    const received = Buffer.from(c.req.header('x-origin-verify') ?? '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return c.json(apiError('forbidden', 'Acesso direto à API não é permitido.'), 403);
    }
    await next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF: changes only from the site's own pages (spec §3.6). */
export function requireSiteOrigin(siteOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && c.req.header('origin') !== siteOrigin) {
      return c.json(
        apiError(
          'invalid_origin',
          'Não conseguimos confirmar de onde veio o pedido. Recarregue a página e tente de novo.',
        ),
        400,
      );
    }
    await next();
  };
}

/** API answers are personal: no cache in the browser, the service worker or the CDN. */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
};

/** The WAF common rule set blocks bodies over 8 KB; fail the same way locally, in JSON. */
export const limitBody = bodyLimit({
  maxSize: 8 * 1024,
  onError: (c) =>
    c.json(
      apiError('payload_too_large', 'O pedido ficou grande demais. Tente enviar menos de uma vez.'),
      413,
    ),
});
```

`apps/api/src/app.ts`:

```ts
import type { Logger } from '@aws-lambda-powertools/logger';
import { Hono } from 'hono';
import type { AppConfig } from './config.ts';
import { apiError } from './errors.ts';
import { healthRoutes } from './routes/health.ts';
import { limitBody, noStore, requireOriginVerify, requireSiteOrigin } from './security.ts';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  checkDatabase: () => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath('/api');
  app.use(requireOriginVerify(deps.config.originVerifySecret));
  app.use(noStore);
  app.use(requireSiteOrigin(deps.config.siteOrigin));
  app.use(limitBody);
  app.route('/health', healthRoutes(deps));
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

Run: `pnpm exec vitest run --project api`
Expected: passam todos.

- [ ] **Step 4: Teste do bundle**

`apps/api/test/bundle.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildLambda } from '../scripts/build.ts';

const outdir = mkdtempSync(join(tmpdir(), 'egt-api-bundle-'));

/** Loads the real bundle in a separate Node, the way Lambda does, and sends it one event. */
function invoke(
  path: string,
  headers: Record<string, string>,
): { statusCode: number; body: string } {
  const event = {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'api.example', ...headers },
    requestContext: { http: { method: 'GET', path, sourceIp: '127.0.0.1' } },
    isBase64Encoded: false,
  };
  const script = `
    const { handler } = await import(${JSON.stringify(pathToFileURL(join(outdir, 'lambda.mjs')).href)});
    const response = await handler(${JSON.stringify(event)}, { awsRequestId: 'test', functionName: 'test' });
    process.stdout.write(JSON.stringify(response));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      APP_ENV: 'dev',
      APP_VERSION: 'test',
      TABLE_NAME: 'egt-test-data-main',
      SITE_ORIGIN: 'https://example.com',
      ORIGIN_VERIFY_SECRET: 'segredo',
      AWS_REGION: 'sa-east-1',
      POWERTOOLS_LOG_LEVEL: 'SILENT',
    },
  });
  return JSON.parse(output) as { statusCode: number; body: string };
}

describe('Lambda bundle', () => {
  beforeAll(async () => {
    await buildLambda(outdir);
  }, 60_000);

  it('loads and answers API Gateway events', () => {
    const response = invoke('/api/nao-existe', { 'x-origin-verify': 'segredo' });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      error: { code: 'not_found', message: 'Rota não encontrada.' },
    });
  });

  it('refuses requests that skip CloudFront', () => {
    expect(invoke('/api/health', {}).statusCode).toBe(403);
  });
});
```

`apps/api/tsconfig.json` (acrescenta `scripts`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "scripts", "vitest.config.ts"]
}
```

Run: `pnpm exec vitest run --project api test/bundle.test.ts`
Expected: FAIL, porque `../scripts/build.ts` ainda não existe.

- [ ] **Step 5: Script de build**

`apps/api/scripts/build.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** Bundles the Lambda handler with every dependency, AWS SDK included (versions from our lockfile). */
export async function buildLambda(outdir: string): Promise<void> {
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

`apps/api/package.json` (o `build` passa a usar o script):

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
    "@egt/db": "workspace:*",
    "@hono/node-server": "^2.1.3",
    "hono": "^4.13.13"
  },
  "devDependencies": {
    "@types/node": "^24.19.1",
    "esbuild": "^0.28.2",
    "typescript": "~6.0.3"
  }
}
```

Run: `pnpm exec vitest run --project api && pnpm --filter @egt/api typecheck && pnpm --filter @egt/api build && ls -l apps/api/dist`
Expected: os testes passam (inclusive os 2 do bundle); `dist/` tem `lambda.mjs` (cerca de 800 KB) e `lambda.mjs.map`.

- [ ] **Step 6: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): origem protegida, CSRF, limite de corpo e bundle da Lambda"
```

---

### Task 5: API: login falso e rotas de progresso

**Files:**
- Create: `apps/api/src/auth.ts`, `apps/api/src/routes/progress.ts`, `apps/api/test/auth.test.ts`, `apps/api/test/progress.test.ts`
- Modify: `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/lambda.ts`, `apps/api/src/server.ts`, `apps/api/test/helpers.ts`

**Interfaces:**
- Consumes: `ProgressRepository`, `createDynamoProgressRepository`, `createMemoryProgressRepository` (Tasks 1 e 2); `AppDeps`, `connectLocalStorage`, `testApp` (Tasks 3 e 4).
- Produces (o 1C troca só o `authenticate` da Lambda):
  - `interface Identity { sub: string }`, `type Authenticate = (request: Request) => Promise<Identity | null>`, `noAuthentication`, `createDevAuthenticator(config)` (lança fora do local), `requireIdentity(authenticate)`, `type AuthEnv`
  - `progressRoutes({ progress, authenticate, now? })`
  - `AppDeps` passa a ter `progress: ProgressRepository`, `authenticate: Authenticate` e `now?: () => Date`
  - Em `test/helpers.ts`: `NOW` e `learner(sub?)` (cabeçalhos de aluno logado mandando uma mudança do site); `testApp` usa memória e o cabeçalho `x-test-user` como login

- [ ] **Step 1: Dependência**

`apps/api/package.json`:

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
    "@egt/db": "workspace:*",
    "@hono/node-server": "^2.1.3",
    "hono": "^4.13.13",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/node": "^24.19.1",
    "esbuild": "^0.28.2",
    "typescript": "~6.0.3"
  }
}
```

Run: `pnpm install`
Expected: termina sem erro.

- [ ] **Step 2: Escrever os testes**

`apps/api/test/helpers.ts`:

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import { createMemoryProgressRepository } from '@egt/db';
import { createApp, type AppDeps } from '../src/app.ts';
import type { AppConfig } from '../src/config.ts';

export const SITE = 'http://localhost:4321';
export const NOW = new Date('2026-10-09T12:00:00.000Z');

export const config: AppConfig = {
  environment: 'local',
  version: '9.9.9',
  tableName: 'egt-test-data-main',
  siteOrigin: SITE,
};

/** The app with in-memory storage; the x-test-user header plays the logged-in learner. */
export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    config,
    logger: new Logger({ logLevel: 'SILENT' }),
    progress: createMemoryProgressRepository(),
    checkDatabase: async () => {},
    authenticate: async (request) => {
      const sub = request.headers.get('x-test-user');
      return sub === null ? null : { sub };
    },
    now: () => NOW,
    ...overrides,
  });
}

/** Headers of a logged-in learner sending a change from the site. */
export const learner = (sub = 'ana') => ({
  'x-test-user': sub,
  origin: SITE,
  'content-type': 'application/json',
});
```

`apps/api/test/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDevAuthenticator, noAuthentication } from '../src/auth.ts';
import { config } from './helpers.ts';

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/progress', { headers });

describe('createDevAuthenticator', () => {
  const authenticate = createDevAuthenticator(config);

  it('uses x-dev-user as the learner', async () => {
    expect(await authenticate(request({ 'x-dev-user': 'ana-1' }))).toEqual({ sub: 'ana-1' });
  });

  it('ignores missing or odd values', async () => {
    expect(await authenticate(request())).toBeNull();
    expect(await authenticate(request({ 'x-dev-user': 'Ana Maria' }))).toBeNull();
  });

  it('only exists locally', () => {
    expect(() => createDevAuthenticator({ ...config, environment: 'dev' })).toThrow(
      'The dev authenticator only runs locally.',
    );
  });
});

describe('noAuthentication', () => {
  it('never finds a learner (AWS until Phase 1C)', async () => {
    expect(await noAuthentication(request({ 'x-dev-user': 'ana' }))).toBeNull();
  });
});
```

`apps/api/test/progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { learner, NOW, testApp } from './helpers.ts';

const course = (completedLessons: string[], updatedAt: string, lastLesson?: string) => ({
  completedLessons,
  correctAnswers: [],
  ...(lastLesson === undefined ? {} : { lastLesson }),
  updatedAt,
});

describe('progress routes', () => {
  it('answer 500 without details when the storage breaks', async () => {
    const broken = async () => {
      throw new Error('boom');
    };
    const app = testApp({ progress: { get: broken, merge: broken } });

    const res = await app.request('/api/progress', { headers: learner() });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: {
        code: 'internal_error',
        message: 'Algo deu errado do nosso lado. Tenta de novo daqui a pouco.',
      },
    });
  });

  it('require a logged-in learner', async () => {
    const app = testApp();

    for (const [method, path] of [
      ['GET', '/api/progress'],
      ['PUT', '/api/progress/site/lessons/a'],
      ['POST', '/api/progress/merge'],
    ] as const) {
      const res = await app.request(path, { method, headers: { origin: 'http://localhost:4321' } });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: 'unauthenticated', message: 'Entre na sua conta para continuar.' },
      });
    }
  });

  it('GET starts empty', async () => {
    const res = await testApp().request('/api/progress', { headers: learner() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, courses: {} });
  });

  it('PUT marks a lesson as completed and as the last one', async () => {
    const app = testApp();

    const res = await app.request('/api/progress/site/lessons/o-que-e-um-site', {
      method: 'PUT',
      headers: learner(),
    });

    const expected = {
      version: 1,
      courses: { site: course(['o-que-e-um-site'], NOW.toISOString(), 'o-que-e-um-site') },
    };
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expected);
    expect(await (await app.request('/api/progress', { headers: learner() })).json()).toEqual(
      expected,
    );
  });

  it('PUT refuses invalid slugs', async () => {
    const res = await testApp().request('/api/progress/site/lessons/Aula%201', {
      method: 'PUT',
      headers: learner(),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'invalid_request',
        message: 'Os dados enviados não estão no formato esperado.',
      },
    });
  });

  it('POST /merge joins the device progress with the account and returns everything', async () => {
    const app = testApp();
    await app.request('/api/progress/site/lessons/a', { method: 'PUT', headers: learner() });

    const res = await app.request('/api/progress/merge', {
      method: 'POST',
      headers: learner(),
      body: JSON.stringify({
        version: 1,
        courses: {
          site: { ...course(['b'], '2026-10-09T08:00:00.000Z', 'b'), correctAnswers: ['b#0'] },
          planilhas: course(['x'], '2026-10-09T09:00:00.000Z'),
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: 1,
      courses: {
        site: {
          completedLessons: ['a', 'b'],
          correctAnswers: ['b#0'],
          lastLesson: 'a',
          updatedAt: NOW.toISOString(),
        },
        planilhas: course(['x'], '2026-10-09T09:00:00.000Z'),
      },
    });
  });

  it('POST /merge keeps learners apart', async () => {
    const app = testApp();
    await app.request('/api/progress/site/lessons/a', { method: 'PUT', headers: learner('ana') });

    const res = await app.request('/api/progress', { headers: learner('bia') });

    expect(await res.json()).toEqual({ version: 1, courses: {} });
  });

  it('POST /merge refuses malformed bodies', async () => {
    const app = testApp();
    const bodies = [
      'não é json',
      JSON.stringify({ version: 2, courses: {} }),
      JSON.stringify({ version: 1, courses: { site: course(['a'], 'ontem') } }),
      JSON.stringify({ version: 1, courses: { Site: course(['a'], NOW.toISOString()) } }),
      JSON.stringify({
        version: 1,
        courses: { site: { ...course([], NOW.toISOString()), correctAnswers: ['a#x'] } },
      }),
      JSON.stringify({
        version: 1,
        courses: Object.fromEntries(
          Array.from({ length: 51 }, (_, i) => [`curso-${i}`, course([], NOW.toISOString())]),
        ),
      }),
    ];

    for (const body of bodies) {
      const res = await app.request('/api/progress/merge', {
        method: 'POST',
        headers: learner(),
        body,
      });

      expect(res.status, body).toBe(400);
      expect(await res.json()).toEqual({
        error: {
          code: 'invalid_request',
          message: 'Os dados enviados não estão no formato esperado.',
        },
      });
    }
  });
});
```

- [ ] **Step 3: Ver falhar**

Run: `pnpm exec vitest run --project api`
Expected: FAIL (`../src/auth.ts` inexistente; as rotas de progresso respondem 404).

- [ ] **Step 4: Implementar**

`apps/api/src/auth.ts`:

```ts
import type { MiddlewareHandler } from 'hono';
import type { AppConfig } from './config.ts';
import { apiError } from './errors.ts';

export interface Identity {
  /** Stable learner id (Cognito `sub` from Phase 1C). */
  sub: string;
}

/** Finds out who is calling. Phase 1C plugs in the Cognito session; until then AWS has none. */
export type Authenticate = (request: Request) => Promise<Identity | null>;

export const noAuthentication: Authenticate = async () => null;

const DEV_USER = /^[a-z0-9-]{1,64}$/;

/** Fake login for local development: the x-dev-user header names the learner. */
export function createDevAuthenticator(config: AppConfig): Authenticate {
  if (config.environment !== 'local') {
    throw new Error('The dev authenticator only runs locally.');
  }
  return async (request) => {
    const sub = request.headers.get('x-dev-user');
    return sub !== null && DEV_USER.test(sub) ? { sub } : null;
  };
}

export type AuthEnv = { Variables: { identity: Identity } };

export function requireIdentity(authenticate: Authenticate): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const identity = await authenticate(c.req.raw);
    if (identity === null) {
      return c.json(apiError('unauthenticated', 'Entre na sua conta para continuar.'), 401);
    }
    c.set('identity', identity);
    await next();
  };
}
```

`apps/api/src/routes/progress.ts`:

```ts
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
  now?: () => Date;
}

export function progressRoutes({ progress, authenticate, now = () => new Date() }: ProgressDeps) {
  return new Hono<AuthEnv>()
    .use(requireIdentity(authenticate))
    .get('/', async (c) => c.json(await progress.get(c.var.identity.sub)))
    .put('/:course/lessons/:lesson', async (c) => {
      const params = lessonParams.safeParse(c.req.param());
      if (!params.success) return c.json(invalidRequest, 400);
      const { course, lesson } = params.data;
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
      return c.json(await progress.merge(c.var.identity.sub, body.data.courses, now()));
    });
}
```

`apps/api/src/app.ts`:

```ts
import type { Logger } from '@aws-lambda-powertools/logger';
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

Run: `pnpm exec vitest run --project api`
Expected: passam todos.

- [ ] **Step 5: Entradas**

`apps/api/src/lambda.ts` (na AWS, sem login até o 1C: as rotas de progresso respondem 401):

```ts
import { checkDatabase, connect, createDynamoProgressRepository } from '@egt/db';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { noAuthentication } from './auth.ts';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const logger = createLogger(config);
const db = connect({ table: config.tableName });
const handleRequest = handle(
  createApp({
    config,
    logger,
    progress: createDynamoProgressRepository(db),
    checkDatabase: () => checkDatabase(db),
    authenticate: noAuthentication,
  }),
);

export const handler: typeof handleRequest = async (event, context) => {
  logger.addContext(context);
  return handleRequest(event, context);
};
```

`apps/api/src/server.ts` (localmente, o cabeçalho `x-dev-user` faz o papel do login):

```ts
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createDevAuthenticator } from './auth.ts';
import { loadConfig } from './config.ts';
import { connectLocalStorage } from './local.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const port = Number(process.env.PORT ?? 3001);
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
  checkDatabase: storage.checkDatabase,
  authenticate: createDevAuthenticator(config),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API local em http://localhost:${info.port}/api/health`);
});
```

Confira à mão, com `pnpm db:up`:

```bash
PORT=3091 node apps/api/src/server.ts &
sleep 2
curl -s -X PUT -H 'x-dev-user: ana' -H 'origin: http://localhost:4321' \
  localhost:3091/api/progress/crie-seu-site-com-ia/lessons/o-que-e-um-site
curl -s -H 'x-dev-user: ana' localhost:3091/api/progress
curl -s -X PUT -H 'x-dev-user: ana' localhost:3091/api/progress/a/lessons/b
```

Expected: as duas primeiras respostas trazem `crie-seu-site-com-ia` com `completedLessons: ["o-que-e-um-site"]` e `lastLesson: "o-que-e-um-site"`; a terceira é `invalid_origin`. Pare o servidor pelo PID.

- [ ] **Step 6: Verificação da API inteira**

```bash
pnpm --filter @egt/api typecheck
DYNAMODB_ENDPOINT=http://localhost:8000 pnpm exec vitest run --project api --project db
pnpm --filter @egt/api build
```

Expected: tudo verde; o bundle fica com cerca de 1,3 MB (cerca de 320 KB em gzip).

- [ ] **Step 7: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): rotas de progresso com login falso local"
```

---

### Task 6: Terraform: módulo `data` (tabela DynamoDB)

**Files:**
- Create: `infra/modules/data/versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`, `tests/data.tftest.hcl`

**Interfaces:**
- Produces (usados na Task 10): `module.data.table_name`, `module.data.table_arn`; variáveis `name_prefix` e `deletion_protection` (padrão `true`).

A tabela segue `packages/db/src/table.ts` (Task 1): `PK`/`SK`, índice `GSI1` (`GSI1PK`/`GSI1SK`, já previsto no spec §3.5 para perfis, envios e certificados), TTL no atributo `ttl`, sob demanda, PITR e criptografia com a chave da AWS (ADR 0023, Task 7). No índice, use blocos `key_schema`: `hash_key`/`range_key` dentro de `global_secondary_index` estão obsoletos no provider 6.

- [ ] **Step 1: Escrever o teste e as variáveis**

`infra/modules/data/versions.tf`:

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

`infra/modules/data/variables.tf`:

```hcl
variable "name_prefix" {
  description = "Prefixo dos nomes: egt-<ambiente>."
  type        = string
}

variable "deletion_protection" {
  description = "Impede apagar a tabela (ligado em prod; a remoção total desliga antes, veja docs/runbooks/remover-projeto.md)."
  type        = bool
  default     = true
}
```

`infra/modules/data/tests/data.tftest.hcl`:

```hcl
mock_provider "aws" {}

variables {
  name_prefix = "egt-test"
}

run "single_table" {
  command = plan

  assert {
    condition     = aws_dynamodb_table.main.name == "egt-test-data-main"
    error_message = "Nome da tabela inesperado."
  }

  assert {
    condition     = aws_dynamodb_table.main.billing_mode == "PAY_PER_REQUEST"
    error_message = "A tabela deve ser sob demanda."
  }

  assert {
    condition     = aws_dynamodb_table.main.hash_key == "PK" && aws_dynamodb_table.main.range_key == "SK"
    error_message = "Chaves devem ser PK e SK (packages/db/src/table.ts)."
  }

  assert {
    condition     = one(aws_dynamodb_table.main.global_secondary_index).name == "GSI1"
    error_message = "Esperado o índice GSI1."
  }

  assert {
    condition     = one(aws_dynamodb_table.main.point_in_time_recovery).enabled
    error_message = "PITR deve estar ligado."
  }

  assert {
    condition     = one(aws_dynamodb_table.main.ttl).attribute_name == "ttl"
    error_message = "TTL deve usar o atributo ttl."
  }

  assert {
    condition     = aws_dynamodb_table.main.deletion_protection_enabled
    error_message = "Proteção contra exclusão deve vir ligada por padrão."
  }

  assert {
    condition     = aws_dynamodb_table.main.tags["DataClassification"] == "personal" && aws_dynamodb_table.main.tags["Component"] == "data"
    error_message = "Tags Component=data e DataClassification=personal são obrigatórias."
  }
}

run "without_deletion_protection" {
  command = plan

  variables {
    deletion_protection = false
  }

  assert {
    condition     = !aws_dynamodb_table.main.deletion_protection_enabled
    error_message = "deletion_protection = false deve desligar a proteção."
  }
}
```

- [ ] **Step 2: Ver falhar**

Run: `terraform -chdir=infra/modules/data init -backend=false -input=false >/dev/null && terraform -chdir=infra/modules/data test`
Expected: FAIL com "Reference to undeclared resource" (`aws_dynamodb_table.main`).

- [ ] **Step 3: Implementar**

`infra/modules/data/main.tf`:

```hcl
locals {
  tags = { Component = "data", DataClassification = "personal" }
}

# Single table (ADR 0006) with generic keys, modeled with ElectroDB in packages/db; keep the key
# schema in sync with packages/db/src/table.ts. Encrypted at rest with the AWS owned key (no
# cost); point-in-time recovery keeps 35 days of history.
resource "aws_dynamodb_table" "main" {
  name                        = "${var.name_prefix}-data-main"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "PK"
  range_key                   = "SK"
  deletion_protection_enabled = var.deletion_protection
  tags                        = local.tags

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    projection_type = "ALL"

    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "GSI1SK"
      key_type       = "RANGE"
    }
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }
}
```

`infra/modules/data/outputs.tf`:

```hcl
output "table_name" {
  description = "Nome da tabela única."
  value       = aws_dynamodb_table.main.name
}

output "table_arn" {
  description = "ARN da tabela única."
  value       = aws_dynamodb_table.main.arn
}
```

- [ ] **Step 4: Ver passar**

Run: `terraform fmt -check -recursive infra && terraform -chdir=infra/modules/data validate && terraform -chdir=infra/modules/data test`
Expected: `Success! The configuration is valid.` e `Success! 2 passed, 0 failed.`

- [ ] **Step 5: Commit**

```bash
git add infra/modules/data
git commit -m "feat(infra): módulo data com a tabela única do DynamoDB"
```

---

### Task 7: Terraform: tópico de alertas por e-mail (ADR 0023)

**Files:**
- Modify: `infra/modules/observability/main.tf`, `variables.tf`, `outputs.tf`, `tests/budget.tftest.hcl`
- Create: `docs/adr/0023-chaves-da-aws-em-dados-logs-e-alertas.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: `var.alert_emails` (já existe; `sensitive`).
- Produces (usado nas Tasks 8 e 10): `module.observability.alerts_topic_arn`.

O tópico fica sem criptografia em repouso: alarmes do CloudWatch não publicam em tópicos com a chave gerenciada `aws/sns`, e uma CMK custaria US$ 1 por mês por ambiente para proteger mensagens sem dados pessoais. O Trivy marca isso como HIGH (AWS-0095), então a exceção vai inline, com a justificativa (ADR 0023).

- [ ] **Step 1: Escrever os testes**

Em `infra/modules/observability/tests/budget.tftest.hcl`, no `run "with_alert_emails"`, acrescente depois da asserção do nome do orçamento:

```hcl
  assert {
    condition     = aws_sns_topic.alerts.name == "egt-test-observability-alerts"
    error_message = "Nome do tópico de alertas inesperado."
  }

  assert {
    condition     = length(aws_sns_topic_subscription.alert_email) == 1 && aws_sns_topic_subscription.alert_email[0].protocol == "email"
    error_message = "Esperada 1 assinatura por e-mail."
  }
```

e, no `run "without_alert_emails"`, depois da asserção existente:

```hcl
  assert {
    condition     = length(aws_sns_topic_subscription.alert_email) == 0
    error_message = "Sem e-mails, não deve haver assinaturas."
  }
```

Run: `terraform -chdir=infra/modules/observability init -backend=false -input=false >/dev/null && terraform -chdir=infra/modules/observability test`
Expected: FAIL com "Reference to undeclared resource".

- [ ] **Step 2: Implementar**

Ao fim de `infra/modules/observability/main.tf`:

```hcl

# Alarm notifications by e-mail; each address confirms its subscription once (link in the e-mail).
# Without a CMK: CloudWatch alarms cannot publish to topics encrypted with the AWS managed key,
# the messages carry only alarm metadata (no personal data), and a CMK would cost US$ 1/month
# per environment (ADR 0023).
#trivy:ignore:AWS-0095
resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-observability-alerts"
  tags = local.tags
}

# count (not for_each) keeps the addresses out of the plan: they stay sensitive.
resource "aws_sns_topic_subscription" "alert_email" {
  count     = nonsensitive(length(var.alert_emails))
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_emails[count.index]
}
```

Em `infra/modules/observability/variables.tf`, a `description` de `alert_emails` passa a ser `"E-mails que recebem alertas de orçamento e alarmes. Vazio desliga as notificações."`.

Ao fim de `infra/modules/observability/outputs.tf`:

```hcl

output "alerts_topic_arn" {
  description = "Tópico SNS dos alarmes (e-mail)."
  value       = aws_sns_topic.alerts.arn
}
```

- [ ] **Step 3: Ver passar**

Run: `terraform fmt -check -recursive infra && terraform -chdir=infra/modules/observability validate && terraform -chdir=infra/modules/observability test`
Expected: `Success! 2 passed, 0 failed.`

Run: `trivy config --quiet --severity HIGH,CRITICAL --exit-code 1 infra/modules/observability`
Expected: sai com 0 (o AWS-0095 aparece só se o comentário `#trivy:ignore:AWS-0095` não estiver logo acima do recurso).

- [ ] **Step 4: ADR 0023**

`docs/adr/0023-chaves-da-aws-em-dados-logs-e-alertas.md`:

```md
# 0023. Chaves da AWS em dados, logs e alertas

- Status: aceita
- Data: 2026-10-09
- Decisão do spec: D6 (complementa)

## Contexto

A Fase 1B cria a tabela DynamoDB, os log groups da API e um tópico SNS que leva os alarmes do CloudWatch por e-mail. O Trivy pede chave KMS própria (CMK) nos três: AWS-0025 e AWS-0017 (baixa severidade) e AWS-0095 (alta, tópico SNS sem criptografia). Alarmes do CloudWatch não conseguem publicar em tópicos criptografados com a chave gerenciada `aws/sns`: seria preciso uma CMK com política para o CloudWatch, a US$ 1 por mês por ambiente, mais as requisições.

## Decisão

- DynamoDB criptografado com a chave da AWS (padrão, sem custo), PITR de 35 dias e proteção contra exclusão em prod.
- Log groups com a criptografia padrão do CloudWatch Logs e retenção de 30 dias.
- Tópico `egt-<env>-observability-alerts` sem criptografia em repouso, com `#trivy:ignore:AWS-0095` e a justificativa inline. As mensagens têm só metadados do alarme (nome, métrica, estado), nada pessoal.
- Assinaturas por e-mail a partir do Secret `ALERT_EMAILS`, com `count` (não `for_each`) para os endereços continuarem `sensitive` no plano. Cada endereço confirma a assinatura uma vez.

## Alternativas consideradas

- CMK por ambiente: US$ 24 por ano sem ganho real, porque os dados já ficam criptografados em repouso e os alertas não têm dados pessoais.
- Alertas por SMS ou chat: custo e mais integrações para o mesmo aviso.
- Sem alarmes: um problema só apareceria quando alguém reclamasse.

## Consequências

- Positivas: custo zero de KMS; alarmes de erro desde a primeira API.
- Negativas: o tópico de alertas fica sem criptografia em repouso. Se os alertas passarem a carregar dados pessoais, esta decisão precisa ser revista.

## Pilares Well-Architected

Segurança (risco aceito e documentado), otimização de custos e excelência operacional (alarmes por e-mail).

## Revisar quando

As mensagens de alerta passarem a ter dados pessoais, ou o projeto adotar uma CMK simétrica por outro motivo.
```

Em `docs/adr/README.md`, acrescente ao fim da tabela a linha `| 0023 | Chaves da AWS em dados, logs e alertas | aceita |` e rode `pnpm exec prettier --write docs/adr`.

- [ ] **Step 5: Commit**

```bash
git add infra/modules/observability docs/adr
git commit -m "feat(infra): tópico de alertas por e-mail para os alarmes (ADR 0023)"
```

---

### Task 8: Terraform: módulo `api` (Lambda, API Gateway e alarmes)

**Files:**
- Create: `infra/modules/api/versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`, `tests/api.tftest.hcl`

**Interfaces:**
- Consumes: o build `apps/api/dist` (Task 4); `table_name`/`table_arn` (Task 6); `alerts_topic_arn` (Task 7).
- Produces (usados nas Tasks 9 e 10): `module.api.origin_domain` (domínio do API Gateway, sem `https://`), `module.api.origin_verify_secret` (`sensitive`), `module.api.endpoint`, `module.api.function_name`; variável `origin_verify_version` para trocar o segredo.

Pontos de atenção: o `archive_file` gera o zip em `.terraform/build/` da raiz que chama o módulo, com `output_file_mode = "0644"`, e o hash não muda quando só a data ou a permissão dos arquivos muda. O log group é criado aqui e ligado pelo `logging_config`, nunca implicitamente. A política IAM tem só `GetItem`, `Query` e `UpdateItem` na tabela, o que as rotas usam hoje. O log de acesso do API Gateway não guarda IP. Os alarmes disparam com uma ocorrência em 5 minutos.

- [ ] **Step 1: Escrever o teste, as variáveis e as versões**

`infra/modules/api/versions.tf`:

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
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}
```

`infra/modules/api/variables.tf`:

```hcl
variable "name_prefix" {
  description = "Prefixo dos nomes: egt-<ambiente>."
  type        = string
}

variable "environment" {
  description = "Ambiente (dev ou prod), repassado à API como APP_ENV."
  type        = string
}

variable "package_dir" {
  description = "Pasta com o build da API (apps/api/dist, gerado por pnpm --filter @egt/api build)."
  type        = string
}

variable "app_version" {
  description = "Versão publicada (o commit do deploy), exposta em /api/health."
  type        = string
}

variable "site_origin" {
  description = "Origem do site (https://<domínio>), a única aceita em mudanças (CSRF)."
  type        = string
}

variable "table_name" {
  description = "Tabela DynamoDB da aplicação."
  type        = string
}

variable "table_arn" {
  description = "ARN da tabela, para a política de menor privilégio."
  type        = string
}

variable "alarm_topic_arn" {
  description = "Tópico SNS que recebe os alarmes."
  type        = string
}

variable "origin_verify_version" {
  description = "Troque o número para gerar um novo segredo de origem (rotação, ADR 0022)."
  type        = number
  default     = 1
}

variable "log_retention_days" {
  description = "Retenção dos logs da Lambda e do API Gateway."
  type        = number
  default     = 30
}

variable "throttling_burst_limit" {
  description = "Pico de requisições simultâneas aceito pelo API Gateway."
  type        = number
  default     = 100
}

variable "throttling_rate_limit" {
  description = "Requisições por segundo sustentadas no API Gateway."
  type        = number
  default     = 50
}
```

`infra/modules/api/tests/api.tftest.hcl`:

```hcl
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      id            = "abc123"
      api_endpoint  = "https://abc123.execute-api.sa-east-1.amazonaws.com"
      execution_arn = "arn:aws:execute-api:sa-east-1:123456789012:abc123"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:sa-east-1:123456789012:log-group:egt-test"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/egt-test-api-handler"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      invoke_arn = "arn:aws:apigateway:sa-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:sa-east-1:123456789012:function:egt-test-api-handler/invocations"
    }
  }
}

mock_provider "archive" {
  mock_data "archive_file" {
    defaults = {
      output_path         = "api-lambda.zip"
      output_base64sha256 = "aGFzaA=="
    }
  }
}

mock_provider "random" {}

variables {
  name_prefix     = "egt-test"
  environment     = "dev"
  package_dir     = "dist"
  app_version     = "abc1234"
  site_origin     = "https://dev.example.com"
  table_name      = "egt-test-data-main"
  table_arn       = "arn:aws:dynamodb:sa-east-1:123456789012:table/egt-test-data-main"
  alarm_topic_arn = "arn:aws:sns:sa-east-1:123456789012:egt-test-observability-alerts"
}

run "lambda_behind_http_api" {
  command = apply

  assert {
    condition     = aws_lambda_function.handler.function_name == "egt-test-api-handler"
    error_message = "Nome da Lambda inesperado."
  }

  assert {
    condition     = aws_lambda_function.handler.runtime == "nodejs24.x" && aws_lambda_function.handler.architectures == tolist(["arm64"])
    error_message = "A Lambda deve rodar Node 24 em arm64."
  }

  assert {
    condition     = aws_lambda_function.handler.environment[0].variables["APP_ENV"] == "dev" && aws_lambda_function.handler.environment[0].variables["TABLE_NAME"] == "egt-test-data-main" && aws_lambda_function.handler.environment[0].variables["SITE_ORIGIN"] == "https://dev.example.com"
    error_message = "Variáveis de ambiente da API incompletas."
  }

  assert {
    condition     = aws_lambda_function.handler.environment[0].variables["ORIGIN_VERIFY_SECRET"] == random_password.origin_verify.result
    error_message = "A Lambda deve conhecer o segredo de origem."
  }

  assert {
    condition     = aws_lambda_function.handler.logging_config[0].log_group == "/aws/lambda/egt-test-api-handler"
    error_message = "A Lambda deve escrever no log group criado pelo Terraform."
  }

  assert {
    condition     = aws_cloudwatch_log_group.handler.retention_in_days == 30 && aws_cloudwatch_log_group.access.retention_in_days == 30
    error_message = "Logs devem ficar 30 dias."
  }

  assert {
    condition     = aws_apigatewayv2_route.default.route_key == "$default"
    error_message = "Toda requisição deve ir para a Lambda."
  }

  assert {
    condition     = !strcontains(aws_apigatewayv2_stage.default.access_log_settings[0].format, "sourceIp")
    error_message = "O log de acesso não guarda IP."
  }

  assert {
    condition     = output.origin_domain == "abc123.execute-api.sa-east-1.amazonaws.com"
    error_message = "A origem do CloudFront é o domínio do API Gateway, sem https://."
  }

  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.api)) == toset(["5xx", "lambda-errors", "lambda-throttles"])
    error_message = "Esperados os alarmes 5xx, lambda-errors e lambda-throttles."
  }

  assert {
    condition     = alltrue([for alarm in aws_cloudwatch_metric_alarm.api : alarm.alarm_actions == toset(["arn:aws:sns:sa-east-1:123456789012:egt-test-observability-alerts"])])
    error_message = "Todo alarme deve avisar o tópico de alertas."
  }
}
```

- [ ] **Step 2: Ver falhar**

Run: `terraform -chdir=infra/modules/api init -backend=false -input=false >/dev/null && terraform -chdir=infra/modules/api test`
Expected: FAIL com "Reference to undeclared resource".

- [ ] **Step 3: Implementar**

`infra/modules/api/main.tf`:

```hcl
locals {
  tags          = { Component = "api" }
  function_name = "${var.name_prefix}-api-handler"
  alarms = {
    "5xx" = {
      namespace   = "AWS/ApiGateway"
      metric      = "5xx"
      dimensions  = { ApiId = aws_apigatewayv2_api.http.id }
      description = "API answered 5xx"
    }
    "lambda-errors" = {
      namespace   = "AWS/Lambda"
      metric      = "Errors"
      dimensions  = { FunctionName = local.function_name }
      description = "API Lambda failed (crash or timeout)"
    }
    "lambda-throttles" = {
      namespace   = "AWS/Lambda"
      metric      = "Throttles"
      dimensions  = { FunctionName = local.function_name }
      description = "API Lambda was throttled"
    }
  }
}

# --- Package (built by the CI before plan/apply: pnpm --filter @egt/api build) ---

data "archive_file" "package" {
  type             = "zip"
  source_dir       = var.package_dir
  output_path      = "${path.root}/.terraform/build/api-lambda.zip"
  output_file_mode = "0644"
}

# CloudFront sends this value in x-origin-verify; without it the API answers 403 (ADR 0022).
# Bump origin_verify_version in a PR to rotate it (docs/runbooks/deploy.md).
resource "random_password" "origin_verify" {
  length  = 48
  special = false

  keepers = {
    version = var.origin_verify_version
  }
}

# --- Lambda ---

resource "aws_cloudwatch_log_group" "handler" {
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

resource "aws_iam_role" "handler" {
  name               = local.function_name
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
  tags               = local.tags
}

# Least privilege: only what the routes use today (grow it with the routes).
data "aws_iam_policy_document" "handler" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.handler.arn}:*"]
  }

  statement {
    sid       = "ReadWriteTable"
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem"]
    resources = [var.table_arn]
  }
}

resource "aws_iam_role_policy" "handler" {
  name   = "least-privilege"
  role   = aws_iam_role.handler.id
  policy = data.aws_iam_policy_document.handler.json
}

resource "aws_lambda_function" "handler" {
  function_name    = local.function_name
  description      = "School API (Hono)"
  role             = aws_iam_role.handler.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "lambda.handler"
  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256
  memory_size      = 512
  timeout          = 10
  tags             = local.tags

  environment {
    variables = {
      APP_ENV              = var.environment
      APP_VERSION          = var.app_version
      TABLE_NAME           = var.table_name
      SITE_ORIGIN          = var.site_origin
      ORIGIN_VERIFY_SECRET = random_password.origin_verify.result
      NODE_OPTIONS         = "--enable-source-maps"
    }
  }

  logging_config {
    log_format            = "JSON"
    log_group             = aws_cloudwatch_log_group.handler.name
    application_log_level = "INFO"
    system_log_level      = "WARN"
  }

  depends_on = [aws_iam_role_policy.handler]
}

# --- API Gateway (HTTP API) ---

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.name_prefix}-api-http"
  protocol_type = "HTTP"
  tags          = local.tags
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name_prefix}-api-http"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
  tags        = local.tags

  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }

  # No IP or user agent: only what is needed to operate the API (LGPD).
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      time             = "$context.requestTime"
      method           = "$context.httpMethod"
      path             = "$context.path"
      status           = "$context.status"
      latencyMs        = "$context.responseLatency"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_apigatewayv2_integration" "handler" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.handler.invoke_arn
  payload_format_version = "2.0"
}

# Hono does the routing: every request goes to the Lambda.
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.handler.id}"
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handler.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# --- Alarms (any occurrence in 5 minutes; e-mail via the observability topic) ---

resource "aws_cloudwatch_metric_alarm" "api" {
  for_each = local.alarms

  alarm_name          = "${var.name_prefix}-api-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  dimensions          = each.value.dimensions
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = local.tags
}
```

`infra/modules/api/outputs.tf`:

```hcl
output "origin_domain" {
  description = "Domínio do API Gateway, origem do caminho /api/* no CloudFront."
  value       = replace(aws_apigatewayv2_api.http.api_endpoint, "https://", "")
}

output "endpoint" {
  description = "URL direta do API Gateway (só para conferir que ela recusa acesso direto)."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "origin_verify_secret" {
  description = "Segredo que o CloudFront envia em x-origin-verify."
  value       = random_password.origin_verify.result
  sensitive   = true
}

output "function_name" {
  description = "Nome da Lambda da API."
  value       = aws_lambda_function.handler.function_name
}
```

- [ ] **Step 4: Ver passar**

```bash
terraform fmt -check -recursive infra
terraform -chdir=infra/modules/api validate
terraform -chdir=infra/modules/api test
(cd infra && tflint --init --config "$PWD/.tflint.hcl" >/dev/null && tflint --recursive --config "$PWD/.tflint.hcl")
trivy config --quiet --severity HIGH,CRITICAL --exit-code 1 infra/modules/api
```

Expected: `Success! 1 passed, 0 failed.`; tflint e Trivy sem achados. Achados LOW do Trivy sem bloqueio (AWS-0017 nos log groups e AWS-0066, X-Ray) são esperados e cobertos pela ADR 0023 e pelo "Fora deste plano".

- [ ] **Step 5: Commit**

```bash
git add infra/modules/api
git commit -m "feat(infra): módulo api com Lambda, API Gateway HTTP e alarmes"
```

---

### Task 9: Terraform: API no CloudFront em `/api/*` (ADR 0022)

**Files:**
- Modify: `infra/modules/edge/main.tf`, `infra/modules/edge/variables.tf`, `infra/modules/edge/tests/edge.tftest.hcl`
- Create: `docs/adr/0022-api-na-mesma-distribuicao.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: `module.api.origin_domain` e `module.api.origin_verify_secret` (Task 8), ligados na Task 10.
- Produces: variáveis `api_origin_domain` e `api_origin_verify_secret` (`sensitive`) no módulo `edge`.

As páginas de erro do CloudFront valem para a distribuição inteira (não há por caminho, e CloudFront Functions não rodam em respostas da origem). Por isso: só o 403, que é como o S3 com OAC responde a arquivo inexistente, vira a página 404; a API nunca responde 403 pela borda; o rate limit passa a responder 429 com JSON; e o comportamento `/api/*` não usa a função de borda, que reescreveria os caminhos para `index.html`.

- [ ] **Step 1: Escrever os testes**

Em `infra/modules/edge/tests/edge.tftest.hcl`:

1. No bloco `variables` do topo, acrescente depois de `site_bucket_regional_domain_name`:

```hcl
  api_origin_domain                = "abc123.execute-api.sa-east-1.amazonaws.com"
  api_origin_verify_secret         = "segredo-de-teste"
```

2. A distribuição passa a ter duas origens. Troque a condição da asserção "A distribuição deveria usar o OAC." por:

```hcl
    condition     = one([for o in aws_cloudfront_distribution.site.origin : o if o.origin_id == "site"]).origin_access_control_id == aws_cloudfront_origin_access_control.site.id
```

3. Ao fim do arquivo, acrescente:

```hcl

run "api_on_the_same_distribution" {
  command = apply

  variables {
    domain_name = "dev.escolagratisdetecnologia.com"
  }

  assert {
    condition = (
      one([for o in aws_cloudfront_distribution.site.origin : o if o.origin_id == "api"]).domain_name == "abc123.execute-api.sa-east-1.amazonaws.com" &&
      one(one([for o in aws_cloudfront_distribution.site.origin : o if o.origin_id == "api"]).custom_header).name == "x-origin-verify"
    )
    error_message = "A origem api deveria apontar para o API Gateway com o cabeçalho secreto."
  }

  assert {
    condition = (
      one(aws_cloudfront_distribution.site.ordered_cache_behavior).path_pattern == "/api/*" &&
      one(aws_cloudfront_distribution.site.ordered_cache_behavior).target_origin_id == "api" &&
      one(aws_cloudfront_distribution.site.ordered_cache_behavior).cache_policy_id == data.aws_cloudfront_cache_policy.disabled.id &&
      length(one(aws_cloudfront_distribution.site.ordered_cache_behavior).function_association) == 0
    )
    error_message = "/api/* deveria ir para a API, sem cache e sem a função de borda."
  }

  assert {
    condition     = [for r in aws_cloudfront_distribution.site.custom_error_response : r.error_code] == [403]
    error_message = "Só o 403 do S3 vira a página 404; erros da API passam intactos (ADR 0022)."
  }

  assert {
    condition = anytrue([
      for r in aws_wafv2_web_acl.edge.rule : r.name == "rate-limit-ip" &&
      r.action[0].block[0].custom_response[0].response_code == 429 &&
      r.action[0].block[0].custom_response[0].custom_response_body_key == "rate-limited"
    ])
    error_message = "O rate limit deveria responder 429 com corpo JSON."
  }

  assert {
    condition     = one(aws_wafv2_web_acl.edge.custom_response_body).content_type == "APPLICATION_JSON"
    error_message = "A resposta do rate limit deveria ser JSON."
  }
}
```

Run: `terraform -chdir=infra/modules/edge init -backend=false -input=false >/dev/null && terraform -chdir=infra/modules/edge test`
Expected: FAIL com "Reference to undeclared resource" (`data.aws_cloudfront_cache_policy.disabled`) e "Attempt to get attribute from null value" (a origem `api` ainda não existe).

- [ ] **Step 2: Variáveis**

Ao fim de `infra/modules/edge/variables.tf`:

```hcl

variable "api_origin_domain" {
  description = "Domínio do API Gateway (sem https://), origem do caminho /api/*."
  type        = string
}

variable "api_origin_verify_secret" {
  description = "Segredo enviado à API no cabeçalho x-origin-verify (ADR 0022)."
  type        = string
  sensitive   = true
}
```

- [ ] **Step 3: WAF: 429 em JSON no rate limit**

Em `infra/modules/edge/main.tf`, no `aws_wafv2_web_acl.edge`, logo depois do bloco `default_action { allow {} }`, acrescente:

```hcl

  # JSON, like every API error: the site's pages and the API share the rate limit.
  custom_response_body {
    key          = "rate-limited"
    content_type = "APPLICATION_JSON"
    content = jsonencode({
      error = {
        code    = "rate_limited"
        message = "Muitas requisições em pouco tempo. Espere alguns minutos e tente de novo."
      }
    })
  }
```

e, na regra `rate-limit-ip`, troque `action { block {} }` por:

```hcl
    # 429 instead of the default 403, which CloudFront would turn into the 404 page (ADR 0022).
    action {
      block {
        custom_response {
          response_code            = 429
          custom_response_body_key = "rate-limited"

          response_header {
            name  = "retry-after"
            value = "300"
          }
        }
      }
    }
```

- [ ] **Step 4: Origem e comportamento da API**

Ainda em `infra/modules/edge/main.tf`, depois de `data "aws_cloudfront_cache_policy" "optimized"`, acrescente:

```hcl

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}
```

Na `aws_cloudfront_distribution.site`, depois do bloco `origin` do site, acrescente:

```hcl

  # API Gateway answers only requests carrying the secret header (ADR 0022).
  origin {
    origin_id   = "api"
    domain_name = var.api_origin_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "x-origin-verify"
      value = var.api_origin_verify_secret
    }
  }
```

depois do `default_cache_behavior`, acrescente:

```hcl

  # API: never cached; every viewer header except Host reaches API Gateway. No viewer-request
  # function: it would rewrite paths to index.html.
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }
```

e troque os dois blocos `custom_error_response` (403 e 404) e o comentário acima deles por:

```hcl
  # Without s3:ListBucket a missing object answers 403; show the site's 404 page. Error pages
  # apply to the whole distribution, API included, so the API never answers 403 through
  # CloudFront and its JSON 404s pass untouched (ADR 0022).
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }
```

- [ ] **Step 5: Ver passar**

Run: `terraform fmt -check -recursive infra && terraform -chdir=infra/modules/edge test`
Expected: `Success! 3 passed, 0 failed.`

- [ ] **Step 6: ADR 0022**

`docs/adr/0022-api-na-mesma-distribuicao.md`:

```md
# 0022. API na mesma distribuição do CloudFront

- Status: aceita
- Data: 2026-10-09
- Decisão do spec: D5 (complementa)

## Contexto

A API (API Gateway HTTP + Lambda, ADR 0005) fica atrás da mesma distribuição do site, no caminho `/api/*`: mesma origem para o navegador, mesmo WAF, mesmos cabeçalhos de segurança. Quatro detalhes da borda afetam a API:

- As páginas de erro personalizadas (`custom_error_response`) valem para a distribuição inteira, não por caminho, e CloudFront Functions não rodam nas respostas da origem. Na Fase 0, 403 e 404 viravam `/404.html`; um 404 em JSON da API chegaria ao app como HTML.
- O bucket do site, sem `s3:ListBucket`, responde 403 para arquivo inexistente. O WAF também bloqueia com 403.
- A regra `SizeRestrictions_BODY` do conjunto gerenciado `AWSManagedRulesCommonRuleSet` bloqueia corpos acima de 8 KB.
- O endereço `*.execute-api` do API Gateway é público: sem proteção, daria para chamar a API sem passar pelo WAF.

## Decisão

- `/api/*` vai para o API Gateway sem cache (`Managed-CachingDisabled`), com todos os cabeçalhos do visitante exceto `Host` (`Managed-AllViewerExceptHostHeader`), a mesma política de cabeçalhos de segurança e sem a função de borda (ela reescreve caminhos para `index.html`).
- Só o **403** vira a página 404 do site. A API **nunca responde 403 pelo CloudFront**: usa 400 (pedido inválido, inclusive `Origin` errada), 401 (sem login) ou 404 (não existe), sempre em JSON.
- O rate limit do WAF responde **429** com corpo JSON (`rate_limited`) e `Retry-After: 300`, em vez do 403 padrão.
- Origem fechada: o CloudFront envia o cabeçalho `x-origin-verify` com um segredo gerado pelo Terraform (`random_password`, guardado no estado). A API compara em tempo constante e responde 403 sem ele; esse 403 só aparece em acesso direto, que não passa pelo CloudFront. O deploy confere que o acesso direto dá 403. O segredo chega à Lambda por variável de ambiente, não pelo SSM (spec §5.4): ele já fica visível na configuração da distribuição, e buscá-lo no SSM só somaria uma chamada ao cold start. A troca é por PR (`origin_verify_version`).
- Corpo de requisição até 8 KB, igual ao WAF: acima disso a API responde 413 em JSON, também no ambiente local. Arquivos grandes vão direto ao S3 por URL pré-assinada (Fase 2).
- Respostas da API levam `Cache-Control: no-store`.

## Alternativas consideradas

- Subdomínio próprio (`api.<domínio>`): CORS, mais um certificado e mais uma distribuição (ou domínio customizado no API Gateway), cookies entre subdomínios. Mais peças para o mesmo resultado.
- Dar `s3:ListBucket` ao OAC, para o S3 responder 404, e mapear só o 404: a API perderia os 404 em JSON, mais comuns que 403.
- Desligar o endpoint `execute-api` (`disable_execute_api_endpoint`): exige domínio customizado regional no API Gateway, com certificado e DNS próprios.

## Consequências

- Positivas: uma origem só para o navegador (sem CORS; cookies `SameSite=Lax` simples na Fase 1C); WAF e cabeçalhos de segurança valem para a API; erros da API chegam sempre em JSON.
- Negativas: bloqueios das regras gerenciadas do WAF (403) chegam ao app como a página 404 em HTML, então o cliente da API trata resposta sem JSON como erro genérico. Trocar o segredo de origem causa alguns minutos de erro na API enquanto o CloudFront propaga (runbook de deploy).

## Pilares Well-Architected

Segurança (WAF e cabeçalhos na API, origem fechada, CSRF por `Origin`), confiabilidade (erros previsíveis para o app) e custo (uma distribuição só).

## Revisar quando

A API precisar de respostas em cache na borda ou de corpos acima de 8 KB, ou o CloudFront passar a permitir páginas de erro por comportamento.
```

Em `docs/adr/README.md`, acrescente antes da linha da 0023 a linha `| 0022 | API na mesma distribuição do CloudFront | aceita |` e rode `pnpm exec prettier --write docs/adr`.

- [ ] **Step 7: Commit**

```bash
git add infra/modules/edge docs/adr
git commit -m "feat(infra): API no CloudFront em /api/*, só o 403 vira página 404 (ADR 0022)"
```

---

### Task 10: Raiz `live`, deploy e smoke da API

**Files:**
- Modify: `infra/live/main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, `env/dev.tfvars`, `env/prod.tfvars`, `.terraform.lock.hcl`
- Modify: `.github/workflows/infra.yml`, `.github/workflows/deploy-env.yml`, `.github/workflows/deploy.yml`
- Modify: `tools/smoke.sh`, `infra/infracost-usage.yml`

**Interfaces:**
- Consumes: os módulos das Tasks 6 a 9; `pnpm --filter @egt/api build` (Task 4).
- Produces: `infra/tf live <env> plan|apply` com a API; variáveis `app_version` (padrão `"local"`, o deploy passa o commit) e `data_deletion_protection` (`false` em dev, `true` em prod); saída `api_gateway_endpoint`; `tools/smoke.sh <url> [versão]`.

- [ ] **Step 1: Ligar os módulos**

`infra/live/main.tf`:

```hcl
module "tags" {
  source      = "../modules/tags"
  environment = var.environment
}

data "aws_route53_zone" "site" {
  name = var.domain_name
}

data "aws_route53_zone" "redirect" {
  for_each = toset(var.redirect_domains)
  name     = each.key
}

module "site" {
  source      = "../modules/site"
  name_prefix = module.tags.name_prefix
}

module "data" {
  source              = "../modules/data"
  name_prefix         = module.tags.name_prefix
  deletion_protection = var.data_deletion_protection
}

module "api" {
  source = "../modules/api"

  name_prefix     = module.tags.name_prefix
  environment     = var.environment
  package_dir     = "${path.root}/../../apps/api/dist"
  app_version     = var.app_version
  site_origin     = "https://${var.domain_name}"
  table_name      = module.data.table_name
  table_arn       = module.data.table_arn
  alarm_topic_arn = module.observability.alerts_topic_arn

  # Rotation of the CloudFront → API secret: bump and merge (docs/runbooks/deploy.md).
  origin_verify_version = 1
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
  redirect_zone_ids                = { for domain, zone in data.aws_route53_zone.redirect : domain => zone.zone_id }
  zone_id                          = data.aws_route53_zone.site.zone_id
  site_bucket_id                   = module.site.bucket_id
  site_bucket_arn                  = module.site.bucket_arn
  site_bucket_regional_domain_name = module.site.bucket_regional_domain_name
  api_origin_domain                = module.api.origin_domain
  api_origin_verify_secret         = module.api.origin_verify_secret
}

module "observability" {
  source             = "../modules/observability"
  name_prefix        = module.tags.name_prefix
  monthly_budget_usd = var.monthly_budget_usd
  alert_emails       = var.alert_emails
}
```

Ao fim de `infra/live/variables.tf`:

```hcl

variable "app_version" {
  description = "Versão publicada da API (o commit do deploy, via TF_VAR_app_version)."
  type        = string
  default     = "local"
}

variable "data_deletion_protection" {
  description = "Proteção contra exclusão da tabela DynamoDB (ligada em prod)."
  type        = bool
  default     = true
}
```

Ao fim de `infra/live/outputs.tf`:

```hcl

output "api_gateway_endpoint" {
  description = "URL direta do API Gateway; o deploy confere que ela responde 403."
  value       = module.api.endpoint
}
```

`infra/live/versions.tf`:

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
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }

  # Configured by env/<environment>.backend.hcl (see infra/tf).
  backend "s3" {}
}
```

Em `infra/live/env/dev.tfvars`, acrescente `data_deletion_protection = false`; em `infra/live/env/prod.tfvars`, `data_deletion_protection = true`. Rode `terraform fmt -recursive infra` (alinha os `=`).

- [ ] **Step 2: Lock file e validação**

```bash
export TF_DATA_DIR="$(mktemp -d)" AWS_PROFILE= AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null
terraform -chdir=infra/live init -backend=false -input=false
terraform -chdir=infra/live validate
unset TF_DATA_DIR
git diff --stat infra/live/.terraform.lock.hcl
```

Expected: `Success! The configuration is valid.`; o lock ganha `hashicorp/archive` e `hashicorp/random`, e o `hashicorp/aws` continua na mesma versão (não use `-upgrade`).

```bash
terraform fmt -check -recursive infra
(cd infra && tflint --init --config "$PWD/.tflint.hcl" >/dev/null && tflint --recursive --config "$PWD/.tflint.hcl")
trivy config --quiet --severity HIGH,CRITICAL --exit-code 1 infra
```

Expected: sem achados.

- [ ] **Step 3: Workflows**

`.github/workflows/infra.yml`:

1. No passo "terraform validate (todas as raízes)", a lista do `for` passa a ser `modules/tags modules/site modules/data modules/api modules/observability modules/state-bucket bootstrap/account bootstrap/management live`.
2. No passo "terraform test", `modules/tags modules/edge modules/data modules/api modules/observability bootstrap/management bootstrap/account`.
3. No job `plan`, troque os passos de `actions/checkout` e `actions/setup-node` por:

```yaml
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version-file: .node-version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      # The plan zips apps/api/dist into the Lambda package.
      - run: pnpm --filter @egt/api build
```

4. No passo "terraform plan", acrescente ao `env`: `TF_VAR_app_version: ${{ github.sha }}`.

`.github/workflows/deploy-env.yml`:

1. Depois de `- run: pnpm install --frozen-lockfile`, acrescente:

```yaml
      # Terraform zips apps/api/dist into the Lambda package.
      - run: pnpm --filter @egt/api build
```

2. No passo "terraform apply", acrescente ao `env`: `TF_VAR_app_version: ${{ github.sha }}`.
3. Troque `- run: tools/smoke.sh "$SITE_URL"` por:

```yaml
      - run: tools/smoke.sh "$SITE_URL" "$GITHUB_SHA"
      - name: API recusa acesso direto (sem CloudFront)
        run: |
          endpoint="$(terraform -chdir=infra/live output -raw api_gateway_endpoint)"
          status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --retry 3 --retry-all-errors "$endpoint/api/health")"
          if [ "$status" != "403" ]; then
            echo "Acesso direto à API deveria dar 403, deu $status."
            exit 1
          fi
```

`.github/workflows/deploy.yml`: em `on.push.paths`, acrescente `- 'apps/api/**'` depois de `- 'apps/web/**'` (hoje uma mudança só na API não publicaria nada).

- [ ] **Step 4: Smoke da API**

`tools/smoke.sh`:

```bash
#!/usr/bin/env bash
# Checks a published environment. Usage: tools/smoke.sh <base-url> [expected-api-version]
set -euo pipefail

url="${1:?Uso: tools/smoke.sh <url-base> [versão-esperada-da-api]}"
url="${url%/}"
expected_version="${2:-}"

body=""
ok=0
for attempt in 1 2 3 4 5 6; do
  if body="$(curl -fsSL --max-time 10 "$url/")"; then
    ok=1
    break
  fi
  if [[ "$attempt" -lt 6 ]]; then
    echo "Tentativa $attempt falhou; nova tentativa em 20 s." >&2
    sleep 20
  fi
done
if [[ "$ok" -ne 1 ]]; then
  echo "Não foi possível acessar $url/ após 6 tentativas." >&2
  exit 1
fi

if ! grep -q 'Escola Grátis de Tecnologia' <<<"$body"; then
  echo "A página inicial não contém o nome da escola." >&2
  exit 1
fi

if ! status="$(curl -s -o /dev/null -w '%{http_code}' --retry 3 --retry-all-errors --max-time 10 "$url/nao-existe")"; then
  echo "Falha de rede ao verificar o 404 em $url/nao-existe." >&2
  exit 1
fi
if [[ "$status" != "404" ]]; then
  echo "Esperado 404 em rota inexistente, recebido $status." >&2
  exit 1
fi

# The API shares the distribution: its errors must reach the client as JSON (ADR 0022).
if ! health="$(curl -fsS --retry 3 --retry-all-errors --max-time 10 "$url/api/health")"; then
  echo "A API não respondeu em $url/api/health." >&2
  exit 1
fi
if ! grep -q '"status":"ok"' <<<"$health"; then
  echo "A API não está saudável: $health" >&2
  exit 1
fi
if [[ -n "$expected_version" ]] && ! grep -q "\"version\":\"$expected_version\"" <<<"$health"; then
  echo "A API publicada não é a versão $expected_version: $health" >&2
  exit 1
fi
if ! api_404="$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --retry 3 --retry-all-errors --max-time 10 "$url/api/nao-existe")"; then
  echo "Falha de rede ao verificar o 404 da API." >&2
  exit 1
fi
if [[ "$api_404" != "404 application/json"* ]]; then
  echo "Esperado 404 em JSON da API, recebido '$api_404'." >&2
  exit 1
fi

if [[ "$url" == https://* ]]; then
  if ! headers="$(curl -fsSI --retry 3 --retry-all-errors --max-time 10 "$url/")"; then
    echo "Falha de rede ao ler os cabeçalhos de $url/." >&2
    exit 1
  fi
  grep -qi '^strict-transport-security:' <<<"$headers" || { echo "HSTS ausente." >&2; exit 1; }
  grep -qi '^content-security-policy:' <<<"$headers" || { echo "CSP ausente." >&2; exit 1; }
fi

echo "Smoke OK: $url"
```

Confira contra o ambiente local: com `pnpm db:up` e `pnpm dev` rodando (o site em `:4321` encaminha `/api` para a API), em outro terminal:

Run: `tools/smoke.sh http://localhost:4321 0.0.0-local && tools/smoke.sh http://localhost:4321 outra-versao; echo "saída: $?"`
Expected: o primeiro termina com `Smoke OK: http://localhost:4321`; o segundo falha com "A API publicada não é a versão outra-versao" e `saída: 1`. Pare o `pnpm dev` pelo PID (`ss -ltnp | grep -E '4321|3001'`).

- [ ] **Step 5: Premissas do Infracost**

Ao fim de `resource_type_default_usage` em `infra/infracost-usage.yml`:

```yaml
  # API (Phase 1B): a few hundred learners syncing progress.
  aws_lambda_function:
    monthly_requests: 300000
    request_duration_ms: 100
  aws_apigatewayv2_api:
    monthly_requests: 300000
  aws_dynamodb_table:
    storage_gb: 1
    pitr_backup_storage_gb: 1
    monthly_write_request_units: 200000
    monthly_read_request_units: 600000
  aws_cloudwatch_log_group:
    storage_gb: 1
    monthly_data_ingested_gb: 1
    monthly_data_scanned_gb: 1
```

- [ ] **Step 6: Commit**

```bash
pnpm format && pnpm lint
git add infra/live infra/infracost-usage.yml .github/workflows tools/smoke.sh
git commit -m "feat(infra): liga API e dados em dev e prod, com deploy e smoke da API"
```

---

### Task 11: Documentação da Fase 1B

**Files:**
- Modify: `apps/api/CLAUDE.md`, `CLAUDE.md`, `infra/CLAUDE.md`, `README.md`
- Modify: `docs/arquitetura/well-architected.md`, `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`
- Modify: `docs/runbooks/deploy.md`, `docs/runbooks/remover-projeto.md`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 10.
- Produces: o PR da Fase 1B pronto para o mantenedor.

- [ ] **Step 1: Guias**

`apps/api/CLAUDE.md` (substitui o arquivo inteiro):

```md
# apps/api — API Hono

- **Composição:** `createApp(deps)` em `src/app.ts` recebe `AppDeps` (config, logger, repositórios, `checkDatabase`, `authenticate`, `now`) e monta middlewares e rotas. Cada recurso fica em `src/routes/<recurso>.ts`, exportando uma função que recebe só as dependências que usa e devolve um `Hono`.
- **Entradas finas:** `src/lambda.ts` (AWS: DynamoDB, sem login até a Fase 1C) e `src/server.ts` (local: DynamoDB Local ou memória, via `src/local.ts`; login falso pelo cabeçalho `x-dev-user`) só montam as dependências.
- **Configuração:** só `src/config.ts` lê `process.env` (`loadConfig`). Fora do local, `APP_VERSION`, `TABLE_NAME`, `SITE_ORIGIN` e `ORIGIN_VERIFY_SECRET` são obrigatórias. O resto recebe `AppConfig` por parâmetro.
- **Erros:** sempre `{ error: { code, message } }` (`apiError` em `src/errors.ts`), com `code` em snake_case inglês e `message` em pt-BR no tom da Escola. 400 `invalid_request` (zod) e `invalid_origin`, 401 `unauthenticated`, 404 `not_found`, 413 `payload_too_large`, 500 `internal_error`; o health responde 503 quando o banco não responde.
- **Nunca 403 pelo CloudFront:** a borda troca qualquer 403 pela página 404 do site (ADR 0022). Só o acesso direto sem `x-origin-verify` recebe 403. Para recusar algo, use 400, 401 ou 404.
- **Segurança:** mudanças (tudo que não é GET, HEAD ou OPTIONS) exigem `Origin` igual ao site (CSRF); corpo até 8 KB, o limite do WAF; respostas com `Cache-Control: no-store`.
- **Login:** rotas pessoais usam `requireIdentity(authenticate)` e leem `c.var.identity.sub`. `createDevAuthenticator` só existe localmente.
- **Dados:** pelos repositórios de `@egt/db` (ElectroDB), nunca o SDK do DynamoDB direto nas rotas. Precisa de outra ação no DynamoDB? Atualize a política da Lambda em `infra/modules/api/main.tf` no mesmo PR.
- **Testes:** Vitest com `app.request()` e `testApp()` de `test/helpers.ts` (memória; `x-test-user` faz o papel do login), um arquivo por rota em `test/`, nada de rede real. `test/bundle.test.ts` carrega o bundle de verdade num Node separado. Os testes com DynamoDB Local rodam com `DYNAMODB_ENDPOINT` (sempre na CI).
- **Logs:** Powertools Logger (`src/logger.ts`), JSON em inglês. Nunca registre corpo de requisição, e-mail ou IP.
- **Bundle:** `node scripts/build.ts` (esbuild) gera `dist/lambda.mjs` (Node 24, ESM, minificado, com source map) **incluindo o AWS SDK**, na versão do lockfile. O banner com `createRequire` existe porque o ElectroDB é CommonJS. O Terraform empacota `dist/`. Mantenha as dependências enxutas, porque o tamanho do bundle afeta o cold start (hoje ~1,3 MB, ~320 KB em gzip; a ADR 0005 manda revisar acima de 5 MB).
```

`CLAUDE.md` (raiz):

1. Na tabela **Mapa do repositório**, depois da linha de `packages/core`, acrescente:

```md
| `packages/db` | Tabela única, ElectroDB e repositórios (DynamoDB e memória) | `apps/api/CLAUDE.md` |
```

2. Em **Comandos**, antes do item do `pnpm content:check`, acrescente:

```md
- `pnpm db:up` — sobe o DynamoDB Local no Docker; a API cria a tabela ao iniciar. Sem Docker, o `pnpm dev` guarda o progresso na memória. Testes de integração: `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test` (na CI, sempre).
```

3. Em **Antes de dizer que terminou**, a primeira frase passa a ser: "`pnpm lint && pnpm typecheck && pnpm test` verdes. Mexeu no site: `pnpm test:e2e`. Mexeu na API ou em `packages/db`: `pnpm db:up` e `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test`."

`infra/CLAUDE.md`:

1. Em **Layout**, o item de `modules/*` passa a listar `(tags, site, edge, data, api, observability, state-bucket…)`.
2. Antes de `## Regiões`, acrescente:

```md
## Lambdas

- O Terraform empacota o build (`archive_file` de `apps/<app>/dist`): rode `pnpm --filter @egt/api build` antes de `infra/tf live <env> plan` (a CI e o deploy já fazem). O hash do zip só muda quando o código muda.
- Log group criado pelo Terraform (30 dias) e `logging_config` apontando para ele; nada criado implicitamente.
- Política IAM só com as ações que o código usa hoje; rota nova que precisa de outra ação atualiza a política no mesmo PR.
```

`README.md`:

1. A linha de status passa a ser:

```md
> **Status:** Fase 1 (plataforma) em andamento: aprender sem conta (1A) e API com banco de dados (1B) prontos; próximas: contas (1C) e mídia (1D). Site: https://escolagratisdetecnologia.com.br
```

2. Em **Rodar localmente**, troque o passo 3 por:

```md
3. Opcional, com Docker: `pnpm db:up` sobe o DynamoDB Local. Sem ele, a API guarda o progresso na memória.
4. `pnpm dev` → site em http://localhost:4321 e API em http://localhost:3001/api/health
```

3. Na tabela **Estrutura**, troque a linha de `apps/api` por:

```md
| `apps/api` | API (Hono em Lambda, atrás do CloudFront em `/api`) |
| `packages/` | Bibliotecas compartilhadas: conteúdo, regras e banco de dados |
```

- [ ] **Step 2: Well-Architected e spec**

`docs/arquitetura/well-architected.md` (troque as linhas indicadas; o Prettier realinha as tabelas):

- Excelência operacional: a linha "Logs estruturados (Powertools) e alarmes de erro | planejado (Fase 1)" vira duas:

```md
| Logs estruturados (Powertools) e alarmes de erro da API por e-mail (ADR 0023) | feito (Fase 1B) |
| Ambiente local com DynamoDB Local (`pnpm db:up`) e testes de integração com ele na CI | feito (Fase 1B) |
```

- Segurança, ao fim da tabela:

```md
| API só pelo CloudFront: cabeçalho secreto de origem, WAF e cabeçalhos de segurança também na API (ADR 0022) | feito (Fase 1B) |
| Mudanças na API só com `Origin` do site (CSRF); corpo até 8 KB; respostas `no-store` | feito (Fase 1B) |
| IAM de menor privilégio na Lambda da API; logs de acesso sem IP | feito (Fase 1B) |
```

- Confiabilidade: a linha "DynamoDB com PITR; SQS com DLQ; workers idempotentes | planejado (Fases 1–2)" vira:

```md
| DynamoDB com PITR (35 dias) e proteção contra exclusão em prod | feito (Fase 1B) |
| Mescla de progresso sem ler-e-regravar: conjuntos com `ADD` e `SET` condicional | feito (Fase 1B) |
| `/api/health` confere o banco; o smoke confere a versão publicada e os erros da API em JSON | feito (Fase 1B) |
| SQS com DLQ; workers idempotentes | planejado (Fase 2) |
```

- Eficiência de performance: "Vídeo HLS adaptativo; Lambda arm64 | planejado (Fase 1)" vira:

```md
| Lambda arm64 com bundle único minificado | feito (Fase 1B) |
| Vídeo HLS adaptativo | planejado (Fase 1D) |
```

- Otimização de custos, ao fim da tabela: `| API, banco e alarmes pagos por uso; chaves da AWS em vez de CMK (ADR 0023) | feito (Fase 1B) |`
- Sustentabilidade: "Graviton (arm64) nas Lambdas; originais de vídeo em camada fria | planejado (Fase 1)" vira:

```md
| Graviton (arm64) na Lambda da API | feito (Fase 1B) |
| Originais de vídeo em camada fria | planejado (Fase 1D) |
```

`docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`:

- Título do §3.5 (segue a regra de nomes do §11.3):

```md
### 3.5 Modelo de dados (DynamoDB, tabela única `egt-{env}-data-main`)
```

- §5.4, depois do item dos cabeçalhos do CloudFront:

```md
- API na mesma distribuição (ADR 0022): só o 403 do S3 vira a página 404, e a API nunca responde 403 pela borda; o rate limit responde 429 em JSON; a origem só aceita o cabeçalho secreto do CloudFront; corpo até 8 KB.
```

- §13, troque os dois primeiros itens da lista do `pnpm dev` por:

```md
- `docker compose` (`pnpm db:up`): DynamoDB Local; `mock-oauth2-server` (emissor OIDC falso) e Mailpit (e-mails) entram com as contas (Fase 1C). Sem Docker, a API guarda o progresso na memória.
- Criação da tabela ao iniciar a API; seed de usuários de teste com as contas (Fase 1C).
```

- [ ] **Step 3: Runbooks**

`docs/runbooks/deploy.md`:

1. Em **Como funciona**, item 1: na lista do que dispara o deploy, acrescente `apps/api/` depois de `apps/web/`.
2. Item 2: troque o começo "Job `dev` (environment `dev`, sem aprovação): `terraform apply` da raiz `live`, build e publicação do site" por "Job `dev` (environment `dev`, sem aprovação): build da API (`apps/api/dist`, que o Terraform empacota na Lambda), `terraform apply` da raiz `live`, build e publicação do site", e o fim "e smoke tests (`tools/smoke.sh`)." por "e smoke tests (`tools/smoke.sh`, que também confere a API). Por fim, confere que o endereço direto do API Gateway recusa o acesso (403)."
3. Em **Onde ver logs**, troque o último item por:

```md
- Na AWS (conta do ambiente): métricas do CloudFront e do WAF (`egt-<env>-edge-waf`) no console.
- Logs da API (CloudWatch → Log groups): `/aws/lambda/egt-<env>-api-handler` (JSON do Powertools) e `/aws/apigateway/egt-<env>-api-http` (acessos, sem IP). Ficam 30 dias.

## Alarmes da API

Os alarmes `egt-<env>-api-5xx`, `egt-<env>-api-lambda-errors` e `egt-<env>-api-lambda-throttles` disparam com uma ocorrência em 5 minutos e avisam por e-mail os endereços do Secret `ALERT_EMAILS` (tópico SNS `egt-<env>-observability-alerts`, ADR 0023).

Depois do primeiro deploy da Fase 1B, e sempre que o Secret mudar, cada endereço recebe da AWS um e-mail "AWS Notification - Subscription Confirmation" por conta (dev e prod). Clique em **Confirm subscription**: sem isso, nenhum alarme chega. Para conferir, no console da conta: SNS → Topics → `egt-<env>-observability-alerts` → Subscriptions (status **Confirmed**).

Chegou um alarme? Abra os logs da Lambda no horário do alarme (CloudWatch → Logs Insights, log group `/aws/lambda/egt-<env>-api-handler`, filtro `level = "ERROR"`), corrija por PR e, se for urgente, faça o rollback.

## Trocar o segredo de origem da API

O CloudFront envia à API o cabeçalho `x-origin-verify` com um segredo gerado pelo Terraform (ADR 0022). Para trocá-lo (por exemplo, se aparecer num log ou print), abra um PR que aumenta `origin_verify_version` no `module "api"` de `infra/live/main.tf`. O deploy gera um segredo novo e atualiza a Lambda e o CloudFront. Até o CloudFront propagar, por alguns minutos, a API pode responder com a página 404: prefira um horário de pouco uso.
```

4. Em **Se o smoke falhar**, troque o primeiro parágrafo por:

```md
O `tools/smoke.sh` confere: a página inicial responde com o nome da Escola (até 6 tentativas, 20 s entre elas), `/nao-existe` devolve 404, `/api/health` responde `status: ok` com a versão do commit publicado, `/api/nao-existe` devolve 404 em JSON e os cabeçalhos HSTS e CSP estão presentes. A mensagem no log diz qual conferência falhou.

- `/api/health` com `"database":"unavailable"` (503): a Lambda não conseguiu ler a tabela. Veja os logs da API.
- `/api/nao-existe` em HTML: a borda voltou a trocar erros da API pela página 404 (ADR 0022). Confira o `custom_error_response` do módulo `edge`.
```

`docs/runbooks/remover-projeto.md`, no passo **2. Aplicação (prod, depois dev)**: antes do bloco de comandos, acrescente o parágrafo "A tabela DynamoDB de prod tem proteção contra exclusão: desligue-a antes do `destroy` de prod. A AWS guarda um backup de sistema da tabela apagada por 35 dias, sem custo, e o apaga sozinha." e, no bloco, entre `export AWS_PROFILE=egt-prod` e `infra/tf live prod destroy`, a linha:

```bash
aws dynamodb update-table --table-name egt-prod-data-main --no-deletion-protection-enabled
```

- [ ] **Step 4: Verificação completa**

```bash
pnpm format
pnpm lint && pnpm typecheck && pnpm content:check
pnpm db:up && DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test
pnpm build
terraform fmt -check -recursive infra
for root in modules/data modules/api modules/observability modules/edge; do
  terraform -chdir=infra/$root init -backend=false -input=false >/dev/null && terraform -chdir=infra/$root test
done
(cd infra && tflint --recursive --config "$PWD/.tflint.hcl")
trivy config --quiet --severity HIGH,CRITICAL --exit-code 1 infra
```

Expected: tudo verde. O site não muda nesta fase, mas o `pnpm build` agora também gera `apps/api/dist`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/CLAUDE.md CLAUDE.md infra/CLAUDE.md README.md docs
git commit -m "docs: registra a Fase 1B nos guias, nos runbooks e no Well-Architected"
```

---

### Task 12: [mantenedor] PR, deploy e conferência

- [ ] **Step 1: PR**

Abrir o PR da branch no GitHub com o template preenchido:
- **Delta de custo:** perto de US$ 1 por mês por conta com pouco uso: 3 alarmes (US$ 0,10 cada), Lambda, API Gateway e DynamoDB pagos por uso (Lambda e DynamoDB dentro do free tier nesse volume), logs com 30 dias de retenção. O comentário do Infracost traz o número com as premissas de `infra/infracost-usage.yml`.
- **Pilares:** segurança, confiabilidade, excelência operacional e custo.
- **ADRs:** 0022 e 0023.

Conferir na CI: `ci` verde (com os testes do DynamoDB Local rodando, não pulados), `infra` verde com o plano de dev e prod no resumo e o `check-tags` passando, e o comentário do Infracost.

- [ ] **Step 2: Deploy em dev**

Depois do merge, o `deploy` roda o dev. Conferir:
1. O passo "API recusa acesso direto (sem CloudFront)" passou.
2. `https://dev.escolagratisdetecnologia.com/api/health` mostra `"status":"ok"` e a `version` igual ao commit do merge.
3. `https://dev.escolagratisdetecnologia.com/api/progress` responde 401 em JSON (sem login até o 1C).
4. Chegou o e-mail "AWS Notification - Subscription Confirmation" da conta dev: clique em **Confirm subscription** (`docs/runbooks/deploy.md`, Alarmes da API).

- [ ] **Step 3: Prod**

Aprovar o prod no Actions e repetir as conferências 1 a 4 em `https://escolagratisdetecnologia.com.br` (com o e-mail de confirmação da conta prod).

- [ ] **Step 4: Depois**

- Na próxima auditoria semanal de tags, se aparecer recurso da Fase 1B sem a tag `Project` que a AWS não deixa marcar, siga a regra de `tools/CLAUDE.md` para o `ignore.json`.
- Atualizar a memória do projeto: Fase 1B concluída; próximo plano, 1C (Contas).
