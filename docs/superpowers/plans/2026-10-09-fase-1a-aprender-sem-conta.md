# Fase 1A — Aprender sem conta: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar em dev o curso piloto "Crie seu site com IA" para ser feito sem conta: identidade visual nova, catálogo, página do curso, aulas com quiz, progresso salvo no aparelho, área "Eu" e app instalável, com o conteúdo validado na CI.

**Architecture:** O conteúdo mora em `content/` (Markdown + YAML) e é lido no build pelo pacote `@egt/content`, que valida tudo com zod e também roda na CI (`pnpm content:check`). As regras puras de progresso ficam em `@egt/core`. O site Astro gera páginas estáticas; a interatividade vem de ilhas Preact renderizadas no build e hidratadas por um script externo nosso, porque a CSP do CloudFront (`script-src 'self'`) bloqueia os scripts inline que as ilhas do Astro geram (ADR 0021). O progresso fica só no `localStorage`. O service worker é gerado pelo `workbox-build` no fim do build. Nada muda na AWS.

**Tech Stack:** Astro 7, Preact 10 (`@astrojs/preact` 6), zod 4, yaml 2, marked 18, workbox-build 7, Vitest 5 (+ happy-dom), Playwright + axe, Lighthouse CI.

**Spec:** `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md` (§4, §12, §13, §14 e §17). Divisão da Fase 1 decidida com o mantenedor em 2026-10-09: 1A Aprender sem conta → 1B API e dados → 1C Contas → 1D Mídia.

## Global Constraints

- Node `24.21.0`; pnpm `10.34.6`; TypeScript `~6.0.3`; Astro `^7.3.5`; `@astrojs/preact` `^6.0.6` com `preact` `^10.29.8` (o peer do `@astrojs/preact` é Preact 10); `zod` `^4.6.5`; `yaml` `^2.9.1`; `marked` `^18.1.0`; `workbox-build` `^7.4.1`; `happy-dom` `^20.14.6`.
- Nenhuma mudança em `infra/` e nenhum recurso novo na AWS.
- CSP do CloudFront (não muda): `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`. Portanto, no HTML gerado: **nenhum** `<script>` sem `src`, `<style>`, atributo `style=` ou handler `on*=`. Use `vite.build.assetsInlineLimit: 0` e nunca a diretiva `client:*` do Astro.
- Orçamentos (spec §4.6, bloqueiam a CI): JS por página de conteúdo ≤ 30 KB **gzip**; Lighthouse ≥ 95 em performance, acessibilidade, boas práticas e SEO; LCP ≤ 2,0 s; CLS ≤ 0,05.
- Acessibilidade WCAG 2.2 AA: `lang="pt-BR"`, um `h1` por página, alvos de toque ≥ 48 px, contraste, foco visível, `prefers-reduced-motion`, zero violações axe (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) nos temas claro e escuro.
- Paleta (tokens em `apps/web/src/styles/global.css`; valores exatos):

  | Token | Claro | Escuro |
  |---|---|---|
  | `--color-bg` | `#ffffff` | `#0d1226` |
  | `--color-surface` | `#eef2fb` | `#182041` |
  | `--color-line` | `#d6ddef` | `#2a3460` |
  | `--color-fg` | `#1a2129` | `#eef1fb` |
  | `--color-muted` | `#4b5576` | `#aab3d6` |
  | `--color-accent` | `#0052cc` | `#80b2ff` |
  | `--color-accent-fg` | `#ffffff` | `#0d1226` |
  | `--color-highlight` | `#ffe14d` | `#ffd84a` |
  | `--color-highlight-fg` | `#1a2129` | `#0d1226` |
  | `--color-success` | `#17663a` | `#7fdca3` |
  | `--color-danger` | `#b42318` | `#ff9b8f` |

- **Regra do marca-texto:** o amarelo (`<mark>`) cobre a altura inteira da palavra e o texto sobre ele usa sempre `--color-highlight-fg` (escuro), nos dois temas. O amarelo nunca é usado como cor de texto, barra ou ícone.
- Fonte: títulos e wordmark em Bricolage Grotesque 800 (`/fonts/bricolage-grotesque-800.woff2`, 17,6 KB, OFL, `font-display: optional`, com preload); texto corrido na fonte do sistema.
- Marca: monograma EGT (`/brand/egt-mark.svg`; no tema escuro `/brand/egt-mark-dark.svg`). Os arquivos da marca, ícones e fonte **já estão no repositório** (entraram com este plano em `apps/web/public/brand/`, `apps/web/public/icons/` e `apps/web/public/fonts/`).
- Rascunhos: cursos com `status: draft` só aparecem quando `SITE_DRAFTS=true` (local, dev e build da CI). O deploy de prod usa `SITE_DRAFTS=false`.
- Progresso só no `localStorage`, chave `egt:progress:v1`. Nada vai para a rede no 1A.
- Idioma: docs, commits e PRs em pt-BR; identificadores, comentários técnicos e mensagens de exceção em inglês; todo texto exibido a pessoas (UI e saída de CLIs) em pt-BR, no tom da Escola ("você", frases curtas, verbos de ação, sem "clique aqui").
- TDD em toda lógica (teste que falha → implementação mínima → passa → commit). Commits em Conventional Commits pt-BR.
- Antes de `pnpm lint`, rode `pnpm format`: o Prettier ajusta a formatação dos arquivos novos (`.astro`, `.tsx`, `.md`, `.yaml`) e o lint só confere.
- Em shells não interativos: `export PATH="$HOME/.local/share/mise/shims:$PATH"`. Os comandos abaixo assumem a raiz do repositório como diretório atual.
- O e2e e o Lighthouse rodam sobre o build: antes de `test:e2e`, rode `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build`.

## Mapa de arquivos

| Caminho | Responsabilidade |
|---|---|
| `packages/content/` | `@egt/content`: schemas zod, leitura de `content/`, regras entre arquivos, CLI `content:check` |
| `packages/core/` | `@egt/core`: progresso local (puro) e status do curso |
| `content/` | `cast.yaml`, `courses/crie-seu-site-com-ia/`, `CLAUDE.md` para quem escreve cursos |
| `apps/web/src/lib/` | `catalog.ts` (cursos do build), `visibility.ts`, `urls.ts`, `course-text.ts`, `markdown.ts`, `progress-store.ts`, `platform.ts`, `csp-scan.ts` |
| `apps/web/src/islands/` | Ilhas Preact (`CourseProgress`, `Quiz`, `ContinueCard`, `MyProgress`), `runtime.ts` e `registry.ts` |
| `apps/web/src/scripts/` | Scripts externos: `islands.ts`, `lesson-complete.ts`, `platform-variants.ts`, `continue.ts`, `install-prompt.ts`, `register-sw.ts` |
| `apps/web/src/components/` | `Header`, `BottomNav`, `Island`, `CourseCard`, `CourseChips`, `NeedsCard`, `InstallPrompt` |
| `apps/web/src/layouts/` | `Base.astro` (head) e `App.astro` (cabeçalho, conteúdo, rodapé, abas) |
| `apps/web/src/pages/` | Início, `cursos/`, `cursos/[curso]/`, `cursos/[curso]/[aula]`, `cursos/[curso]/projeto`, `eu`, `continuar`, `offline`, `manifest.json`, 404, robots |
| `apps/web/integrations/service-worker.ts` | Integração Astro que gera `sw.js` com o `workbox-build` |
| `apps/web/scripts/check-csp.ts` | Falha se o HTML gerado tiver código inline |
| `apps/web/e2e/` | Playwright (Pixel 7 e iPhone 14) + `support/` |
| `docs/adr/0021-javascript-sob-csp-estrita.md` | Decisão das ilhas e do service worker sob CSP estrita |
| `docs/marca/identidade-visual.md` | Uso da marca, paleta, fonte e como os ícones foram gerados |

## URLs do site

| Página | URL |
|---|---|
| Início | `/` |
| Cursos | `/cursos/` |
| Curso | `/cursos/{curso}/` |
| Aula | `/cursos/{curso}/{aula}/` (slug da aula sem o número; único no curso) |
| Projeto final | `/cursos/{curso}/projeto/` |
| Eu | `/eu/` |
| Atalho "Continuar curso" | `/continuar/` |
| Sem internet | `/offline/` |

## Fora deste plano

- **Player de vídeo HLS:** vai para o 1D, junto com o pipeline de mídia e o vídeo provisório do piloto, para ser testado de ponta a ponta com mídia real. No 1A, a aula mostra o espaço do vídeo com o aviso "em produção" e a transcrição aberta.
- **Contas, área "Eu" com dados pessoais, baixar e excluir dados, UTM de primeiro toque:** 1C.
- **Botão VLibras (spec §4.6):** carrega script de `vlibras.gov.br`, que a CSP (`script-src 'self'`) bloqueia. Precisa de uma decisão própria (ADR) sobre a exceção na CSP ou sobre servir o widget pelo próprio site; fica para depois do 1A.

---

### Task 1: Pacote `@egt/content` (schemas, leitura e `content:check`)

**Files:**
- Modify: `pnpm-workspace.yaml`, `package.json` (raiz), `vitest.config.ts` (raiz)
- Create: `packages/content/package.json`, `packages/content/tsconfig.json`, `packages/content/vitest.config.ts`
- Create: `packages/content/src/messages.ts`, `src/schema.ts`, `src/frontmatter.ts`, `src/load.ts`, `src/rules.ts`, `src/cli.ts`, `src/index.ts`
- Create: `packages/content/test/fixtures/valid/**`, `test/helpers.ts`, `test/frontmatter.test.ts`, `test/schema.test.ts`, `test/load.test.ts`, `test/cli.test.ts`

**Interfaces:**
- Produces (usados nas Tasks 3, 5, 7 e no e2e):
  - `loadCatalog(contentDir: string): Promise<LoadResult>` — nunca lança por conteúdo inválido; junta os problemas. Lança só se `contentDir/courses` não existir.
  - `interface Problem { file: string /* caminho absoluto */; message: string /* pt-BR */ }`
  - `interface Lesson { slug: string; number: number; moduleId: string; file: string; frontmatter: LessonFrontmatter; body: string }`
  - `interface Module { id: string; number: number; title: string; lessons: Lesson[]; captions: string[] }`
  - `interface Project { file: string; frontmatter: ProjectFrontmatter; body: string }`
  - `interface Course { slug: string; dir: string; meta: CourseMeta; modules: Module[]; project: Project }`
  - `interface Catalog { courses: Course[]; cast: Cast }`, `interface LoadResult { catalog: Catalog; problems: Problem[] }`
  - Tipos `CourseMeta`, `LessonFrontmatter`, `QuizQuestion`, `ProjectFrontmatter`, `Cast`, `Platform`, `Device`, `Level`, `Requirement`, `Deliverable`.
  - Constantes `PLATFORMS`, `PLATFORM_LABELS`, `LEVEL_LABELS`, `REQUIREMENT_LABELS`, `DELIVERABLE_LABELS`.
  - Script raiz `pnpm content:check` (saída 0 = ok, 1 = problemas, 2 = uso ou leitura).

- [ ] **Step 1: Criar o pacote e registrar no workspace**

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
  - tools/*
onlyBuiltDependencies:
  - esbuild
  - sharp
```

`packages/content/package.json`:

```json
{
  "name": "@egt/content",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`packages/content/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/content/vitest.config.ts`:

```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'content' },
});
```

Na raiz, `vitest.config.ts` passa a listar o pacote:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      'apps/api',
      'packages/content',
      'tools/check-tags',
      'tools/tag-audit',
      { test: { name: 'infra', include: ['infra/**/*.test.ts'] } },
    ],
  },
});
```

E o `package.json` da raiz ganha o script (mantenha os outros):

```json
"content:check": "node packages/content/src/cli.ts content",
```

Instale as dependências:

```bash
pnpm --filter @egt/content add zod@^4.6.5 yaml@^2.9.1
pnpm --filter @egt/content add -D @types/node@^24.19.1 typescript@~6.0.3
```

- [ ] **Step 2: Criar o conteúdo de teste (fixture válida)**

`packages/content/test/fixtures/valid/cast.yaml`:

```yaml
hosts:
  - id: ana
    name: Ana
```

`packages/content/test/fixtures/valid/courses/curso-teste/course.yaml`:

```yaml
title: Curso de teste
outcome: 'Você sai com: um teste que passa'
level: iniciante
durationMin: 30
devices: [celular, computador]
cost: 0
requirements: [github]
skills: [Escrever testes]
hosts: [ana]
status: draft
modules:
  - id: 00-preparacao
    title: Prepare seu ambiente
  - id: 01-mao-na-massa
    title: Mão na massa
```

`packages/content/test/fixtures/valid/courses/curso-teste/00-preparacao/01-boas-vindas.md`:

```md
---
title: Boas-vindas
summary: O que você vai fazer neste curso de teste.
quiz:
  - question: Quanto custa o curso?
    options: [Nada, R$ 10]
    answer: 0
    explanation: O curso é grátis.
---

Olá! Este é o roteiro da aula.
```

`packages/content/test/fixtures/valid/courses/curso-teste/00-preparacao/02-no-seu-aparelho.md`:

```md
---
title: No seu aparelho
summary: Como deixar tudo pronto no seu aparelho.
variants:
  android:
    steps: |
      1. Abra o Chrome.
  ios:
    steps: |
      1. Abra o Safari.
checkpoint:
  - Abri o navegador
quiz:
  - question: Qual navegador o iPhone usa por padrão?
    options: [Safari, Chrome]
    answer: 0
    explanation: O Safari já vem instalado no iPhone.
---

Escolha o seu aparelho e siga os passos.
```

`packages/content/test/fixtures/valid/courses/curso-teste/01-mao-na-massa/01-primeiro-passo.md`:

```md
---
title: Primeiro passo
summary: O primeiro passo prático do curso de teste.
video:
  id: amostra-teste
  durationSec: 150
captions: 01-primeiro-passo.vtt
quiz:
  - question: O que vem primeiro?
    options: [O teste, A implementação]
    answer: 0
    explanation: Primeiro o teste que falha.
---

Escreva o teste antes do código.
```

`packages/content/test/fixtures/valid/courses/curso-teste/01-mao-na-massa/01-primeiro-passo.vtt`:

```text
WEBVTT

00:00.000 --> 00:02.000
Escreva o teste antes do código.
```

`packages/content/test/fixtures/valid/courses/curso-teste/projeto.md`:

```md
---
title: Seu primeiro teste
deliverables: [url, text]
criteria:
  - id: no-ar
    description: O link abre e mostra o resultado.
    weight: 60
    required: true
  - id: explicacao
    description: O texto explica o que foi feito.
    weight: 40
    required: false
passScore: 70
---

Um cliente precisa de um teste. Faça e mande o link.
```

Rode `pnpm exec prettier --write packages/content/test/fixtures` (o lint checa o formato de `.md` e `.yaml`).

`packages/content/test/helpers.ts`:

```ts
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Problem } from '../src/index.ts';

export const VALID = fileURLToPath(new URL('./fixtures/valid/', import.meta.url));
export const COURSE = 'courses/curso-teste';

/** Copies the valid fixture to a temp dir so a test can break one thing in it. */
export async function copyFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'egt-content-'));
  await cp(VALID, dir, { recursive: true });
  return dir;
}

export async function edit(dir: string, file: string, change: (source: string) => string) {
  const target = path.join(dir, file);
  await writeFile(target, change(await readFile(target, 'utf8')));
}

export async function remove(dir: string, file: string) {
  await rm(path.join(dir, file), { recursive: true });
}

/** Problems as "relative/path: message", easier to read in assertions. */
export function describeProblems(dir: string, problems: Problem[]): string[] {
  return problems.map((problem) => `${path.relative(dir, problem.file)}: ${problem.message}`);
}
```

- [ ] **Step 3: Escrever os testes que falham**

`packages/content/test/frontmatter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../src/frontmatter.ts';

describe('parseFrontmatter', () => {
  it('splits YAML data from the Markdown body', () => {
    expect(parseFrontmatter('---\ntitle: Oi\n---\n\nCorpo da aula.\n')).toEqual({
      ok: true,
      data: { title: 'Oi' },
      body: 'Corpo da aula.',
    });
  });

  it('reports a file without frontmatter', () => {
    expect(parseFrontmatter('Só texto')).toEqual({ ok: false, reason: 'missing' });
  });

  it('reports invalid YAML with the parser detail', () => {
    const result = parseFrontmatter('---\ntitle: [aberto\n---\nCorpo');
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'yaml' });
  });
});
```

`packages/content/test/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ptBrErrors } from '../src/messages.ts';
import { courseMetaSchema, lessonFrontmatterSchema } from '../src/schema.ts';

const messages = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];

const lesson = {
  title: 'Boas-vindas',
  summary: 'O que você vai fazer neste curso.',
  quiz: [{ question: 'Quanto custa?', options: ['Nada', 'R$ 10'], answer: 0, explanation: 'É grátis.' }],
};

describe('lessonFrontmatterSchema', () => {
  it('accepts a minimal lesson', () => {
    expect(lessonFrontmatterSchema.safeParse(lesson).success).toBe(true);
  });

  it('rejects an answer that points to a missing option', () => {
    const result = lessonFrontmatterSchema.safeParse(
      { ...lesson, quiz: [{ ...lesson.quiz[0], answer: 2 }] },
      { error: ptBrErrors },
    );
    expect(messages(result)).toEqual([
      'quiz.0.answer: answer aponta para uma opção que não existe (conte a partir de 0)',
    ]);
  });

  it('keeps lessons between 2 and 5 minutes', () => {
    const result = lessonFrontmatterSchema.safeParse(
      { ...lesson, video: { id: 'aula-curta', durationSec: 60 } },
      { error: ptBrErrors },
    );
    expect(messages(result)).toEqual([
      'video.durationSec: aulas têm de 2 a 5 minutos (120 a 300 segundos)',
    ]);
  });

  it('explains unknown fields and missing ones in pt-BR', () => {
    const { summary: _summary, ...withoutSummary } = lesson;
    const result = lessonFrontmatterSchema.safeParse(
      { ...withoutSummary, titulo: 'x' },
      { error: ptBrErrors },
    );
    expect(messages(result)).toEqual(
      expect.arrayContaining(['summary: campo obrigatório', ': campo desconhecido: titulo']),
    );
  });
});

describe('courseMetaSchema', () => {
  const meta = {
    title: 'Curso',
    outcome: 'Você sai com: um site no ar',
    level: 'iniciante',
    durationMin: 45,
    devices: ['celular'],
    cost: 0,
    skills: ['Publicar sites'],
    status: 'draft',
    modules: [
      { id: '00-preparacao', title: 'Prepare seu ambiente' },
      { id: '01-mao-na-massa', title: 'Mão na massa' },
    ],
  };

  it('fills optional lists with empty defaults', () => {
    const result = courseMetaSchema.parse(meta);
    expect(result).toMatchObject({ paidTools: [], requirements: [], hosts: [] });
  });

  it('requires the outcome to start with "Você sai com: "', () => {
    const result = courseMetaSchema.safeParse(
      { ...meta, outcome: 'Um site no ar' },
      { error: ptBrErrors },
    );
    expect(messages(result)).toEqual([
      'outcome: comece com "Você sai com: " e diga o resultado concreto do curso',
    ]);
  });

  it('only accepts courses that cost nothing', () => {
    const result = courseMetaSchema.safeParse({ ...meta, cost: 10 }, { error: ptBrErrors });
    expect(messages(result)).toEqual([
      'cost: o curso precisa custar R$ 0; ferramenta paga vai em paidTools, com alternativa grátis',
    ]);
  });

  it('lists the allowed values of an enum', () => {
    const result = courseMetaSchema.safeParse({ ...meta, level: 'avancado' }, { error: ptBrErrors });
    expect(messages(result)).toEqual(['level: valor inválido: use "iniciante" ou "intermediario"']);
  });
});
```

`packages/content/test/load.test.ts`:

```ts
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../src/index.ts';
import { COURSE, VALID, copyFixture, describeProblems, edit, remove } from './helpers.ts';

async function problemsAfter(change: (dir: string) => Promise<void>): Promise<string[]> {
  const dir = await copyFixture();
  await change(dir);
  const { problems } = await loadCatalog(dir);
  return describeProblems(dir, problems);
}

describe('loadCatalog', () => {
  it('reads a valid course with its modules, lessons and project', async () => {
    const { catalog, problems } = await loadCatalog(VALID);

    expect(problems).toEqual([]);
    const course = catalog.courses[0];
    expect(course?.slug).toBe('curso-teste');
    expect(course?.modules.map((module) => [module.id, module.title])).toEqual([
      ['00-preparacao', 'Prepare seu ambiente'],
      ['01-mao-na-massa', 'Mão na massa'],
    ]);
    expect(course?.modules.flatMap((module) => module.lessons.map((lesson) => lesson.slug))).toEqual([
      'boas-vindas',
      'no-seu-aparelho',
      'primeiro-passo',
    ]);
    expect(course?.modules[1]?.captions).toEqual(['01-primeiro-passo.vtt']);
    expect(course?.modules[0]?.lessons[0]?.body).toBe('Olá! Este é o roteiro da aula.');
    expect(course?.project.frontmatter.passScore).toBe(70);
    expect(catalog.cast.hosts.map((host) => host.id)).toEqual(['ana']);
  });

  it('points schema problems to the file and field', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/00-preparacao/01-boas-vindas.md`, (s) => s.replace('answer: 0', 'answer: 5')),
    );
    expect(problems).toEqual([
      `${COURSE}/00-preparacao/01-boas-vindas.md: quiz.0.answer: answer aponta para uma opção que não existe (conte a partir de 0)`,
    ]);
  });

  it('reports invalid YAML in course.yaml', async () => {
    const problems = await problemsAfter((dir) => edit(dir, `${COURSE}/course.yaml`, (s) => `${s}\ntitle: [aberto\n`));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(new RegExp(`^${COURSE}/course.yaml: YAML inválido: `));
  });

  it('requires the preparation module first', async () => {
    const problems = await problemsAfter(async (dir) => {
      await remove(dir, `${COURSE}/00-preparacao`);
      await edit(dir, `${COURSE}/course.yaml`, (s) =>
        s.replace('  - id: 00-preparacao\n    title: Prepare seu ambiente\n', '').replace(
          'modules:\n',
          'modules:\n  - id: 02-extra\n    title: Extra\n',
        ),
      );
    });
    expect(problems).toContain(
      `${COURSE}/course.yaml: o primeiro módulo deve ser "00-preparacao" (preparação do ambiente)`,
    );
  });

  it('keeps "modules" in course.yaml in sync with the folders', async () => {
    const problems = await problemsAfter((dir) => remove(dir, `${COURSE}/01-mao-na-massa`));
    expect(problems).toEqual([
      `${COURSE}/course.yaml: os módulos de "modules" (00-preparacao, 01-mao-na-massa) não batem com as pastas (00-preparacao)`,
    ]);
  });

  it('numbers lessons from 01 without gaps', async () => {
    const problems = await problemsAfter((dir) =>
      rename(
        path.join(dir, COURSE, '00-preparacao/02-no-seu-aparelho.md'),
        path.join(dir, COURSE, '00-preparacao/03-no-seu-aparelho.md'),
      ),
    );
    expect(problems).toEqual([
      `${COURSE}/00-preparacao/03-no-seu-aparelho.md: numeração fora de ordem: esperado 02`,
    ]);
  });

  it('forbids two lessons with the same slug in a course', async () => {
    const problems = await problemsAfter(async (dir) => {
      await rename(
        path.join(dir, COURSE, '01-mao-na-massa/01-primeiro-passo.md'),
        path.join(dir, COURSE, '01-mao-na-massa/01-boas-vindas.md'),
      );
      await edit(dir, `${COURSE}/01-mao-na-massa/01-boas-vindas.md`, (s) =>
        s.replace('captions: 01-primeiro-passo.vtt\n', ''),
      );
    });
    expect(problems).toEqual([
      `${COURSE}/01-mao-na-massa/01-boas-vindas.md: já existe outra aula "boas-vindas" neste curso`,
    ]);
  });

  it('only allows platform variants in the preparation module', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/01-mao-na-massa/01-primeiro-passo.md`, (s) =>
        s.replace('quiz:', 'variants:\n  android:\n    steps: Abra o Chrome e siga.\n  ios:\n    steps: Abra o Safari e siga.\nquiz:'),
      ),
    );
    expect(problems).toEqual([
      `${COURSE}/01-mao-na-massa/01-primeiro-passo.md: variants só pode aparecer no módulo 00-preparacao`,
    ]);
  });

  it('checks that declared captions exist', async () => {
    const problems = await problemsAfter((dir) => remove(dir, `${COURSE}/01-mao-na-massa/01-primeiro-passo.vtt`));
    expect(problems).toEqual([
      `${COURSE}/01-mao-na-massa/01-primeiro-passo.md: legenda não encontrada: 01-primeiro-passo.vtt`,
    ]);
  });

  it('requires video and captions in every lesson of a published course', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/course.yaml`, (s) => s.replace('status: draft', 'status: published')),
    );
    expect(problems).toEqual([
      `${COURSE}/00-preparacao/01-boas-vindas.md: curso publicado: toda aula precisa de vídeo`,
      `${COURSE}/00-preparacao/01-boas-vindas.md: curso publicado: toda aula precisa de legenda em português (captions)`,
      `${COURSE}/00-preparacao/02-no-seu-aparelho.md: curso publicado: toda aula precisa de vídeo`,
      `${COURSE}/00-preparacao/02-no-seu-aparelho.md: curso publicado: toda aula precisa de legenda em português (captions)`,
    ]);
  });

  it('rejects HTML inside Markdown', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/00-preparacao/01-boas-vindas.md`, (s) => `${s}\n<b>Atenção</b>\n`),
    );
    expect(problems).toEqual([
      `${COURSE}/00-preparacao/01-boas-vindas.md: use só Markdown: HTML não é permitido (a CSP do site bloqueia estilos e scripts inline)`,
    ]);
  });

  it('requires rubric weights that add up to 100', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/projeto.md`, (s) => s.replace('weight: 40', 'weight: 30')),
    );
    expect(problems).toEqual([`${COURSE}/projeto.md: os pesos da rubrica somam 90; precisam somar 100`]);
  });

  it('only accepts hosts listed in cast.yaml', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/course.yaml`, (s) => s.replace('hosts: [ana]', 'hosts: [ana, beto]')),
    );
    expect(problems).toEqual([
      `${COURSE}/course.yaml: apresentador desconhecido: beto (cadastre em content/cast.yaml)`,
    ]);
  });

  it('flags files that do not belong in a course folder', async () => {
    const problems = await problemsAfter((dir) => writeFile(path.join(dir, COURSE, 'notas.txt'), 'x'));
    expect(problems).toEqual([
      `${COURSE}/notas.txt: esperado course.yaml, projeto.md ou pastas de módulo como 01-nome-do-modulo`,
    ]);
  });
});
```

`packages/content/test/cli.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COURSE, VALID, copyFixture, edit } from './helpers.ts';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

describe('content:check CLI', () => {
  it('exits 0 and summarizes valid content', () => {
    const result = run([VALID]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('Conteúdo OK: 1 curso, 3 aulas.\n');
  });

  it('exits 1 and lists every problem', async () => {
    const dir = await copyFixture();
    await edit(dir, `${COURSE}/projeto.md`, (s) => s.replace('weight: 40', 'weight: 30'));

    const result = run([dir]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Encontrei 1 problema no conteúdo:');
    expect(result.stdout).toContain('projeto.md: os pesos da rubrica somam 90; precisam somar 100');
  });

  it('exits 2 without the content folder', () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Uso: node packages/content/src/cli.ts <pasta-do-conteúdo>');
  });

  it('exits 2 when the folder has no courses/', () => {
    const result = run([fileURLToPath(new URL('./', import.meta.url))]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Não consegui ler o conteúdo em');
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm vitest run --project content`
Expected: FAIL — os módulos `../src/*.ts` ainda não existem.

- [ ] **Step 5: Implementar**

`packages/content/src/messages.ts`:

```ts
import type * as z from 'zod';

const TYPE_NAMES: Record<string, string> = {
  string: 'texto',
  number: 'número',
  boolean: 'verdadeiro ou falso (true/false)',
  array: 'lista',
  object: 'objeto',
};
const UNITS: Record<string, string> = { string: 'caracteres', array: 'itens' };

/** pt-BR messages for content authors (zod's bundled "pt" locale is European Portuguese). */
export const ptBrErrors: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined
        ? 'campo obrigatório'
        : `tipo inválido: esperado ${TYPE_NAMES[issue.expected] ?? issue.expected}`;
    case 'too_small':
      return issue.origin === 'number'
        ? `precisa ser no mínimo ${issue.minimum}`
        : `precisa ter no mínimo ${issue.minimum} ${UNITS[issue.origin] ?? 'itens'}`;
    case 'too_big':
      return issue.origin === 'number'
        ? `precisa ser no máximo ${issue.maximum}`
        : `precisa ter no máximo ${issue.maximum} ${UNITS[issue.origin] ?? 'itens'}`;
    case 'invalid_value':
      return `valor inválido: use ${issue.values.map((value) => JSON.stringify(value)).join(' ou ')}`;
    case 'invalid_format':
      return 'formato inválido';
    case 'unrecognized_keys':
      return `campo desconhecido: ${issue.keys.join(', ')}`;
    case 'invalid_key':
      return 'chave inválida';
    default:
      return undefined;
  }
};
```

`packages/content/src/schema.ts`:

```ts
import * as z from 'zod';

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODULE_ID = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PLATFORMS = ['android', 'ios', 'windows', 'mac', 'chromeos'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABELS: Record<Platform, string> = {
  android: 'Android',
  ios: 'iPhone',
  windows: 'Windows',
  mac: 'Mac',
  chromeos: 'Chromebook',
};

export const LEVELS = ['iniciante', 'intermediario'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = { iniciante: 'iniciante', intermediario: 'intermediário' };

export const DEVICES = ['celular', 'computador'] as const;
export type Device = (typeof DEVICES)[number];

export const REQUIREMENTS = ['google', 'github', 'claude'] as const;
export type Requirement = (typeof REQUIREMENTS)[number];
export const REQUIREMENT_LABELS: Record<Requirement, string> = {
  google: 'conta Google',
  github: 'conta no GitHub',
  claude: 'conta no Claude.ai',
};

export const DELIVERABLES = ['url', 'github', 'images', 'text'] as const;
export type Deliverable = (typeof DELIVERABLES)[number];
export const DELIVERABLE_LABELS: Record<Deliverable, string> = {
  url: 'Link do site no ar',
  github: 'Repositório no GitHub',
  images: 'Imagens (prints da tela)',
  text: 'Texto contando o que você fez',
};

const slug = z.string().regex(SLUG, { error: 'use letras minúsculas, números e hífens' });
const lessonLength = { error: 'aulas têm de 2 a 5 minutos (120 a 300 segundos)' };

export const courseMetaSchema = z.strictObject({
  title: z.string().min(3).max(80),
  outcome: z.string().regex(/^Você sai com: \S.{3,}$/, {
    error: 'comece com "Você sai com: " e diga o resultado concreto do curso',
  }),
  level: z.enum(LEVELS),
  durationMin: z.number().int().min(30).max(90),
  devices: z.array(z.enum(DEVICES)).min(1),
  cost: z.literal(0, {
    error: 'o curso precisa custar R$ 0; ferramenta paga vai em paidTools, com alternativa grátis',
  }),
  paidTools: z
    .array(z.strictObject({ name: z.string().min(2), freeAlternative: z.string().min(2) }))
    .default([]),
  requirements: z.array(z.enum(REQUIREMENTS)).default([]),
  skills: z.array(z.string().min(3)).min(1),
  hosts: z.array(slug).default([]),
  status: z.enum(['draft', 'published']),
  modules: z
    .array(
      z.strictObject({
        id: z.string().regex(MODULE_ID, { error: 'use o nome da pasta do módulo, como 01-nome-do-modulo' }),
        title: z.string().min(3).max(60),
      }),
    )
    .min(2, { error: 'o curso precisa do módulo 00-preparacao e de pelo menos mais um' }),
});

const quizQuestionSchema = z
  .strictObject({
    question: z.string().min(5),
    options: z.array(z.string().min(1)).min(2).max(4),
    answer: z.number().int().min(0),
    explanation: z.string().min(5),
  })
  .refine((question) => question.answer < question.options.length, {
    error: 'answer aponta para uma opção que não existe (conte a partir de 0)',
    path: ['answer'],
  });

export const lessonFrontmatterSchema = z.strictObject({
  title: z.string().min(3).max(80),
  summary: z.string().min(10).max(140),
  video: z
    .strictObject({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/, { error: 'id de vídeo inválido' }),
      durationSec: z.number().int().min(120, lessonLength).max(300, lessonLength),
    })
    .optional(),
  captions: z
    .string()
    .regex(/^[a-z0-9-]+\.vtt$/, { error: 'informe o nome do arquivo .vtt da pasta do módulo' })
    .optional(),
  variants: z.partialRecord(z.enum(PLATFORMS), z.strictObject({ steps: z.string().min(10) })).optional(),
  quiz: z.array(quizQuestionSchema).min(1).max(3),
  checkpoint: z.array(z.string().min(3)).min(1).optional(),
});

export const projectFrontmatterSchema = z.strictObject({
  title: z.string().min(3).max(80),
  deliverables: z.array(z.enum(DELIVERABLES)).min(1),
  criteria: z
    .array(
      z.strictObject({
        id: slug,
        description: z.string().min(5),
        weight: z.number().int().min(1).max(100),
        required: z.boolean(),
      }),
    )
    .min(1),
  passScore: z.number().int().min(0).max(100),
});

export const castSchema = z.strictObject({
  hosts: z.array(z.strictObject({ id: slug, name: z.string().min(2) })),
});

export type CourseMeta = z.output<typeof courseMetaSchema>;
export type LessonFrontmatter = z.output<typeof lessonFrontmatterSchema>;
export type QuizQuestion = LessonFrontmatter['quiz'][number];
export type ProjectFrontmatter = z.output<typeof projectFrontmatterSchema>;
export type Cast = z.output<typeof castSchema>;
```

`packages/content/src/frontmatter.ts`:

```ts
import { parse } from 'yaml';

export type FrontmatterResult =
  | { ok: true; data: unknown; body: string }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'yaml'; detail: string };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

/** Splits a Markdown file into its YAML frontmatter and its body; never throws. */
export function parseFrontmatter(source: string): FrontmatterResult {
  const match = FRONTMATTER.exec(source);
  if (!match) return { ok: false, reason: 'missing' };
  try {
    return { ok: true, data: parse(match[1] ?? '') as unknown, body: (match[2] ?? '').trim() };
  } catch (error) {
    return { ok: false, reason: 'yaml', detail: (error as Error).message };
  }
}
```

`packages/content/src/load.ts`:

```ts
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import type * as z from 'zod';
import { parseFrontmatter } from './frontmatter.ts';
import { ptBrErrors } from './messages.ts';
import { checkCourse } from './rules.ts';
import {
  SLUG,
  castSchema,
  courseMetaSchema,
  lessonFrontmatterSchema,
  projectFrontmatterSchema,
  type Cast,
  type CourseMeta,
  type LessonFrontmatter,
  type ProjectFrontmatter,
} from './schema.ts';

export interface Problem {
  /** Absolute path of the file with the problem. */
  file: string;
  /** What to fix, in pt-BR. */
  message: string;
}

export interface Lesson {
  slug: string;
  number: number;
  moduleId: string;
  file: string;
  frontmatter: LessonFrontmatter;
  body: string;
}

export interface Module {
  id: string;
  number: number;
  title: string;
  lessons: Lesson[];
  /** Caption files (.vtt) found in the module folder. */
  captions: string[];
}

export interface Project {
  file: string;
  frontmatter: ProjectFrontmatter;
  body: string;
}

export interface Course {
  slug: string;
  dir: string;
  meta: CourseMeta;
  modules: Module[];
  project: Project;
}

export interface Catalog {
  courses: Course[];
  cast: Cast;
}

export interface LoadResult {
  catalog: Catalog;
  problems: Problem[];
}

const NUMBERED = /^(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Reads content/ (cast.yaml and courses/*) and validates every file. Content problems are
 * collected, never thrown; only a missing courses/ folder throws.
 */
export async function loadCatalog(contentDir: string): Promise<LoadResult> {
  const problems: Problem[] = [];
  const castFile = path.join(contentDir, 'cast.yaml');
  const castData = await readYaml(castFile, problems);
  const cast = (castData === undefined ? undefined : validate(castSchema, castData, castFile, problems)) ?? {
    hosts: [],
  };

  const coursesDir = path.join(contentDir, 'courses');
  const courses: Course[] = [];
  for (const entry of await sortedEntries(coursesDir)) {
    const dir = path.join(coursesDir, entry.name);
    if (!entry.isDirectory()) {
      problems.push({ file: dir, message: 'só pastas de curso podem ficar em courses/' });
      continue;
    }
    if (!SLUG.test(entry.name)) {
      problems.push({
        file: dir,
        message: 'nome de pasta inválido: use letras minúsculas, números e hífens (ex.: crie-seu-site-com-ia)',
      });
      continue;
    }
    const course = await loadCourse(dir, entry.name, problems);
    if (course) {
      problems.push(...checkCourse(course, cast));
      courses.push(course);
    }
  }
  return { catalog: { courses, cast }, problems };
}

async function loadCourse(dir: string, slug: string, problems: Problem[]): Promise<Course | undefined> {
  const metaFile = path.join(dir, 'course.yaml');
  const metaData = await readYaml(metaFile, problems);
  const meta = metaData === undefined ? undefined : validate(courseMetaSchema, metaData, metaFile, problems);

  const projectFile = path.join(dir, 'projeto.md');
  const projectSource = await readText(projectFile, problems);
  const project =
    projectSource === undefined
      ? undefined
      : parseMarkdown(projectSource, projectFile, projectFrontmatterSchema, problems);

  const modules: Module[] = [];
  for (const entry of await sortedEntries(dir)) {
    if (entry.name === 'course.yaml' || entry.name === 'projeto.md') continue;
    const moduleDir = path.join(dir, entry.name);
    const match = entry.isDirectory() ? NUMBERED.exec(entry.name) : null;
    if (!match) {
      problems.push({
        file: moduleDir,
        message: 'esperado course.yaml, projeto.md ou pastas de módulo como 01-nome-do-modulo',
      });
      continue;
    }
    modules.push(await loadModule(moduleDir, entry.name, Number(match[1]), meta, problems));
  }

  if (!meta || !project) return undefined;
  return { slug, dir, meta, modules, project: { file: projectFile, ...project } };
}

async function loadModule(
  dir: string,
  id: string,
  number: number,
  meta: CourseMeta | undefined,
  problems: Problem[],
): Promise<Module> {
  const lessons: Lesson[] = [];
  const captions: string[] = [];
  let position = 0;
  for (const entry of await sortedEntries(dir)) {
    const file = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.vtt')) {
      captions.push(entry.name);
      continue;
    }
    const match = entry.isFile() && entry.name.endsWith('.md') ? NUMBERED.exec(entry.name.slice(0, -3)) : null;
    if (!match) {
      problems.push({ file, message: 'esperado aulas como 01-nome-da-aula.md ou legendas .vtt' });
      continue;
    }
    // Numbering is checked on file names, so an invalid lesson does not shift the ones after it.
    position += 1;
    if (Number(match[1]) !== position) {
      problems.push({ file, message: `numeração fora de ordem: esperado ${String(position).padStart(2, '0')}` });
    }
    const source = await readText(file, problems);
    const parsed = source === undefined ? undefined : parseMarkdown(source, file, lessonFrontmatterSchema, problems);
    if (parsed) {
      lessons.push({
        slug: match[2] ?? '',
        number: Number(match[1]),
        moduleId: id,
        file,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
      });
    }
  }
  const title = meta?.modules.find((module) => module.id === id)?.title ?? id;
  return { id, number, title, lessons, captions };
}

function parseMarkdown<S extends z.ZodType>(
  source: string,
  file: string,
  schema: S,
  problems: Problem[],
): { frontmatter: z.output<S>; body: string } | undefined {
  const result = parseFrontmatter(source);
  if (!result.ok) {
    problems.push({
      file,
      message:
        result.reason === 'missing'
          ? 'o arquivo precisa começar com um bloco --- de frontmatter'
          : `frontmatter com YAML inválido: ${result.detail}`,
    });
    return undefined;
  }
  const frontmatter = validate(schema, result.data, file, problems);
  return frontmatter === undefined ? undefined : { frontmatter, body: result.body };
}

function validate<S extends z.ZodType>(
  schema: S,
  data: unknown,
  file: string,
  problems: Problem[],
): z.output<S> | undefined {
  const result = schema.safeParse(data, { error: ptBrErrors });
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const field = issue.path.join('.');
    problems.push({ file, message: field ? `${field}: ${issue.message}` : issue.message });
  }
  return undefined;
}

async function readText(file: string, problems: Problem[]): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    problems.push({ file, message: 'arquivo obrigatório não encontrado' });
    return undefined;
  }
}

async function readYaml(file: string, problems: Problem[]): Promise<unknown> {
  const source = await readText(file, problems);
  if (source === undefined) return undefined;
  try {
    return parse(source) as unknown;
  } catch (error) {
    problems.push({ file, message: `YAML inválido: ${(error as Error).message}` });
    return undefined;
  }
}

async function sortedEntries(dir: string): Promise<Dirent[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}
```

`packages/content/src/rules.ts`:

```ts
import path from 'node:path';
import type { Course, Problem } from './load.ts';
import type { Cast } from './schema.ts';

const HTML_TAG = /<\/?[a-z][^>]*>/i;
const HTML_MESSAGE = 'use só Markdown: HTML não é permitido (a CSP do site bloqueia estilos e scripts inline)';

/** Rules that span several files of a course (the schemas check each file alone). */
export function checkCourse(course: Course, cast: Cast): Problem[] {
  const problems: Problem[] = [];
  const report = (file: string, message: string) => problems.push({ file, message });
  const courseFile = path.join(course.dir, 'course.yaml');

  const declared = course.meta.modules.map((module) => module.id);
  const found = course.modules.map((module) => module.id);
  if (declared[0] !== '00-preparacao') {
    report(courseFile, 'o primeiro módulo deve ser "00-preparacao" (preparação do ambiente)');
  }
  if (declared.join() !== found.join()) {
    report(
      courseFile,
      `os módulos de "modules" (${declared.join(', ')}) não batem com as pastas (${found.join(', ') || 'nenhuma'})`,
    );
  }

  const slugs = new Set<string>();
  for (const module of course.modules) {
    if (module.lessons.length === 0) report(path.join(course.dir, module.id), 'o módulo precisa de pelo menos uma aula');
    for (const lesson of module.lessons) {
      if (lesson.slug === 'projeto') report(lesson.file, '"projeto" é reservado para o projeto final; escolha outro nome');
      if (slugs.has(lesson.slug)) report(lesson.file, `já existe outra aula "${lesson.slug}" neste curso`);
      slugs.add(lesson.slug);

      const { variants, captions, video } = lesson.frontmatter;
      if (variants) {
        if (module.number !== 0) report(lesson.file, 'variants só pode aparecer no módulo 00-preparacao');
        if (Object.keys(variants).length < 2) report(lesson.file, 'variants precisa de pelo menos duas plataformas');
      }
      if (captions && !module.captions.includes(captions)) report(lesson.file, `legenda não encontrada: ${captions}`);
      if (course.meta.status === 'published') {
        if (!video) report(lesson.file, 'curso publicado: toda aula precisa de vídeo');
        if (!captions) report(lesson.file, 'curso publicado: toda aula precisa de legenda em português (captions)');
      }
      if (lesson.body.length === 0) report(lesson.file, 'escreva o roteiro ou a transcrição no corpo da aula');
      const texts = [lesson.body, ...Object.values(variants ?? {}).map((variant) => variant.steps)];
      if (texts.some((text) => HTML_TAG.test(text))) report(lesson.file, HTML_MESSAGE);
    }
  }

  const { project } = course;
  const total = project.frontmatter.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (total !== 100) report(project.file, `os pesos da rubrica somam ${total}; precisam somar 100`);
  const ids = project.frontmatter.criteria.map((criterion) => criterion.id);
  if (new Set(ids).size !== ids.length) report(project.file, 'há critérios com o mesmo id');
  if (project.body.length === 0) report(project.file, 'descreva o cenário do projeto no corpo do arquivo');
  if (HTML_TAG.test(project.body)) report(project.file, HTML_MESSAGE);

  const hosts = new Set(cast.hosts.map((host) => host.id));
  for (const host of course.meta.hosts) {
    if (!hosts.has(host)) report(courseFile, `apresentador desconhecido: ${host} (cadastre em content/cast.yaml)`);
  }
  return problems;
}
```

`packages/content/src/cli.ts`:

```ts
import path from 'node:path';
import { loadCatalog, type LoadResult } from './load.ts';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const [dir] = process.argv.slice(2);

if (!dir) {
  console.error('Uso: node packages/content/src/cli.ts <pasta-do-conteúdo>');
  process.exitCode = 2;
} else {
  let result: LoadResult | undefined;
  try {
    result = await loadCatalog(path.resolve(dir));
  } catch (error) {
    console.error(`Não consegui ler o conteúdo em ${dir}: ${(error as Error).message}`);
    process.exitCode = 2;
  }
  if (result && result.problems.length > 0) {
    console.log(`Encontrei ${plural(result.problems.length, 'problema', 'problemas')} no conteúdo:`);
    for (const problem of result.problems) {
      console.log(`- ${path.relative(process.cwd(), problem.file)}: ${problem.message}`);
    }
    process.exitCode = 1;
  } else if (result) {
    const { courses } = result.catalog;
    const lessons = courses.reduce(
      (total, course) => total + course.modules.reduce((sum, module) => sum + module.lessons.length, 0),
      0,
    );
    console.log(`Conteúdo OK: ${plural(courses.length, 'curso', 'cursos')}, ${plural(lessons, 'aula', 'aulas')}.`);
  }
}
```

`packages/content/src/index.ts`:

```ts
export {
  loadCatalog,
  type Catalog,
  type Course,
  type Lesson,
  type LoadResult,
  type Module,
  type Problem,
  type Project,
} from './load.ts';
export {
  DELIVERABLE_LABELS,
  LEVEL_LABELS,
  PLATFORMS,
  PLATFORM_LABELS,
  REQUIREMENT_LABELS,
  type Cast,
  type CourseMeta,
  type Deliverable,
  type Device,
  type LessonFrontmatter,
  type Level,
  type Platform,
  type ProjectFrontmatter,
  type QuizQuestion,
  type Requirement,
} from './schema.ts';
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm vitest run --project content && pnpm --filter @egt/content typecheck && pnpm lint`
Expected: todos os testes PASS; typecheck e lint sem erros. Se o TypeScript reclamar de algum campo de `issue` em `messages.ts`, confira os nomes em `node_modules/zod/v4/core/errors.d.ts` (`$ZodRawIssue`) e ajuste só o acesso ao campo, sem mudar as mensagens.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml vitest.config.ts packages/content
git commit -m "feat(content): valida cursos com zod e cria o pnpm content:check"
```

---

### Task 2: Pacote `@egt/core` (progresso local)

**Files:**
- Modify: `vitest.config.ts` (raiz)
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/src/progress.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/progress.test.ts`

**Interfaces:**
- Produces (usados nas Tasks 5 a 8; sem dependências, seguro para o navegador):
  - `interface CourseProgress { completedLessons: string[]; correctAnswers: string[]; lastLesson?: string; updatedAt: string }` (`correctAnswers` = `"<aula>#<índice da pergunta>"`)
  - `interface Progress { version: 1; courses: Record<string, CourseProgress> }`
  - `emptyProgress(): Progress`
  - `parseProgress(value: unknown): Progress` (tolerante: descarta o que estiver malformado)
  - `visitLesson(p, course, lesson, now: Date): Progress`
  - `completeLesson(p, course, lesson, now: Date): Progress`
  - `recordCorrectAnswer(p, course, lesson, questionIndex: number, now: Date): Progress`
  - `interface OutlineLesson { slug: string; title: string; url: string }`, `interface OutlineModule { title: string; lessons: OutlineLesson[] }`
  - `interface CourseOutline { slug: string; title: string; url: string; modules: OutlineModule[]; projectTitle: string; projectUrl: string }`
  - `interface CourseStatus { done: number; total: number; percent: number; started: boolean; finished: boolean; next: { title: string; url: string } }`
  - `outlineLessons(outline): OutlineLesson[]`, `courseStatus(outline, progress?: CourseProgress): CourseStatus`, `mostRecentCourse(progress, outlines): CourseOutline | undefined`

- [ ] **Step 1: Criar o pacote**

`packages/core/package.json`:

```json
{
  "name": "@egt/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'core' },
});
```

Instale `pnpm --filter @egt/core add -D @types/node@^24.19.1 typescript@~6.0.3` e acrescente `'packages/core'` à lista `projects` do `vitest.config.ts` da raiz, logo depois de `'packages/content'`.

- [ ] **Step 2: Escrever o teste que falha**

`packages/core/test/progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  completeLesson,
  courseStatus,
  emptyProgress,
  mostRecentCourse,
  parseProgress,
  recordCorrectAnswer,
  visitLesson,
  type CourseOutline,
} from '../src/index.ts';

const NOW = new Date('2026-10-09T12:00:00.000Z');
const LATER = new Date('2026-10-09T13:00:00.000Z');

const outline: CourseOutline = {
  slug: 'site-com-ia',
  title: 'Crie seu site com IA',
  url: '/cursos/site-com-ia/',
  modules: [
    { title: 'Prepare seu ambiente', lessons: [{ slug: 'boas-vindas', title: 'Boas-vindas', url: '/cursos/site-com-ia/boas-vindas/' }] },
    {
      title: 'Seu primeiro site',
      lessons: [
        { slug: 'escolha', title: 'Escolha o cliente', url: '/cursos/site-com-ia/escolha/' },
        { slug: 'publique', title: 'Publique', url: '/cursos/site-com-ia/publique/' },
      ],
    },
  ],
  projectTitle: 'O site de um negócio do bairro',
  projectUrl: '/cursos/site-com-ia/projeto/',
};

describe('parseProgress', () => {
  it('returns empty progress for anything that is not version 1', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('texto')).toEqual(emptyProgress());
    expect(parseProgress({ version: 2, courses: {} })).toEqual(emptyProgress());
  });

  it('keeps valid courses, drops broken ones and sorts the sets', () => {
    const parsed = parseProgress({
      version: 1,
      courses: {
        ok: { completedLessons: ['b', 'a', 'a'], correctAnswers: [], lastLesson: 'b', updatedAt: NOW.toISOString() },
        quebrado: { completedLessons: 'a', correctAnswers: [], updatedAt: NOW.toISOString() },
      },
    });
    expect(parsed).toEqual({
      version: 1,
      courses: {
        ok: { completedLessons: ['a', 'b'], correctAnswers: [], lastLesson: 'b', updatedAt: NOW.toISOString() },
      },
    });
  });
});

describe('updates', () => {
  it('completes a lesson once and remembers it as the last one', () => {
    const once = completeLesson(emptyProgress(), 'site-com-ia', 'boas-vindas', NOW);
    const twice = completeLesson(once, 'site-com-ia', 'boas-vindas', LATER);

    expect(twice.courses['site-com-ia']).toEqual({
      completedLessons: ['boas-vindas'],
      correctAnswers: [],
      lastLesson: 'boas-vindas',
      updatedAt: LATER.toISOString(),
    });
  });

  it('records correct answers per question', () => {
    const progress = recordCorrectAnswer(emptyProgress(), 'site-com-ia', 'boas-vindas', 1, NOW);
    expect(progress.courses['site-com-ia']?.correctAnswers).toEqual(['boas-vindas#1']);
  });

  it('marks a visit without completing the lesson', () => {
    const progress = visitLesson(emptyProgress(), 'site-com-ia', 'escolha', NOW);
    expect(progress.courses['site-com-ia']).toMatchObject({ completedLessons: [], lastLesson: 'escolha' });
  });

  it('never changes the progress it receives', () => {
    const original = emptyProgress();
    completeLesson(original, 'site-com-ia', 'boas-vindas', NOW);
    expect(original).toEqual(emptyProgress());
  });
});

describe('courseStatus', () => {
  it('starts at the first lesson', () => {
    expect(courseStatus(outline, undefined)).toEqual({
      done: 0,
      total: 3,
      percent: 0,
      started: false,
      finished: false,
      next: { title: 'Boas-vindas', url: '/cursos/site-com-ia/boas-vindas/' },
    });
  });

  it('points to the first pending lesson and ignores lessons that no longer exist', () => {
    const progress = completeLesson(
      completeLesson(emptyProgress(), 'site-com-ia', 'boas-vindas', NOW),
      'site-com-ia',
      'aula-removida',
      NOW,
    ).courses['site-com-ia'];

    expect(courseStatus(outline, progress)).toMatchObject({
      done: 1,
      percent: 33,
      started: true,
      next: { title: 'Escolha o cliente', url: '/cursos/site-com-ia/escolha/' },
    });
  });

  it('counts a visit as started', () => {
    const progress = visitLesson(emptyProgress(), 'site-com-ia', 'escolha', NOW).courses['site-com-ia'];
    expect(courseStatus(outline, progress)).toMatchObject({ done: 0, started: true });
  });

  it('sends a finished course to the project', () => {
    let progress = emptyProgress();
    for (const slug of ['boas-vindas', 'escolha', 'publique']) progress = completeLesson(progress, 'site-com-ia', slug, NOW);

    expect(courseStatus(outline, progress.courses['site-com-ia'])).toMatchObject({
      done: 3,
      percent: 100,
      finished: true,
      next: { title: 'Projeto final', url: '/cursos/site-com-ia/projeto/' },
    });
  });
});

describe('mostRecentCourse', () => {
  it('returns the course touched last, among the known ones', () => {
    const other: CourseOutline = { ...outline, slug: 'python', title: 'Python', url: '/cursos/python/' };
    let progress = visitLesson(emptyProgress(), 'site-com-ia', 'boas-vindas', NOW);
    progress = visitLesson(progress, 'python', 'boas-vindas', LATER);
    progress = visitLesson(progress, 'curso-removido', 'x', new Date('2026-10-10T00:00:00.000Z'));

    expect(mostRecentCourse(progress, [outline, other])?.slug).toBe('python');
    expect(mostRecentCourse(emptyProgress(), [outline])).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm vitest run --project core`
Expected: FAIL — `../src/index.ts` não existe.

- [ ] **Step 4: Implementar**

`packages/core/src/progress.ts`:

```ts
export interface CourseProgress {
  /** Completed lesson slugs, sorted and unique. */
  completedLessons: string[];
  /** Correctly answered questions as `<lesson slug>#<question index>`, sorted and unique. */
  correctAnswers: string[];
  /** Last lesson the learner opened. */
  lastLesson?: string;
  /** ISO timestamp of the last change. */
  updatedAt: string;
}

export interface Progress {
  version: 1;
  courses: Record<string, CourseProgress>;
}

export function emptyProgress(): Progress {
  return { version: 1, courses: {} };
}

const sortedUnique = (values: Iterable<string>): string[] => [...new Set(values)].sort();
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Reads stored progress defensively: anything malformed is dropped instead of breaking the page. */
export function parseProgress(value: unknown): Progress {
  const progress = emptyProgress();
  if (typeof value !== 'object' || value === null) return progress;
  const { version, courses } = value as { version?: unknown; courses?: unknown };
  if (version !== 1 || typeof courses !== 'object' || courses === null) return progress;
  for (const [slug, raw] of Object.entries(courses)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const course = raw as Record<string, unknown>;
    if (
      !isStringArray(course.completedLessons) ||
      !isStringArray(course.correctAnswers) ||
      typeof course.updatedAt !== 'string'
    ) {
      continue;
    }
    progress.courses[slug] = {
      completedLessons: sortedUnique(course.completedLessons),
      correctAnswers: sortedUnique(course.correctAnswers),
      ...(typeof course.lastLesson === 'string' ? { lastLesson: course.lastLesson } : {}),
      updatedAt: course.updatedAt,
    };
  }
  return progress;
}

function update(
  progress: Progress,
  course: string,
  now: Date,
  change: (current: CourseProgress) => Partial<CourseProgress>,
): Progress {
  const current = progress.courses[course] ?? { completedLessons: [], correctAnswers: [], updatedAt: now.toISOString() };
  return {
    ...progress,
    courses: { ...progress.courses, [course]: { ...current, ...change(current), updatedAt: now.toISOString() } },
  };
}

export function visitLesson(progress: Progress, course: string, lesson: string, now: Date): Progress {
  return update(progress, course, now, () => ({ lastLesson: lesson }));
}

export function completeLesson(progress: Progress, course: string, lesson: string, now: Date): Progress {
  return update(progress, course, now, (current) => ({
    completedLessons: sortedUnique([...current.completedLessons, lesson]),
    lastLesson: lesson,
  }));
}

export function recordCorrectAnswer(
  progress: Progress,
  course: string,
  lesson: string,
  questionIndex: number,
  now: Date,
): Progress {
  return update(progress, course, now, (current) => ({
    correctAnswers: sortedUnique([...current.correctAnswers, `${lesson}#${questionIndex}`]),
  }));
}

export interface OutlineLesson {
  slug: string;
  title: string;
  url: string;
}

export interface OutlineModule {
  title: string;
  lessons: OutlineLesson[];
}

/** What the browser needs to know about a course (built at build time, passed to islands as JSON). */
export interface CourseOutline {
  slug: string;
  title: string;
  url: string;
  modules: OutlineModule[];
  projectTitle: string;
  projectUrl: string;
}

export interface CourseStatus {
  done: number;
  total: number;
  percent: number;
  started: boolean;
  finished: boolean;
  next: { title: string; url: string };
}

export function outlineLessons(outline: CourseOutline): OutlineLesson[] {
  return outline.modules.flatMap((module) => module.lessons);
}

export function courseStatus(outline: CourseOutline, progress: CourseProgress | undefined): CourseStatus {
  const lessons = outlineLessons(outline);
  const completed = new Set(progress?.completedLessons ?? []);
  const done = lessons.filter((lesson) => completed.has(lesson.slug)).length;
  const pending = lessons.find((lesson) => !completed.has(lesson.slug));
  return {
    done,
    total: lessons.length,
    percent: lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100),
    started: done > 0 || progress?.lastLesson !== undefined,
    finished: lessons.length > 0 && done === lessons.length,
    next: pending ? { title: pending.title, url: pending.url } : { title: 'Projeto final', url: outline.projectUrl },
  };
}

/** The known course the learner touched most recently ("Continue de onde parou"). */
export function mostRecentCourse(progress: Progress, outlines: CourseOutline[]): CourseOutline | undefined {
  let best: { outline: CourseOutline; updatedAt: string } | undefined;
  for (const outline of outlines) {
    const course = progress.courses[outline.slug];
    if (course && (!best || course.updatedAt > best.updatedAt)) best = { outline, updatedAt: course.updatedAt };
  }
  return best?.outline;
}
```

`packages/core/src/index.ts`:

```ts
export * from './progress.ts';
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm vitest run --project core && pnpm --filter @egt/core typecheck && pnpm lint`
Expected: PASS, sem erros.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts pnpm-lock.yaml packages/core
git commit -m "feat(core): progresso local por curso e status de conclusão"
```

---

### Task 3: Curso piloto "Crie seu site com IA" e guia de conteúdo

**Files:**
- Create: `content/cast.yaml`, `content/CLAUDE.md`
- Create: `content/courses/crie-seu-site-com-ia/course.yaml`, `projeto.md`
- Create: `content/courses/crie-seu-site-com-ia/00-preparacao/01-boas-vindas.md`, `02-deixe-as-ferramentas-a-mao.md`
- Create: `content/courses/crie-seu-site-com-ia/01-seu-primeiro-site/01-escolha-o-cliente.md`, `02-peca-o-site-para-a-ia.md`, `03-publique-no-github-pages.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm content:check` (Task 1).
- Produces: o curso `crie-seu-site-com-ia` em rascunho, com 5 aulas (slugs `boas-vindas`, `deixe-as-ferramentas-a-mao`, `escolha-o-cliente`, `peca-o-site-para-a-ia`, `publique-no-github-pages`); o e2e lê o conteúdo por `loadCatalog`, então os textos podem mudar sem quebrar os testes.

- [ ] **Step 1: Escrever o conteúdo**

`content/cast.yaml` (o elenco chega na Fase 3):

```yaml
hosts: []
```

`content/courses/crie-seu-site-com-ia/course.yaml`:

```yaml
title: Crie seu site com IA
outcome: 'Você sai com: o site de um negócio do bairro no ar, feito com ajuda de IA'
level: iniciante
durationMin: 45
devices: [celular, computador]
cost: 0
requirements: [github, claude]
skills:
  - Escrever pedidos claros para uma IA
  - Publicar um site estático de graça
  - Revisar um site no celular
hosts: []
status: draft
modules:
  - id: 00-preparacao
    title: Prepare seu ambiente
  - id: 01-seu-primeiro-site
    title: Seu primeiro site
```

`content/courses/crie-seu-site-com-ia/00-preparacao/01-boas-vindas.md`:

```md
---
title: Boas-vindas
summary: O que você vai construir e como funcionam as aulas.
quiz:
  - question: O que você vai ter no fim deste curso?
    options:
      - Um certificado de participação, só isso
      - O site de um negócio de verdade no ar
      - Um aplicativo publicado na loja do celular
    answer: 1
    explanation: Todo curso da Escola termina num projeto real. Aqui, é um site no ar para um negócio do seu bairro.
  - question: Quanto você vai gastar para fazer o curso?
    options:
      - Nada, tudo é grátis
      - Só o domínio do site
    answer: 0
    explanation: O curso e as ferramentas são grátis, e o site fica num endereço gratuito do GitHub.
---

Oi! Que bom ter você aqui.

Neste curso você vai criar o site de um negócio do seu bairro: pode ser o salão da vizinha, a oficina do seu tio ou a sua própria loja. A IA ajuda a escrever o código, e você decide o que entra no site.

As aulas são curtinhas, de 2 a 5 minutos. Em cada uma tem um teste rápido para você conferir se pegou a ideia. Errou? Sem problema: você tenta de novo na hora.

No final, você publica o site num endereço que qualquer pessoa abre e envia o link como projeto. É esse projeto que vale o certificado.

Bora começar?
```

`content/courses/crie-seu-site-com-ia/00-preparacao/02-deixe-as-ferramentas-a-mao.md`:

```md
---
title: Deixe as ferramentas à mão
summary: Crie as contas grátis e salve o GitHub e o Claude no seu aparelho.
variants:
  android:
    steps: |
      1. Abra o **Chrome** e entre em github.com.
      2. Toque nos três pontinhos, no canto de cima.
      3. Toque em **Adicionar à tela inicial** e confirme.
      4. Faça o mesmo com claude.ai.
  ios:
    steps: |
      1. Abra o **Safari** e entre em github.com.
      2. Toque em **Compartilhar** (o quadrado com a seta para cima).
      3. Toque em **Adicionar à Tela de Início** e confirme.
      4. Faça o mesmo com claude.ai.
  windows:
    steps: |
      1. Abra o navegador e entre em github.com.
      2. Aperte **Ctrl + D** para salvar nos favoritos.
      3. Faça o mesmo com claude.ai.
  mac:
    steps: |
      1. Abra o navegador e entre em github.com.
      2. Aperte **Cmd + D** para salvar nos favoritos.
      3. Faça o mesmo com claude.ai.
  chromeos:
    steps: |
      1. Abra o Chrome e entre em github.com.
      2. Aperte **Ctrl + D** para salvar nos favoritos.
      3. Faça o mesmo com claude.ai.
checkpoint:
  - Criei minha conta no GitHub
  - Criei minha conta no Claude.ai
  - Salvei os dois no meu aparelho
quiz:
  - question: Para que serve a conta no GitHub neste curso?
    options:
      - Para publicar o site num endereço grátis
      - Para pagar a hospedagem do site
      - Para conversar com a IA
    answer: 0
    explanation: O GitHub Pages publica o seu site de graça, num endereço que termina em github.io.
---

Antes de pôr a mão na massa, você precisa de duas contas grátis.

A primeira é no **GitHub** (github.com). É lá que o seu site vai morar. No cadastro, escolha um nome de usuário curto e fácil de lembrar, porque ele vai aparecer no endereço do site.

A segunda é no **Claude.ai** (claude.ai), um chat de IA que ajuda a escrever o código do site. O plano grátis dá conta do curso inteiro. Se você já usa outro chat de IA grátis, pode usar também.

Para não perder tempo procurando depois, deixe os dois salvos no seu aparelho. Escolha o seu aparelho e siga o passo a passo.
```

`content/courses/crie-seu-site-com-ia/01-seu-primeiro-site/01-escolha-o-cliente.md`:

```md
---
title: Escolha o cliente e o problema
summary: Ache um negócio do bairro e descubra o que o site precisa resolver.
checkpoint:
  - Escolhi o negócio
  - Anotei nome, o que vende, horário, endereço e WhatsApp
quiz:
  - question: Qual destas informações não pode faltar no site de um negócio do bairro?
    options:
      - A história completa da família do dono
      - Um jeito fácil de falar com o negócio, como o WhatsApp
      - Uma animação na abertura
    answer: 1
    explanation: Quem visita o site quer saber como comprar ou agendar. Contato fácil vem primeiro.
---

Todo site bom resolve um problema. Por isso, antes de abrir a IA, escolha para quem você vai fazer o site.

Pode ser o negócio de alguém que você conhece: a manicure da rua, a lanchonete da esquina, o eletricista do bairro. Se ainda não tiver um cliente, invente um parecido com os do seu bairro.

Converse com a pessoa, ou imagine a conversa, e anote cinco coisas:

- o nome do negócio;
- o que ele vende ou faz;
- o horário de funcionamento;
- o endereço ou a região que atende;
- o número de WhatsApp para contato.

Essas anotações viram o seu pedido para a IA na próxima aula.
```

`content/courses/crie-seu-site-com-ia/01-seu-primeiro-site/02-peca-o-site-para-a-ia.md`:

```md
---
title: Peça o site para a IA
summary: Escreva um pedido claro e receba o código do site pronto.
checkpoint:
  - Mandei o pedido para a IA
  - Conferi as informações e copiei o código
quiz:
  - question: Qual pedido tende a dar um site melhor?
    options:
      - Faz um site.
      - Crie a página de uma loja de bolos, com nome, horário, endereço e botão de WhatsApp, fácil de ler no celular.
    answer: 1
    explanation: Quanto mais detalhes você der, mais perto do que o cliente precisa a IA chega.
  - question: O que fazer se a IA errar uma informação do negócio?
    options:
      - Publicar assim mesmo
      - Pedir a correção na mesma conversa
    answer: 1
    explanation: Quem revisa é você. Peça a correção na conversa e confira de novo.
---

Abra o Claude.ai e comece uma conversa nova. Use o modelo abaixo e troque o que está entre colchetes pelas suas anotações:

> Crie uma página de site para [nome do negócio], que [o que vende ou faz]. Coloque o horário [horário], o endereço [endereço] e um botão de WhatsApp para o número [número com DDD]. A página precisa ser fácil de ler no celular. Entregue tudo num único arquivo index.html.

A IA vai devolver um bloco de código. Leia o texto da página com calma: confira o nome, o horário e o número. Se algo estiver errado, peça a correção na mesma conversa, do jeito que você falaria com uma pessoa.

Quando estiver tudo certo, copie o código inteiro. Na próxima aula você põe o site no ar.
```

`content/courses/crie-seu-site-com-ia/01-seu-primeiro-site/03-publique-no-github-pages.md`:

```md
---
title: Publique o site no GitHub Pages
summary: Crie o repositório, cole o código e ponha o site no ar de graça.
checkpoint:
  - Criei o repositório público
  - Criei o arquivo index.html com o código
  - Liguei o GitHub Pages e abri o link
quiz:
  - question: Como fica o endereço do site no GitHub Pages?
    options:
      - seu-usuario.github.io/nome-do-repositorio
      - www.nome-do-negocio.com.br, automaticamente
    answer: 0
    explanation: O GitHub Pages usa um endereço grátis com o seu nome de usuário. Domínio próprio é opcional e pago.
---

Agora o site vai para o ar. Dá para fazer tudo pelo navegador, no celular ou no computador.

1. No GitHub, toque em **New** para criar um repositório. Dê um nome curto, como `salao-da-cida`, deixe como **Public** e confirme.
2. Na página do repositório, toque em **Add file** e depois em **Create new file**. Dê o nome `index.html`, cole o código que a IA criou e salve em **Commit changes**.
3. Vá em **Settings** e depois em **Pages**. Em **Source**, deixe **Deploy from a branch**; em **Branch**, escolha `main` e salve.

Espere um ou dois minutos e atualize a página de **Pages**: o endereço do site aparece no topo, no formato `seu-usuario.github.io/salao-da-cida`. Abra no celular e confira se está tudo certo.

Mandou o link para o cliente? Pronto: você acabou de resolver um problema de verdade.
```

`content/courses/crie-seu-site-com-ia/projeto.md`:

```md
---
title: O site de um negócio do bairro
deliverables: [url, text]
criteria:
  - id: site-no-ar
    description: O link abre o site, sem erro, para qualquer pessoa.
    weight: 30
    required: true
  - id: informacoes
    description: O site mostra o nome, o que o negócio faz, o horário e o endereço ou a região atendida.
    weight: 25
    required: true
  - id: whatsapp
    description: O botão ou link de WhatsApp abre a conversa com o número certo.
    weight: 25
    required: true
  - id: celular
    description: Dá para ler e usar o site no celular sem dar zoom.
    weight: 20
    required: false
passScore: 70
---

Um negócio do seu bairro ainda não aparece na internet. Quem procura não acha o horário, o endereço nem um jeito rápido de chamar no WhatsApp.

Sua missão: criar e publicar o site desse negócio, com ajuda de IA, e mandar o link.

Junto com o link, escreva umas linhas contando para quem é o site e o que você pediu para a IA.
```

`content/CLAUDE.md`:

```md
# content — cursos da Escola

Conteúdo como código (spec §4.1, decisão D2). Tudo aqui é validado por `pnpm content:check`, que roda na CI.

## Estrutura

    courses/{curso}/
      course.yaml              metadados do curso
      00-preparacao/           módulo 0, obrigatório: preparar o ambiente
        01-{aula}.md
      01-{modulo}/
        01-{aula}.md
        01-{aula}.vtt          legenda em português (obrigatória para publicar)
      projeto.md               projeto final e rubrica
    cast.yaml                  elenco de apresentadores (Fase 3)

## Regras que o `content:check` confere

- `course.yaml`: `outcome` começa com "Você sai com: "; `cost: 0` (ferramenta paga vai em `paidTools`, com alternativa grátis); `modules` lista as pastas na ordem, com títulos com acento; `hosts` existem em `cast.yaml`.
- Aulas numeradas a partir de `01`, sem buracos; o nome sem o número vira a URL (`/cursos/{curso}/{aula}/`) e não se repete no curso; `projeto` é reservado.
- Toda aula tem `summary` de uma linha (até 140 caracteres), 1 a 3 perguntas no `quiz` (`answer` conta a partir de 0) e o roteiro ou a transcrição no corpo.
- `variants` (passo a passo por aparelho) só no módulo 0, com pelo menos duas plataformas: `android`, `ios`, `windows`, `mac`, `chromeos`.
- Vídeo de 2 a 5 minutos (`durationSec` de 120 a 300). Curso com `status: published` precisa de vídeo e legenda em todas as aulas.
- Só Markdown: HTML solto no texto é recusado (a CSP do site bloqueia estilos e scripts inline). Exemplos de HTML vão entre crases ou em bloco de código, e links automáticos como `<https://…>` são aceitos.
- Rubrica do projeto com pesos somando 100 e `passScore` de 0 a 100.

## Tom

Fale com "você", frases curtas, exemplos brasileiros (Pix, MEI, WhatsApp, comércio do bairro), jargão sempre explicado. Ferramentas grátis e no navegador primeiro. O guia de estilo completo chega na Fase 3 (`docs/conteudo/guia-de-estilo.md`).

## Rascunho e publicação

`status: draft` aparece só em dev e localmente (`SITE_DRAFTS=true`). Mude para `published` por PR quando o curso tiver vídeo e legenda em todas as aulas.
```

Rode `pnpm exec prettier --write content` e confira que o Prettier não mudou o sentido de nada (ele só ajusta espaços e aspas).

- [ ] **Step 2: Validar o conteúdo**

Run: `pnpm content:check`
Expected: `Conteúdo OK: 1 curso, 5 aulas.` (saída 0). Se aparecer algum problema, corrija o arquivo apontado e rode de novo.

- [ ] **Step 3: Rodar o `content:check` na CI**

Em `.github/workflows/ci.yml`, logo depois de `- run: pnpm lint`, acrescente:

```yaml
      - run: pnpm content:check
```

- [ ] **Step 4: Commit**

```bash
git add content .github/workflows/ci.yml
git commit -m "feat(content): curso piloto Crie seu site com IA em rascunho"
```

---

### Task 4: Identidade visual e casca do app

**Files:**
- Move: `apps/web/public/brand/favicon.svg` → `apps/web/public/favicon.svg` (substitui o atual)
- Modify: `apps/web/src/styles/global.css` (reescrito), `apps/web/src/layouts/Base.astro`, `apps/web/src/pages/index.astro`, `apps/web/src/pages/404.astro`, `apps/web/CLAUDE.md`
- Create: `apps/web/src/layouts/App.astro`, `apps/web/src/components/Header.astro`, `apps/web/src/components/BottomNav.astro`
- Create: `apps/web/src/pages/cursos/index.astro`, `apps/web/src/pages/eu.astro`
- Create: `docs/marca/identidade-visual.md`
- Create: `apps/web/e2e/support/axe.ts`, `apps/web/e2e/shell.spec.ts`; Modify: `apps/web/e2e/home.spec.ts`

**Interfaces:**
- Produces:
  - `App.astro` com props `{ title: string; description: string; tab?: 'inicio' | 'cursos' | 'eu'; noindex?: boolean }`; o conteúdo vai no `<main id="conteudo" class="page">`.
  - Classes globais para as próximas tasks: `.button`, `.button-block`, `.button-secondary`, `.card`, `.chips`, `.eyebrow`, `.lead`, `.prose`, `.empty`, `progress` estilizado, `mark`.
  - `expectNoA11yViolations(page: Page): Promise<void>` em `apps/web/e2e/support/axe.ts`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/web/e2e/support/axe.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}
```

`apps/web/e2e/shell.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe.ts';

const TABS = [
  { name: 'Início', path: '/' },
  { name: 'Cursos', path: '/cursos/' },
  { name: 'Eu', path: '/eu/' },
];

for (const tab of TABS) {
  test(`the ${tab.name} tab marks itself as the current page`, async ({ page }) => {
    await page.goto(tab.path);

    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link')).toHaveCount(3);
    await expect(nav.getByRole('link', { name: tab.name, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`${tab.path} has no accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(tab.path);
      await expectNoA11yViolations(page);
    });
  }
}

test('tabs and the brand link are big enough to tap', async ({ page }) => {
  await page.goto('/');
  const targets = [
    page.getByRole('link', { name: 'Escola Grátis de Tecnologia' }),
    ...TABS.map((tab) => page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: tab.name, exact: true })),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
});

test('the mark has light letters in dark mode', async ({ page }) => {
  const currentMark = () => page.locator('.brand-mark').evaluate((img: HTMLImageElement) => img.currentSrc);

  await page.goto('/');
  expect(await currentMark()).toMatch(/\/brand\/egt-mark\.svg$/);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  expect(await currentMark()).toMatch(/\/brand\/egt-mark-dark\.svg$/);
});

test('the title font is preloaded and served', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveAttribute(
    'href',
    '/fonts/bricolage-grotesque-800.woff2',
  );
  expect((await request.get('/fonts/bricolage-grotesque-800.woff2')).status()).toBe(200);
});
```

Em `apps/web/e2e/home.spec.ts`, troque o primeiro teste por este e **apague** o teste `home has no accessibility violations` (o `shell.spec.ts` cobre os dois temas):

```ts
test('home introduces the school in pt-BR', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Escola Grátis de Tecnologia');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Aprenda tecnologia de graça');
  await expect(page.getByRole('link', { name: 'Ver os cursos' })).toHaveAttribute('href', '/cursos/');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /grátis/i);
  await expect(page.locator('footer')).toContainText('Veja o código no GitHub.');
});
```

Remova também o import de `AxeBuilder` do `home.spec.ts`, que deixa de ser usado.

- [ ] **Step 2: Rodar e ver falhar**

Run: `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e`
Expected: FAIL — não há navegação "Principal", `/cursos/` e `/eu/` dão 404, não há `.brand-mark`.

- [ ] **Step 3: Implementar**

Substitua o favicon:

```bash
git mv -f apps/web/public/brand/favicon.svg apps/web/public/favicon.svg
```

`apps/web/src/styles/global.css` (arquivo inteiro):

```css
/* Self-hosted title font: Bricolage Grotesque 800, Latin subset, OFL (docs/marca/identidade-visual.md). */
@font-face {
  font-family: 'Bricolage Grotesque';
  src: url('/fonts/bricolage-grotesque-800.woff2') format('woff2');
  font-weight: 800;
  font-style: normal;
  /* A font that arrives late is skipped instead of swapped in, so titles never shift the layout. */
  font-display: optional;
}

/* Tokens: palette "Caderno" around the blue of the EGT mark. Use tokens only, never loose colors. */
:root {
  color-scheme: light dark;
  --color-bg: #ffffff;
  --color-surface: #eef2fb;
  --color-line: #d6ddef;
  --color-fg: #1a2129;
  --color-muted: #4b5576;
  --color-accent: #0052cc;
  --color-accent-fg: #ffffff;
  --color-highlight: #ffe14d;
  --color-highlight-fg: #1a2129;
  --color-success: #17663a;
  --color-danger: #b42318;
  --font-body: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-display: 'Bricolage Grotesque', var(--font-body);
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2.5rem;
  --radius: 0.75rem;
  --radius-small: 0.5rem;
  --tap: 3rem;
  --max-width: 40rem;
  --nav-height: 4rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0d1226;
    --color-surface: #182041;
    --color-line: #2a3460;
    --color-fg: #eef1fb;
    --color-muted: #aab3d6;
    --color-accent: #80b2ff;
    --color-accent-fg: #0d1226;
    --color-highlight: #ffd84a;
    --color-highlight-fg: #0d1226;
    --color-success: #7fdca3;
    --color-danger: #ff9b8f;
  }
}

/* Base */

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
  padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px));
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-body);
  font-size: 1.125rem;
  line-height: 1.6;
}

h1,
h2,
h3 {
  font-family: var(--font-display);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

h1 {
  margin: 0 0 var(--space-3);
  font-size: clamp(1.75rem, 7vw, 2.5rem);
}

h2 {
  margin: var(--space-5) 0 var(--space-3);
  font-size: 1.375rem;
}

h3 {
  margin: var(--space-4) 0 var(--space-2);
  font-size: 1.125rem;
}

p {
  margin: 0 0 var(--space-3);
}

a {
  color: var(--color-accent);
  text-underline-offset: 0.2em;
}

:focus-visible {
  outline: 3px solid var(--color-accent);
  outline-offset: 2px;
}

/* The highlighter covers the whole word and always carries dark text, in both themes. */
mark {
  padding: 0 0.15em;
  border-radius: 0.25em;
  background: var(--color-highlight);
  color: var(--color-highlight-fg);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

img,
svg {
  max-width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}

/* Layout */

.skip-link {
  position: absolute;
  top: -10rem;
  left: var(--space-3);
  z-index: 20;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-small);
  background: var(--color-accent);
  color: var(--color-accent-fg);
}

.skip-link:focus {
  top: var(--space-2);
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  padding-top: env(safe-area-inset-top, 0px);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-bg);
}

.topbar-inner {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-1) var(--space-3);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap);
  color: var(--color-fg);
  text-decoration: none;
}

.brand-mark {
  display: block;
  width: auto;
  height: 2rem;
}

.brand-name {
  display: flex;
  flex-direction: column;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.01em;
}

.brand-name-sub {
  color: var(--color-accent);
  font-size: 0.8125rem;
}

.page {
  flex: 1;
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-4) var(--space-3) var(--space-5);
}

.footer {
  padding: var(--space-4) var(--space-3);
  color: var(--color-muted);
  font-size: 0.875rem;
  text-align: center;
}

.tabs {
  position: fixed;
  inset: auto 0 0;
  z-index: 10;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  border-top: 1px solid var(--color-line);
  background: var(--color-bg);
}

.tabs ul {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0;
  list-style: none;
}

.tabs a {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  min-height: var(--nav-height);
  color: var(--color-muted);
  font-size: 0.8125rem;
  text-decoration: none;
}

.tabs a[aria-current='page'] {
  color: var(--color-accent);
  font-weight: 700;
}

.tabs svg {
  width: 1.5rem;
  height: 1.5rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Shared components */

.eyebrow {
  margin: 0 0 var(--space-2);
  color: var(--color-muted);
  font-size: 0.9375rem;
}

.lead {
  color: var(--color-muted);
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--tap);
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--radius);
  background: var(--color-accent);
  color: var(--color-accent-fg);
  font: inherit;
  font-weight: 700;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

.button-block {
  display: flex;
  width: 100%;
}

.button-secondary {
  border: 2px solid var(--color-accent);
  background: var(--color-bg);
  color: var(--color-accent);
}

.button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.card {
  padding: var(--space-4);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.chips li {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: 999px;
  color: var(--color-muted);
  font-size: 0.875rem;
}

.points {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-5) 0 0;
  padding: 0;
  list-style: none;
}

.points li {
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.empty {
  padding: var(--space-4);
  border: 2px dashed var(--color-line);
  border-radius: var(--radius);
  color: var(--color-muted);
}

.prose ul,
.prose ol {
  padding-left: 1.25em;
}

.prose li + li {
  margin-top: var(--space-1);
}

.prose blockquote {
  margin: 0 0 var(--space-3);
  padding: var(--space-3);
  border-left: 4px solid var(--color-accent);
  border-radius: var(--radius-small);
  background: var(--color-surface);
}

.prose code {
  padding: 0 0.25em;
  border-radius: 0.25em;
  background: var(--color-surface);
}

progress {
  display: block;
  width: 100%;
  height: 0.5rem;
  border: 0;
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-accent);
  appearance: none;
  overflow: hidden;
}

progress::-webkit-progress-bar {
  border-radius: 999px;
  background: var(--color-surface);
}

progress::-webkit-progress-value {
  border-radius: 999px;
  background: var(--color-accent);
}

progress::-moz-progress-bar {
  border-radius: 999px;
  background: var(--color-accent);
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
  /** Keeps the page out of search engines in every environment (e.g. the 404 page). */
  noindex?: boolean;
}

const { title, description, noindex = false } = Astro.props;
const canonical = new URL(Astro.url.pathname, Astro.site);
const indexable = SITE_ENV === 'prod' && !noindex;
---

<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{title}</title>
    <meta name="description" content={description} />
    {!noindex && <link rel="canonical" href={canonical} />}
    {!indexable && <meta name="robots" content="noindex, nofollow" />}
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0d1226" media="(prefers-color-scheme: dark)" />
    <link
      rel="preload"
      href="/fonts/bricolage-grotesque-800.woff2"
      as="font"
      type="font/woff2"
      crossorigin
    />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:site_name" content="Escola Grátis de Tecnologia" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    {!noindex && <meta property="og:url" content={canonical} />}
  </head>
  <body>
    <slot />
  </body>
</html>
```

`apps/web/src/components/Header.astro`:

```astro
---
// Top bar with the EGT mark; the <picture> swaps to the light-letter mark in dark mode.
---

<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/">
      <picture>
        <source srcset="/brand/egt-mark-dark.svg" media="(prefers-color-scheme: dark)" />
        <img class="brand-mark" src="/brand/egt-mark.svg" alt="" width="63" height="32" />
      </picture>
      <span class="brand-name">Escola Grátis <span class="brand-name-sub">de Tecnologia</span></span>
    </a>
  </div>
</header>
```

`apps/web/src/components/BottomNav.astro`:

```astro
---
interface Props {
  current?: 'inicio' | 'cursos' | 'eu' | undefined;
}

const { current } = Astro.props;
---

<nav class="tabs" aria-label="Principal">
  <ul>
    <li>
      <a href="/" aria-current={current === 'inicio' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 11 12 4l9 7"></path>
          <path d="M5 10v10h5v-6h4v6h5V10"></path>
        </svg>
        <span>Início</span>
      </a>
    </li>
    <li>
      <a href="/cursos/" aria-current={current === 'cursos' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"></path>
          <path d="M5 17a3 3 0 0 1 3-3h11"></path>
        </svg>
        <span>Cursos</span>
      </a>
    </li>
    <li>
      <a href="/eu/" aria-current={current === 'eu' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M4 21a8 8 0 0 1 16 0"></path>
        </svg>
        <span>Eu</span>
      </a>
    </li>
  </ul>
</nav>
```

`apps/web/src/layouts/App.astro`:

```astro
---
import BottomNav from '../components/BottomNav.astro';
import Header from '../components/Header.astro';
import Base from './Base.astro';

interface Props {
  title: string;
  description: string;
  tab?: 'inicio' | 'cursos' | 'eu';
  noindex?: boolean;
}

const { tab, ...base } = Astro.props;
const repositoryUrl = 'https://github.com/escolagratisdetecnologia/escolagratisdetecnologia';
---

<Base {...base}>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
  <Header />
  <main class="page" id="conteudo">
    <slot />
  </main>
  <footer class="footer">
    <p>
      Projeto beneficente e de código aberto.
      <a href={repositoryUrl}>Veja o código no GitHub</a>.
    </p>
  </footer>
  <BottomNav current={tab} />
</Base>
```

`apps/web/src/pages/index.astro`:

```astro
---
import App from '../layouts/App.astro';
---

<App
  title="Escola Grátis de Tecnologia"
  description="Microcursos grátis de tecnologia, feitos pro celular, com certificado verificável. Aprenda e saia resolvendo um problema de verdade."
  tab="inicio"
>
  <p class="eyebrow">100% grátis · feito para o celular</p>
  <h1>Aprenda tecnologia de graça e saia resolvendo um problema de <mark>verdade</mark>.</h1>
  <p class="lead">
    Microcursos com aulas de 2 a 5 minutos e um projeto real no final, com certificado que qualquer
    pessoa consegue conferir.
  </p>
  <a class="button" href="/cursos/">Ver os cursos</a>
  <ul class="points">
    <li><strong>100% grátis</strong>, sempre. Sem pegadinha.</li>
    <li><strong>Mão na massa</strong>: todo curso termina num projeto real.</li>
    <li><strong>Certificado verificável</strong> pra mostrar no LinkedIn.</li>
  </ul>
</App>
```

`apps/web/src/pages/cursos/index.astro` (a lista de cursos chega na Task 5):

```astro
---
import App from '../../layouts/App.astro';
---

<App
  title="Cursos · Escola Grátis de Tecnologia"
  description="Microcursos grátis de tecnologia, com aulas curtinhas e um projeto real no final."
  tab="cursos"
>
  <h1>Cursos</h1>
  <p class="lead">Escolha um curso e comece agora. Não precisa criar conta para assistir.</p>
  <p class="empty">Os primeiros cursos estão chegando. Volte em breve!</p>
</App>
```

`apps/web/src/pages/eu.astro` (o progresso chega na Task 8):

```astro
---
import App from '../layouts/App.astro';
---

<App
  title="Eu · Escola Grátis de Tecnologia"
  description="Seu progresso nos cursos da Escola Grátis de Tecnologia."
  tab="eu"
>
  <h1>Eu</h1>
  <p class="lead">Seu progresso nos cursos fica salvo neste aparelho e aparece aqui.</p>
  <section class="card" aria-labelledby="conta-titulo">
    <h2 id="conta-titulo">Sua conta</h2>
    <p>
      Por enquanto, seu progresso fica salvo só neste aparelho. Em breve, você vai poder entrar com
      sua conta e levar o progresso para qualquer aparelho.
    </p>
  </section>
</App>
```

Em `apps/web/src/pages/404.astro`, troque `Base` por `App` (import `../layouts/App.astro`), mantenha `noindex` e remova o `<main class="page">` de dentro (o `App` já cria o `main`):

```astro
---
import App from '../layouts/App.astro';
---

<App
  title="Página não encontrada · Escola Grátis de Tecnologia"
  description="Essa página não existe. Volte para o início da Escola Grátis de Tecnologia."
  noindex
>
  <h1>Página não encontrada</h1>
  <p class="lead">O link pode estar quebrado ou a página mudou de lugar.</p>
  <p>
    <a href="/">Voltar para o início</a>
  </p>
</App>
```

`docs/marca/identidade-visual.md`:

````md
# Identidade visual

Escolhida pelo mantenedor em 2026-10-09: proposta "Caderno" (azul de caneta e marca-texto amarelo) com o logo EGT que a Escola já usa nas redes sociais.

## Logo

- Monograma EGT com o capelo: `apps/web/public/brand/egt-mark.svg` (letras grafite `#1a2129`, azul `#0066ff`) e `egt-mark-dark.svg` (letras `#eef1fb`) para o tema escuro. O site troca os dois com `<picture>` e `prefers-color-scheme`.
- Vetorizados a partir da arte original (PNG de 1254 px) com o vtracer e otimizados com o svgo (3,7 KB cada). Não recolora fora dessas duas versões.
- Altura mínima: 16 px. No cabeçalho, 32 px, ao lado de "Escola Grátis de Tecnologia" na fonte de títulos.
- Ícones do app e favicon: o monograma sobre fundo branco (`apps/web/public/icons/` e `apps/web/public/favicon.svg`), para aparecerem em telas e abas escuras. O ícone `maskable` deixa o monograma dentro da área segura central (66% da largura).

## Cores

Tokens em `apps/web/src/styles/global.css`. Todos os pares de texto passam no nível AA da WCAG 2.2 (5,8:1 ou mais).

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--color-bg` | `#ffffff` | `#0d1226` | fundo |
| `--color-surface` | `#eef2fb` | `#182041` | cartões, trilho das barras |
| `--color-line` | `#d6ddef` | `#2a3460` | bordas decorativas |
| `--color-fg` | `#1a2129` | `#eef1fb` | texto (grafite do logo) |
| `--color-muted` | `#4b5576` | `#aab3d6` | texto secundário |
| `--color-accent` | `#0052cc` | `#80b2ff` | links, botões, barras (mesmo tom do azul do logo) |
| `--color-accent-fg` | `#ffffff` | `#0d1226` | texto sobre o azul |
| `--color-highlight` | `#ffe14d` | `#ffd84a` | marca-texto |
| `--color-highlight-fg` | `#1a2129` | `#0d1226` | texto sobre o marca-texto |
| `--color-success` | `#17663a` | `#7fdca3` | resposta certa |
| `--color-danger` | `#b42318` | `#ff9b8f` | resposta errada, ação destrutiva |

**Marca-texto:** cobre a altura inteira da palavra e o texto sobre ele é sempre escuro, nos dois temas. Nunca use o amarelo como cor de texto, barra ou ícone: sobre o fundo claro ele não tem contraste.

## Tipografia

- Títulos e wordmark: Bricolage Grotesque, peso 800, licença OFL (`apps/web/public/fonts/OFL-bricolage-grotesque.txt`). Arquivo `bricolage-grotesque-800.woff2` com 17,6 KB: instância `wght=800, wdth=100, opsz=32` e subconjunto latino com todos os acentos do português, gerados assim:

      fonttools varLib.instancer "BricolageGrotesque[opsz,wdth,wght].ttf" wght=800 wdth=100 opsz=32 -o bricolage-800.ttf
      pyftsubset bricolage-800.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+0152-0153,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+20AC" --layout-features="kern,liga,calt" --flavor=woff2 --no-hinting --desubroutinize --output-file=bricolage-grotesque-800.woff2

- Texto corrido: fonte do sistema (zero download).
- `font-display: optional`: se a fonte demorar na primeira visita, os títulos ficam na fonte do sistema e nada pula na tela.

## Ícones do app

Gerados do `egt-mark.svg` com o sharp (dependência do Astro): fundo branco, monograma centralizado com 80% da largura (`icon-192.png`, `icon-512.png`), 66% no `icon-maskable-512.png` e 78% no `apple-touch-icon.png` (180 px).
````

Em `apps/web/CLAUDE.md`, troque o item **Design tokens** por:

```md
- **Design tokens e marca:** cores, espaços e raios em `src/styles/global.css` (claro e escuro); não use cores soltas. Marca, paleta e fonte em `docs/marca/identidade-visual.md`. O marca-texto (`<mark>`) cobre a palavra inteira e o texto sobre ele é sempre escuro; o amarelo nunca vira cor de texto, barra ou ícone.
- **Layout:** páginas usam `src/layouts/App.astro` (cabeçalho com a marca, `main#conteudo`, rodapé e abas Início/Cursos/Eu, com `tab` marcando a aba atual).
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm lint && pnpm typecheck && SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e`
Expected: PASS nos dois projetos (android e iphone).

- [ ] **Step 5: Commit**

```bash
git add apps/web docs/marca
git commit -m "feat(web): identidade visual Caderno com o logo EGT e abas Início, Cursos e Eu"
```

---

### Task 5: Catálogo, curso, aula e projeto (páginas estáticas)

**Files:**
- Modify: `apps/web/package.json`, `apps/web/astro.config.mjs`, `turbo.json`, `tools/deploy-site.sh`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `vitest.config.ts` (raiz), `apps/web/src/styles/global.css`, `apps/web/src/pages/index.astro`, `apps/web/src/pages/cursos/index.astro`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/lib/catalog.ts`, `visibility.ts`, `urls.ts`, `course-text.ts`, `markdown.ts`
- Create: `apps/web/src/components/CourseCard.astro`, `CourseChips.astro`, `NeedsCard.astro`
- Create: `apps/web/src/pages/cursos/[curso]/index.astro`, `[aula].astro`, `projeto.astro`
- Test: `apps/web/src/lib/visibility.test.ts`, `urls.test.ts`, `course-text.test.ts`; `apps/web/e2e/support/catalog.ts`, `apps/web/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: `loadCatalog`, tipos e rótulos de `@egt/content`; `CourseOutline` de `@egt/core`.
- Produces:
  - `getCourses(): Promise<Course[]>` (`src/lib/catalog.ts`, só no build; falha o build se o conteúdo tiver problemas).
  - `visibleCourses(courses: Course[], showDrafts: boolean): Course[]`.
  - `courseUrl(course)`, `lessonUrl(course, lesson)`, `projectUrl(course)`, `lessonsOf(course): Lesson[]`, `outlineOf(course): CourseOutline` (`src/lib/urls.ts`, sem dependência do Astro; o e2e importa).
  - `listText(items)`, `devicesText(devices)`, `requirementsText(requirements)`, `outcomeResult(outcome)`, `capitalize(text)` (`src/lib/course-text.ts`).
  - `renderMarkdown(source): string`.
  - Marcação da página da aula usada pelas Tasks 6 e 7: `<article class="lesson" data-course={slug} data-lesson={slug}>`, `<section class="variants" data-variants>` com `<section class="variant" data-platform={p}>`, o link `<a class="button button-block" data-complete href=...>`.
  - `pilotCourse(): Promise<Course>` em `apps/web/e2e/support/catalog.ts`.
  - Variável de build `SITE_DRAFTS` (boolean, padrão `false`).

- [ ] **Step 1: Dependências, variável e projeto de testes do site**

```bash
pnpm --filter @egt/web add @egt/content@workspace:* @egt/core@workspace:* marked@^18.1.0
```

`apps/web/astro.config.mjs`: dentro de `env.schema`, ao lado de `SITE_ENV`, acrescente:

```js
      SITE_DRAFTS: envField.boolean({ context: 'server', access: 'public', default: false }),
```

`turbo.json`: em `tasks.build.env`, use `["SITE_URL", "SITE_ENV", "SITE_DRAFTS"]`.

`apps/web/vitest.config.ts`:

```ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'web', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] },
});
```

E `'apps/web'` entra na lista `projects` do `vitest.config.ts` da raiz, antes de `'apps/api'`.

- [ ] **Step 2: Escrever os testes unitários que falham**

`apps/web/src/lib/visibility.test.ts`:

```ts
import type { Course } from '@egt/content';
import { describe, expect, it } from 'vitest';
import { visibleCourses } from './visibility.ts';

const course = (slug: string, status: 'draft' | 'published') => ({ slug, meta: { status } }) as unknown as Course;

describe('visibleCourses', () => {
  const courses = [course('publicado', 'published'), course('rascunho', 'draft')];

  it('hides drafts in production builds', () => {
    expect(visibleCourses(courses, false).map((c) => c.slug)).toEqual(['publicado']);
  });

  it('shows drafts when SITE_DRAFTS is on', () => {
    expect(visibleCourses(courses, true).map((c) => c.slug)).toEqual(['publicado', 'rascunho']);
  });
});
```

`apps/web/src/lib/urls.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { loadCatalog, type Course } from '@egt/content';
import { beforeAll, describe, expect, it } from 'vitest';
import { courseUrl, lessonUrl, lessonsOf, outlineOf, projectUrl } from './urls.ts';

const FIXTURE = fileURLToPath(new URL('../../../../packages/content/test/fixtures/valid/', import.meta.url));

describe('urls', () => {
  let course: Course;

  beforeAll(async () => {
    const { catalog } = await loadCatalog(FIXTURE);
    course = catalog.courses[0]!;
  });

  it('builds clean URLs from slugs', () => {
    expect(courseUrl(course)).toBe('/cursos/curso-teste/');
    expect(lessonUrl(course, lessonsOf(course)[0]!)).toBe('/cursos/curso-teste/boas-vindas/');
    expect(projectUrl(course)).toBe('/cursos/curso-teste/projeto/');
  });

  it('describes the course for the browser', () => {
    expect(outlineOf(course)).toEqual({
      slug: 'curso-teste',
      title: 'Curso de teste',
      url: '/cursos/curso-teste/',
      modules: [
        {
          title: 'Prepare seu ambiente',
          lessons: [
            { slug: 'boas-vindas', title: 'Boas-vindas', url: '/cursos/curso-teste/boas-vindas/' },
            { slug: 'no-seu-aparelho', title: 'No seu aparelho', url: '/cursos/curso-teste/no-seu-aparelho/' },
          ],
        },
        {
          title: 'Mão na massa',
          lessons: [{ slug: 'primeiro-passo', title: 'Primeiro passo', url: '/cursos/curso-teste/primeiro-passo/' }],
        },
      ],
      projectTitle: 'Seu primeiro teste',
      projectUrl: '/cursos/curso-teste/projeto/',
    });
  });
});
```

`apps/web/src/lib/course-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { capitalize, devicesText, listText, outcomeResult, requirementsText } from './course-text.ts';

describe('course text', () => {
  it('joins lists the Brazilian way', () => {
    expect(listText([])).toBe('');
    expect(listText(['a'])).toBe('a');
    expect(listText(['a', 'b'])).toBe('a e b');
    expect(listText(['a', 'b', 'c'])).toBe('a, b e c');
  });

  it('describes devices and free accounts', () => {
    expect(devicesText(['celular', 'computador'])).toBe('celular ou computador');
    expect(requirementsText(['github', 'claude'])).toBe('conta no GitHub e conta no Claude.ai');
  });

  it('extracts the result from the outcome and capitalizes', () => {
    expect(outcomeResult('Você sai com: um site no ar')).toBe('um site no ar');
    expect(capitalize('celular ou computador')).toBe('Celular ou computador');
  });
});
```

Run: `pnpm vitest run --project web`
Expected: FAIL — os módulos de `src/lib/` ainda não existem.

- [ ] **Step 3: Implementar as bibliotecas**

`apps/web/src/lib/visibility.ts`:

```ts
import type { Course } from '@egt/content';

/** Published courses always; drafts only in builds that show them (local, dev and CI). */
export function visibleCourses(courses: Course[], showDrafts: boolean): Course[] {
  return courses.filter((course) => course.meta.status === 'published' || showDrafts);
}
```

`apps/web/src/lib/urls.ts`:

```ts
import type { Course, Lesson } from '@egt/content';
import type { CourseOutline } from '@egt/core';

export const courseUrl = (course: Course): string => `/cursos/${course.slug}/`;
export const lessonUrl = (course: Course, lesson: Lesson): string => `/cursos/${course.slug}/${lesson.slug}/`;
export const projectUrl = (course: Course): string => `/cursos/${course.slug}/projeto/`;
export const lessonsOf = (course: Course): Lesson[] => course.modules.flatMap((module) => module.lessons);

/** The course as the browser needs it: titles and URLs, nothing else. */
export function outlineOf(course: Course): CourseOutline {
  return {
    slug: course.slug,
    title: course.meta.title,
    url: courseUrl(course),
    modules: course.modules.map((module) => ({
      title: module.title,
      lessons: module.lessons.map((lesson) => ({
        slug: lesson.slug,
        title: lesson.frontmatter.title,
        url: lessonUrl(course, lesson),
      })),
    })),
    projectTitle: course.project.frontmatter.title,
    projectUrl: projectUrl(course),
  };
}
```

`apps/web/src/lib/course-text.ts`:

```ts
import { REQUIREMENT_LABELS, type Device, type Requirement } from '@egt/content';

/** "a", "a e b", "a, b e c". */
export function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

export const devicesText = (devices: Device[]): string => devices.join(' ou ');
export const requirementsText = (requirements: Requirement[]): string =>
  listText(requirements.map((requirement) => REQUIREMENT_LABELS[requirement]));
export const outcomeResult = (outcome: string): string => outcome.replace(/^Você sai com: /, '');
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
```

`apps/web/src/lib/markdown.ts`:

```ts
import { marked } from 'marked';

/** Renders course Markdown; content:check rejects raw HTML, so the output carries no inline code. */
export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false, gfm: true }) as string;
}
```

`apps/web/src/lib/catalog.ts`:

```ts
import path from 'node:path';
import { loadCatalog, type Course } from '@egt/content';
import { SITE_DRAFTS } from 'astro:env/server';
import { visibleCourses } from './visibility.ts';

// Astro builds run from apps/web; content/ sits at the repository root.
const CONTENT_DIR = path.resolve(process.cwd(), '../../content');

let courses: Promise<Course[]> | undefined;

/** Courses of this build. Fails the build when the content has problems (same rules as content:check). */
export function getCourses(): Promise<Course[]> {
  courses ??= loadCatalog(CONTENT_DIR).then(({ catalog, problems }) => {
    if (problems.length > 0) {
      const details = problems.map((problem) => `${problem.file}: ${problem.message}`).join('\n');
      throw new Error(`Content has ${problems.length} problem(s); run "pnpm content:check".\n${details}`);
    }
    return visibleCourses(catalog.courses, SITE_DRAFTS);
  });
  return courses;
}
```

Run: `pnpm vitest run --project web`
Expected: PASS.

- [ ] **Step 4: Escrever o e2e que falha**

`apps/web/e2e/support/catalog.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { loadCatalog, type Course } from '@egt/content';

const CONTENT_DIR = fileURLToPath(new URL('../../../../content/', import.meta.url));

/** The pilot course read from content/, so tests follow the content instead of copying it. */
export async function pilotCourse(): Promise<Course> {
  const { catalog, problems } = await loadCatalog(CONTENT_DIR);
  if (problems.length > 0) throw new Error('content/ has problems; run pnpm content:check');
  const course = catalog.courses.find((candidate) => candidate.slug === 'crie-seu-site-com-ia');
  if (!course) throw new Error('pilot course not found in content/');
  return course;
}
```

`apps/web/e2e/catalog.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { courseUrl, lessonUrl, lessonsOf, projectUrl } from '../src/lib/urls.ts';
import { expectNoA11yViolations } from './support/axe.ts';
import { pilotCourse } from './support/catalog.ts';

const result = (outcome: string) => outcome.replace(/^Você sai com: /, '');

test('the catalog lists the pilot course with its outcome', async ({ page }) => {
  const course = await pilotCourse();
  await page.goto('/cursos/');

  const card = page.getByRole('article').filter({ hasText: course.meta.title });
  await expect(card.getByRole('link', { name: course.meta.title })).toHaveAttribute('href', courseUrl(course));
  await expect(card.locator('mark')).toHaveText(result(course.meta.outcome));
  await expect(card.getByText('R$ 0')).toBeVisible();
});

test('the home page invites to the pilot course', async ({ page }) => {
  const course = await pilotCourse();
  await page.goto('/');
  await expect(page.getByRole('link', { name: course.meta.title })).toHaveAttribute('href', courseUrl(course));
});

test('the course page shows the outcome, what you need and every lesson', async ({ page }) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);
  await page.goto(courseUrl(course));

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(course.meta.title);
  await expect(page.locator('.outcome mark')).toHaveText(result(course.meta.outcome));
  await expect(page.getByRole('heading', { name: 'O que você precisa' })).toBeVisible();
  for (const module of course.modules) {
    await expect(page.getByRole('heading', { name: module.title })).toBeVisible();
  }
  for (const lesson of lessons) {
    await expect(page.getByRole('link', { name: lesson.frontmatter.title, exact: true })).toHaveAttribute(
      'href',
      lessonUrl(course, lesson),
    );
  }
  await expect(page.getByRole('link', { name: 'Bora começar' })).toHaveAttribute('href', lessonUrl(course, lessons[0]!));
  await expect(page.getByRole('link', { name: `Projeto final: ${course.project.frontmatter.title}` })).toHaveAttribute(
    'href',
    projectUrl(course),
  );
});

test('each lesson leads to the next one and the last one to the project', async ({ page }) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);

  for (const [index, lesson] of lessons.entries()) {
    await page.goto(lessonUrl(course, lesson));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.frontmatter.title);
    await expect(page.getByText(`Aula ${index + 1} de ${lessons.length}`)).toBeVisible();
    const next = lessons[index + 1];
    const action = page.getByRole('link', { name: next ? 'Concluir e continuar' : 'Concluir e ver o projeto' });
    await expect(action).toHaveAttribute('href', next ? lessonUrl(course, next) : projectUrl(course));
  }
});

test('a lesson without video keeps the transcript open', async ({ page }) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course)[0]!;
  await page.goto(lessonUrl(course, lesson));

  await expect(page.getByText('O vídeo desta aula está em produção.')).toBeVisible();
  await expect(page.locator('details.transcript')).toHaveAttribute('open', '');
});

test('the project page explains what to deliver and how it is graded', async ({ page }) => {
  const course = await pilotCourse();
  const { frontmatter } = course.project;
  await page.goto(projectUrl(course));

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Projeto final: ${frontmatter.title}`);
  await expect(page.locator('.criteria li')).toHaveCount(frontmatter.criteria.length);
  await expect(page.getByText(`Para passar: ${frontmatter.passScore} de 100 pontos`)).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`course, lesson and project pages are accessible (${scheme})`, async ({ page }) => {
    const course = await pilotCourse();
    await page.emulateMedia({ colorScheme: scheme });
    for (const url of [courseUrl(course), lessonUrl(course, lessonsOf(course)[1]!), projectUrl(course)]) {
      await page.goto(url);
      await expectNoA11yViolations(page);
    }
  });
}
```

Run: `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e catalog`
Expected: FAIL — as páginas de curso, aula e projeto ainda não existem.

- [ ] **Step 5: Implementar componentes e páginas**

`apps/web/src/components/CourseChips.astro`:

```astro
---
import type { Course } from '@egt/content';
import { devicesText } from '../lib/course-text.ts';

interface Props {
  course: Course;
}

const { meta } = Astro.props.course;
---

<ul class="chips" aria-label="Sobre o curso">
  <li>{meta.durationMin} min</li>
  <li>{devicesText(meta.devices)}</li>
  <li>R$ 0</li>
</ul>
```

`apps/web/src/components/CourseCard.astro`:

```astro
---
import type { Course } from '@egt/content';
import { outcomeResult } from '../lib/course-text.ts';
import { courseUrl } from '../lib/urls.ts';
import CourseChips from './CourseChips.astro';

interface Props {
  course: Course;
  headingLevel?: 2 | 3;
}

const { course, headingLevel = 2 } = Astro.props;
const Heading = `h${headingLevel}`;
---

<article class="course-card">
  <Heading class="course-card-title"><a href={courseUrl(course)}>{course.meta.title}</a></Heading>
  <p class="outcome">Você sai com: <mark>{outcomeResult(course.meta.outcome)}</mark></p>
  <CourseChips course={course} />
</article>
```

`apps/web/src/components/NeedsCard.astro`:

```astro
---
import type { Course } from '@egt/content';
import { capitalize, devicesText, requirementsText } from '../lib/course-text.ts';

interface Props {
  course: Course;
}

const { course } = Astro.props;
const { devices, requirements, paidTools } = course.meta;
const titleId = `precisa-${course.slug}`;
---

<section class="card needs" aria-labelledby={titleId}>
  <h2 id={titleId}>O que você precisa</h2>
  <dl>
    <div>
      <dt>Aparelho</dt>
      <dd>{capitalize(devicesText(devices))}</dd>
    </div>
    <div>
      <dt>Contas grátis</dt>
      <dd>{requirements.length > 0 ? capitalize(requirementsText(requirements)) : 'Nenhuma'}</dd>
    </div>
    <div>
      <dt>Custo</dt>
      <dd>
        R$ 0
        {paidTools.map((tool) => <span> · {tool.name} é pago; use {tool.freeAlternative} no lugar.</span>)}
      </dd>
    </div>
    <div>
      <dt>Internet</dt>
      <dd>Para ver as aulas e usar as ferramentas online</dd>
    </div>
  </dl>
</section>
```

`apps/web/src/pages/cursos/index.astro`:

```astro
---
import CourseCard from '../../components/CourseCard.astro';
import App from '../../layouts/App.astro';
import { getCourses } from '../../lib/catalog.ts';

const courses = await getCourses();
---

<App
  title="Cursos · Escola Grátis de Tecnologia"
  description="Microcursos grátis de tecnologia, com aulas curtinhas e um projeto real no final."
  tab="cursos"
>
  <h1>Cursos</h1>
  <p class="lead">Escolha um curso e comece agora. Não precisa criar conta para assistir.</p>
  {
    courses.length > 0 ? (
      <div class="course-list">
        {courses.map((course) => (
          <CourseCard course={course} />
        ))}
      </div>
    ) : (
      <p class="empty">Os primeiros cursos estão chegando. Volte em breve!</p>
    )
  }
</App>
```

`apps/web/src/pages/index.astro`:

```astro
---
import CourseCard from '../components/CourseCard.astro';
import App from '../layouts/App.astro';
import { getCourses } from '../lib/catalog.ts';

const courses = await getCourses();
---

<App
  title="Escola Grátis de Tecnologia"
  description="Microcursos grátis de tecnologia, feitos pro celular, com certificado verificável. Aprenda e saia resolvendo um problema de verdade."
  tab="inicio"
>
  <p class="eyebrow">100% grátis · feito para o celular</p>
  <h1>Aprenda tecnologia de graça e saia resolvendo um problema de <mark>verdade</mark>.</h1>
  <p class="lead">
    Microcursos com aulas de 2 a 5 minutos e um projeto real no final, com certificado que qualquer
    pessoa consegue conferir.
  </p>
  <a class="button" href="/cursos/">Ver os cursos</a>
  <section aria-labelledby="comece-titulo">
    <h2 id="comece-titulo">Comece por aqui</h2>
    {
      courses.length > 0 ? (
        <div class="course-list">
          {courses.map((course) => (
            <CourseCard course={course} headingLevel={3} />
          ))}
        </div>
      ) : (
        <p class="empty">Os primeiros cursos estão chegando. Volte em breve!</p>
      )
    }
  </section>
  <ul class="points">
    <li><strong>100% grátis</strong>, sempre. Sem pegadinha.</li>
    <li><strong>Mão na massa</strong>: todo curso termina num projeto real.</li>
    <li><strong>Certificado verificável</strong> pra mostrar no LinkedIn.</li>
  </ul>
</App>
```

`apps/web/src/pages/cursos/[curso]/index.astro`:

```astro
---
import { LEVEL_LABELS } from '@egt/content';
import type { InferGetStaticPropsType } from 'astro';
import CourseChips from '../../../components/CourseChips.astro';
import NeedsCard from '../../../components/NeedsCard.astro';
import App from '../../../layouts/App.astro';
import { getCourses } from '../../../lib/catalog.ts';
import { outcomeResult } from '../../../lib/course-text.ts';
import { lessonUrl, lessonsOf, projectUrl } from '../../../lib/urls.ts';

export async function getStaticPaths() {
  const courses = await getCourses();
  return courses.map((course) => ({ params: { curso: course.slug }, props: { course } }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

const { course } = Astro.props;
const first = lessonsOf(course)[0];
---

<App
  title={`${course.meta.title} · Escola Grátis de Tecnologia`}
  description={course.meta.outcome}
  tab="cursos"
>
  <p class="eyebrow">Curso grátis · {LEVEL_LABELS[course.meta.level]}</p>
  <h1>{course.meta.title}</h1>
  <p class="outcome">Você sai com: <mark>{outcomeResult(course.meta.outcome)}</mark></p>
  <CourseChips course={course} />
  <NeedsCard course={course} />
  <div class="course-progress">
    {first && <a class="button button-block" href={lessonUrl(course, first)}>Bora começar</a>}
    <h2 id="conteudo-do-curso">O que tem no curso</h2>
    <ol class="modules">
      {
        course.modules.map((module) => (
          <li>
            <h3>{module.title}</h3>
            <ol class="lessons">
              {module.lessons.map((lesson) => (
                <li class="lesson-item">
                  <a href={lessonUrl(course, lesson)}>{lesson.frontmatter.title}</a>
                </li>
              ))}
            </ol>
          </li>
        ))
      }
    </ol>
    <p class="project-link">
      <a href={projectUrl(course)}>Projeto final: {course.project.frontmatter.title}</a>
    </p>
  </div>
</App>
```

`apps/web/src/pages/cursos/[curso]/[aula].astro`:

```astro
---
import { PLATFORMS, PLATFORM_LABELS } from '@egt/content';
import type { InferGetStaticPropsType } from 'astro';
import App from '../../../layouts/App.astro';
import { getCourses } from '../../../lib/catalog.ts';
import { renderMarkdown } from '../../../lib/markdown.ts';
import { courseUrl, lessonUrl, lessonsOf, projectUrl } from '../../../lib/urls.ts';

export async function getStaticPaths() {
  const courses = await getCourses();
  return courses.flatMap((course) => {
    const lessons = lessonsOf(course);
    return lessons.map((lesson, index) => ({
      params: { curso: course.slug, aula: lesson.slug },
      props: { course, lesson, index, total: lessons.length, next: lessons[index + 1] },
    }));
  });
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

const { course, lesson, index, total, next } = Astro.props;
const { title, summary, variants, checkpoint, video } = lesson.frontmatter;
const variantEntries = PLATFORMS.flatMap((platform) => {
  const variant = variants?.[platform];
  return variant ? [{ platform, label: PLATFORM_LABELS[platform], html: renderMarkdown(variant.steps) }] : [];
});
---

<App title={`${title} · ${course.meta.title}`} description={summary} tab="cursos">
  <article class="lesson" data-course={course.slug} data-lesson={lesson.slug}>
    <p class="back"><a href={courseUrl(course)}>{course.meta.title}</a></p>
    <div class="video-slot">
      <p>O vídeo desta aula está em produção. Por enquanto, leia a transcrição logo abaixo.</p>
    </div>
    <h1>{title}</h1>
    <p class="position">Aula {index + 1} de {total}</p>
    <progress aria-label="Posição no curso" max={total} value={index + 1}></progress>
    <p class="lead summary">{summary}</p>
    {
      variantEntries.length > 0 && (
        <section class="variants" data-variants aria-labelledby="aparelho-titulo">
          <h2 id="aparelho-titulo">No seu aparelho</h2>
          {variantEntries.map((variant) => (
            <section class="variant" data-platform={variant.platform} aria-label={variant.label}>
              <h3>{variant.label}</h3>
              <div class="prose" set:html={variant.html} />
            </section>
          ))}
        </section>
      )
    }
    {
      checkpoint && (
        <section class="checkpoint" aria-labelledby="mao-na-massa-titulo">
          <h2 id="mao-na-massa-titulo">Mão na massa</h2>
          <ul class="checklist">
            {checkpoint.map((item) => (
              <li>{item}</li>
            ))}
          </ul>
        </section>
      )
    }
    <details class="box transcript" open={!video}>
      <summary>Transcrição</summary>
      <div class="prose" set:html={renderMarkdown(lesson.body)} />
    </details>
    <div class="lesson-actions">
      <a
        class="button button-block"
        data-complete
        href={next ? lessonUrl(course, next) : projectUrl(course)}
      >
        {next ? 'Concluir e continuar' : 'Concluir e ver o projeto'}
      </a>
    </div>
  </article>
</App>
```

`apps/web/src/pages/cursos/[curso]/projeto.astro`:

```astro
---
import { DELIVERABLE_LABELS } from '@egt/content';
import type { InferGetStaticPropsType } from 'astro';
import App from '../../../layouts/App.astro';
import { getCourses } from '../../../lib/catalog.ts';
import { renderMarkdown } from '../../../lib/markdown.ts';
import { courseUrl } from '../../../lib/urls.ts';

export async function getStaticPaths() {
  const courses = await getCourses();
  return courses.map((course) => ({ params: { curso: course.slug }, props: { course } }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

const { course } = Astro.props;
const { frontmatter, body } = course.project;
---

<App
  title={`Projeto final · ${course.meta.title}`}
  description={`Projeto final do curso ${course.meta.title}: ${frontmatter.title}.`}
  tab="cursos"
>
  <p class="back"><a href={courseUrl(course)}>{course.meta.title}</a></p>
  <h1>Projeto final: {frontmatter.title}</h1>
  <div class="prose" set:html={renderMarkdown(body)} />
  <h2>O que entregar</h2>
  <ul>
    {frontmatter.deliverables.map((deliverable) => <li>{DELIVERABLE_LABELS[deliverable]}</li>)}
  </ul>
  <h2>Como vamos avaliar</h2>
  <ol class="criteria">
    {
      frontmatter.criteria.map((criterion) => (
        <li>
          {criterion.description}{' '}
          <span class="criterion-weight">
            ({criterion.weight} pontos{criterion.required ? ', obrigatório' : ''})
          </span>
        </li>
      ))
    }
  </ol>
  <p>
    Para passar: {frontmatter.passScore} de 100 pontos, cumprindo todos os critérios obrigatórios.
  </p>
  <p class="card">
    O envio do projeto e o certificado chegam em breve. Para enviar, você vai entrar com sua conta,
    só nesta etapa.
  </p>
</App>
```

Acrescente ao fim de `apps/web/src/styles/global.css`:

```css
/* Catalog and course page */

.course-list {
  display: grid;
  gap: var(--space-3);
}

.course-card {
  padding: var(--space-4);
  border: 1px solid var(--color-line);
  border-radius: var(--radius);
}

.course-card-title {
  margin-top: 0;
}

.course-card-title a {
  color: var(--color-fg);
  text-decoration: none;
}

.course-card-title a:hover {
  text-decoration: underline;
}

.course-card .chips {
  margin-bottom: 0;
}

.outcome {
  font-size: 1.1875rem;
}

.needs {
  margin-bottom: var(--space-4);
}

.needs h2 {
  margin-top: 0;
}

.needs dl {
  display: grid;
  gap: var(--space-2);
  margin: 0;
}

.needs dt {
  font-weight: 700;
}

.needs dd {
  margin: 0;
  color: var(--color-muted);
}

.modules,
.lessons {
  margin: 0;
  padding: 0;
  list-style: none;
}

.lessons li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap);
  border-bottom: 1px solid var(--color-line);
}

.lessons a {
  flex: 1;
  padding: var(--space-2) 0;
}

.project-link {
  margin-top: var(--space-4);
  font-weight: 700;
}

/* Lesson page */

.back a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
}

.back a::before {
  content: '←' / '';
  margin-right: var(--space-2);
}

.video-slot {
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 9;
  margin: 0 0 var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-muted);
  text-align: center;
}

.video-slot p {
  margin: 0;
}

.position {
  margin-bottom: var(--space-2);
  color: var(--color-muted);
  font-size: 0.9375rem;
}

.summary {
  margin-top: var(--space-3);
}

.checklist {
  padding: 0;
  list-style: none;
}

.checklist li {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}

.checklist li::before {
  content: '';
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.2rem;
  border: 2px solid var(--color-muted);
  border-radius: 0.25rem;
}

.box {
  margin: var(--space-4) 0;
  border: 1px solid var(--color-line);
  border-radius: var(--radius);
}

.box summary {
  display: flex;
  align-items: center;
  min-height: var(--tap);
  padding: var(--space-2) var(--space-3);
  font-weight: 700;
  cursor: pointer;
}

.box > :not(summary) {
  padding: 0 var(--space-3) var(--space-3);
}

.lesson-actions {
  position: sticky;
  bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-2));
  margin-top: var(--space-4);
}

/* Project page */

.criteria li + li {
  margin-top: var(--space-2);
}

.criterion-weight {
  color: var(--color-muted);
}
```

Deploy e CI:

- `tools/deploy-site.sh`: troque o `case` e a linha do build por:

  ```bash
  case "$environment" in
    dev) site_url="https://dev.escolagratisdetecnologia.com"; drafts=true ;;
    prod) site_url="https://escolagratisdetecnologia.com.br"; drafts=false ;;
    *) echo "Ambiente inválido: $environment (use dev ou prod)." >&2; exit 2 ;;
  esac
  ```

  e

  ```bash
  SITE_URL="$site_url" SITE_ENV="$environment" SITE_DRAFTS="$drafts" pnpm --filter @egt/web build
  ```

- `.github/workflows/ci.yml`: no passo `pnpm build`, acrescente `SITE_DRAFTS: 'true'` ao `env` (o build da CI testa o curso em rascunho).
- `.github/workflows/deploy.yml`: em `on.push.paths`, acrescente `'content/**'` e `'packages/**'` (mudança de curso ou de regra também publica).

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm lint && pnpm typecheck && pnpm test && SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e`
Expected: PASS em tudo.

Confira também que prod esconde o rascunho:

```bash
SITE_ENV=prod SITE_DRAFTS=false SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build
test ! -e apps/web/dist/cursos/crie-seu-site-com-ia && grep -q 'Os primeiros cursos estão chegando' apps/web/dist/cursos/index.html && echo 'prod sem rascunho: OK'
```

Expected: `prod sem rascunho: OK`.

- [ ] **Step 7: Commit**

```bash
git add apps/web turbo.json tools/deploy-site.sh .github/workflows vitest.config.ts pnpm-lock.yaml
git commit -m "feat(web): catálogo, página do curso, aulas e projeto a partir do content/"
```

---

### Task 6: Ilhas Preact sob CSP estrita (ADR 0021)

**Files:**
- Modify: `apps/web/package.json`, `apps/web/astro.config.mjs`, `apps/web/tsconfig.json`, `eslint.config.js`, `.github/workflows/ci.yml`, `apps/web/src/pages/cursos/[curso]/index.astro`, `apps/web/src/styles/global.css`, `apps/web/e2e/home.spec.ts`, `docs/adr/README.md`
- Create: `apps/web/src/islands/runtime.ts`, `registry.ts`, `CourseProgress.tsx`; `apps/web/src/scripts/islands.ts`; `apps/web/src/components/Island.astro`
- Create: `apps/web/src/lib/progress-store.ts`, `apps/web/src/lib/csp-scan.ts`, `apps/web/scripts/check-csp.ts`
- Create: `docs/adr/0021-javascript-sob-csp-estrita.md`
- Test: `apps/web/src/islands/runtime.test.ts`, `apps/web/src/lib/progress-store.test.ts`, `apps/web/src/lib/csp-scan.test.ts`, `apps/web/e2e/support/budget.ts`, `apps/web/e2e/course-progress.spec.ts`

**Interfaces:**
- Consumes: `courseStatus`, `parseProgress`, `emptyProgress` (Task 2); `outlineOf` (Task 5).
- Produces:
  - `mountIslands(root: ParentNode, registry: IslandRegistry): Promise<void>` — hidrata cada `[data-island]` e marca `data-hydrated="true"`.
  - `Island.astro` com props `{ name: string; component: ComponentType<any>; props: Record<string, unknown> }`; cada ilha nova entra em `src/islands/registry.ts`.
  - `PROGRESS_KEY = 'egt:progress:v1'`, `readProgress(): Progress`, `writeProgress(p): void`, `clearProgress(): void`.
  - `findInlineCode(html: string): InlineCode[]` e o script `pnpm --filter @egt/web check:csp`.
  - `gzippedScriptBytes(page, url): Promise<number>` em `apps/web/e2e/support/budget.ts`.

- [ ] **Step 1: Dependências e configuração**

```bash
pnpm --filter @egt/web add @astrojs/preact@^6.0.6 preact@^10.29.8
pnpm add -Dw happy-dom@^20.14.6
```

(O `happy-dom` fica na raiz porque o Vitest roda a partir dela e procura o ambiente ali.)

`apps/web/astro.config.mjs` completo:

```js
import preact from '@astrojs/preact';
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [preact()],
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
      SITE_DRAFTS: envField.boolean({ context: 'server', access: 'public', default: false }),
    },
  },
  vite: {
    // Never inline scripts, fonts or images: the CSP only allows files from the site itself (ADR 0021).
    build: { assetsInlineLimit: 0 },
    server: { proxy: { '/api': 'http://localhost:3001' } },
  },
});
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "types": ["node"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  },
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

`eslint.config.js`: acrescente um bloco antes do bloco das CloudFront Functions:

```js
  {
    // Código do site que roda no navegador (ilhas e scripts).
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
```

`apps/web/package.json`, em `scripts`:

```json
"check:csp": "node scripts/check-csp.ts",
```

- [ ] **Step 2: Escrever os testes unitários que falham**

`apps/web/src/islands/runtime.test.ts`:

```ts
// @vitest-environment happy-dom
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountIslands } from './runtime.ts';

function Counter({ start }: { start: number }) {
  const [count, setCount] = useState(start);
  return h('button', { type: 'button', onClick: () => setCount(count + 1) }, `Cliques: ${count}`);
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('mountIslands', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hydrates islands with the props from data-props', async () => {
    document.body.innerHTML =
      '<div data-island="counter" data-props=\'{"start":2}\'><button type="button">Cliques: 2</button></div>';

    await mountIslands(document, { counter: async () => ({ default: Counter }) });

    const island = document.querySelector<HTMLElement>('[data-island]')!;
    expect(island.dataset.hydrated).toBe('true');
    island.querySelector('button')!.click();
    await nextTick();
    expect(island.textContent).toBe('Cliques: 3');
  });

  it('reports unknown islands and leaves their HTML alone', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<div data-island="nao-existe"><p>Oi</p></div>';

    await mountIslands(document, {});

    expect(error).toHaveBeenCalledWith('Unknown island: nao-existe');
    expect(document.body.textContent).toBe('Oi');
  });
});
```

`apps/web/src/lib/progress-store.test.ts`:

```ts
// @vitest-environment happy-dom
import { completeLesson, emptyProgress } from '@egt/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROGRESS_KEY, clearProgress, readProgress, writeProgress } from './progress-store.ts';

describe('progress store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips progress through localStorage', () => {
    const progress = completeLesson(emptyProgress(), 'curso', 'aula', new Date('2026-10-09T12:00:00Z'));
    writeProgress(progress);
    expect(readProgress()).toEqual(progress);
    expect(localStorage.getItem(PROGRESS_KEY)).toContain('"aula"');
  });

  it('starts empty when the stored value is garbage', () => {
    localStorage.setItem(PROGRESS_KEY, 'não é JSON');
    expect(readProgress()).toEqual(emptyProgress());
  });

  it('keeps working when storage refuses to save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeProgress(emptyProgress())).not.toThrow();
  });

  it('clears the saved progress', () => {
    writeProgress(completeLesson(emptyProgress(), 'curso', 'aula', new Date()));
    clearProgress();
    expect(readProgress()).toEqual(emptyProgress());
  });
});
```

`apps/web/src/lib/csp-scan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findInlineCode } from './csp-scan.ts';

describe('findInlineCode', () => {
  it('accepts external scripts and stylesheets', () => {
    const html =
      '<link rel="stylesheet" href="/_astro/a.css"><script type="module" src="/_astro/b.js"></script><p class="x">Oi</p>';
    expect(findInlineCode(html)).toEqual([]);
  });

  it('flags inline scripts, styles, style attributes and event handlers', () => {
    const html =
      '<script>alert(1)</script><style>p{}</style><p style="color:red">x</p><button onclick="go()">y</button>';
    expect(findInlineCode(html).map((finding) => finding.kind)).toEqual([
      'script',
      'style',
      'style-attribute',
      'event-handler',
    ]);
  });
});
```

Run: `pnpm vitest run --project web`
Expected: FAIL — `runtime.ts`, `progress-store.ts` e `csp-scan.ts` não existem.

- [ ] **Step 3: Implementar runtime, armazenamento e checagem da CSP**

`apps/web/src/islands/runtime.ts`:

```ts
import { h, hydrate, type ComponentType } from 'preact';

// Props arrive as JSON from data-props, so each island checks its own shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IslandRegistry = Record<string, () => Promise<{ default: ComponentType<any> }>>;

/**
 * Hydrates every [data-island] under root with the component registered under its name.
 * Replaces Astro's client:* directives, whose inline scripts the CSP blocks (ADR 0021).
 */
export async function mountIslands(root: ParentNode, registry: IslandRegistry): Promise<void> {
  const elements = [...root.querySelectorAll<HTMLElement>('[data-island]')];
  await Promise.all(
    elements.map(async (element) => {
      const name = element.dataset.island ?? '';
      const load = registry[name];
      if (!load) {
        console.error(`Unknown island: ${name}`);
        return;
      }
      const { default: Component } = await load();
      const props = JSON.parse(element.dataset.props ?? '{}') as Record<string, unknown>;
      hydrate(h(Component, props), element);
      element.dataset.hydrated = 'true';
    }),
  );
}
```

`apps/web/src/islands/registry.ts`:

```ts
import type { IslandRegistry } from './runtime.ts';

/** Every island, loaded on demand so a page only downloads the ones it uses. */
export const islands: IslandRegistry = {
  'course-progress': () => import('./CourseProgress.tsx'),
};
```

`apps/web/src/scripts/islands.ts`:

```ts
import { islands } from '../islands/registry.ts';
import { mountIslands } from '../islands/runtime.ts';

void mountIslands(document, islands);
```

`apps/web/src/components/Island.astro`:

```astro
---
import type { ComponentType } from 'preact';

interface Props {
  /** Name registered in src/islands/registry.ts. */
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  props: Record<string, unknown>;
}

const { name, component: Component, props } = Astro.props;
---

<div data-island={name} data-props={JSON.stringify(props)}>
  <Component {...props} />
</div>

<script src="../scripts/islands.ts"></script>
```

`apps/web/src/lib/progress-store.ts`:

```ts
import { emptyProgress, parseProgress, type Progress } from '@egt/core';

export const PROGRESS_KEY = 'egt:progress:v1';

/** localStorage can be missing or throw (private mode, blocked site data); progress is then not kept. */
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readProgress(): Progress {
  try {
    const raw = storage()?.getItem(PROGRESS_KEY);
    return raw ? parseProgress(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function writeProgress(progress: Progress): void {
  try {
    storage()?.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or blocked: the learner keeps going, progress just is not saved.
  }
}

export function clearProgress(): void {
  try {
    storage()?.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing stored to clear.
  }
}
```

`apps/web/src/lib/csp-scan.ts`:

```ts
export interface InlineCode {
  kind: 'script' | 'style' | 'style-attribute' | 'event-handler';
  snippet: string;
}

const PATTERNS: [InlineCode['kind'], RegExp][] = [
  ['script', /<script\b(?![^>]*\bsrc=)[^>]*>/gi],
  ['style', /<style\b[^>]*>/gi],
  ['style-attribute', /<[a-z][^>]*\sstyle=["'][^>]*>/gi],
  ['event-handler', /<[a-z][^>]*\son[a-z]+=["'][^>]*>/gi],
];

/** Inline code the CloudFront CSP would block (script-src and style-src are 'self' only). */
export function findInlineCode(html: string): InlineCode[] {
  return PATTERNS.flatMap(([kind, pattern]) =>
    [...html.matchAll(pattern)].map((match) => ({ kind, snippet: match[0].slice(0, 120) })),
  );
}
```

`apps/web/scripts/check-csp.ts`:

```ts
// Fails when the built HTML carries code the CloudFront CSP would block (ADR 0021).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { findInlineCode } from '../src/lib/csp-scan.ts';

const dist = path.resolve(import.meta.dirname, '../dist');
const files = (await readdir(dist, { recursive: true })).filter((file) => file.endsWith('.html'));

let total = 0;
for (const file of files) {
  const findings = findInlineCode(await readFile(path.join(dist, file), 'utf8'));
  for (const finding of findings) console.log(`- dist/${file}: ${finding.kind}: ${finding.snippet}`);
  total += findings.length;
}

if (files.length === 0) {
  console.error('Nenhum HTML em apps/web/dist: rode o build antes.');
  process.exitCode = 2;
} else if (total > 0) {
  console.log(`A CSP do site bloquearia ${total} trecho(s) inline acima. Use arquivos externos.`);
  process.exitCode = 1;
} else {
  console.log(`CSP OK: ${files.length} páginas sem script ou estilo inline.`);
}
```

Run: `pnpm vitest run --project web`
Expected: PASS.

- [ ] **Step 4: Escrever o e2e da primeira ilha (falha)**

`apps/web/e2e/support/budget.ts`:

```ts
import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';

/** Gzipped bytes of every script the page loads (spec §4.6: 30 KB gzip per content page). */
export async function gzippedScriptBytes(page: Page, url: string): Promise<number> {
  const bodies: Promise<Buffer>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') bodies.push(response.body());
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  const all = await Promise.all(bodies);
  return all.reduce((total, body) => total + gzipSync(body).length, 0);
}
```

`apps/web/e2e/course-progress.spec.ts`:

```ts
import { completeLesson, emptyProgress } from '@egt/core';
import { expect, test } from '@playwright/test';
import { PROGRESS_KEY } from '../src/lib/progress-store.ts';
import { courseUrl, lessonUrl, lessonsOf } from '../src/lib/urls.ts';
import { gzippedScriptBytes } from './support/budget.ts';
import { pilotCourse } from './support/catalog.ts';

test('the course page shows what is already done on this device', async ({ page }) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);
  const progress = completeLesson(emptyProgress(), course.slug, lessons[0]!.slug, new Date('2026-10-09T12:00:00Z'));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: PROGRESS_KEY,
    value: JSON.stringify(progress),
  });

  await page.goto(courseUrl(course));
  await expect(page.locator('[data-island="course-progress"]')).toHaveAttribute('data-hydrated', 'true');

  await expect(page.getByText(`1 de ${lessons.length} aulas concluídas`)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continuar' })).toHaveAttribute('href', lessonUrl(course, lessons[1]!));
  await expect(page.locator('.lesson-item.is-done')).toHaveCount(1);
});

test('the course page still works when storage holds garbage', async ({ page }) => {
  const course = await pilotCourse();
  await page.addInitScript((key) => localStorage.setItem(key, 'lixo'), PROGRESS_KEY);

  await page.goto(courseUrl(course));
  await expect(page.locator('[data-island="course-progress"]')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByRole('link', { name: 'Bora começar' })).toBeVisible();
});

test('the course page stays within the 30 KB gzip JavaScript budget', async ({ page }) => {
  const course = await pilotCourse();
  expect(await gzippedScriptBytes(page, courseUrl(course))).toBeLessThanOrEqual(30 * 1024);
});
```

Em `apps/web/e2e/home.spec.ts`, troque o teste `home stays within the 30 KB JavaScript budget` por:

```ts
test('home stays within the 30 KB gzip JavaScript budget', async ({ page }) => {
  expect(await gzippedScriptBytes(page, '/')).toBeLessThanOrEqual(30 * 1024);
});
```

com `import { gzippedScriptBytes } from './support/budget.ts';`.

Run: `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e course-progress`
Expected: FAIL — ainda não existe `[data-island="course-progress"]`.

- [ ] **Step 5: Implementar a ilha do curso**

`apps/web/src/islands/CourseProgress.tsx`:

```tsx
import { courseStatus, type CourseOutline, type CourseProgress as StoredProgress } from '@egt/core';
import { useEffect, useState } from 'preact/hooks';
import { readProgress } from '../lib/progress-store.ts';

interface Props {
  outline: CourseOutline;
}

/** Course page: start or continue button and the lesson list, with what is done on this device. */
export default function CourseProgress({ outline }: Props) {
  // Starts empty so the first render matches the build-time HTML; the effect then reads the device.
  const [progress, setProgress] = useState<StoredProgress | undefined>(undefined);
  useEffect(() => setProgress(readProgress().courses[outline.slug]), [outline.slug]);

  const status = courseStatus(outline, progress);
  const done = new Set(progress?.completedLessons ?? []);

  return (
    <div class="course-progress">
      {status.started ? (
        <>
          <p class="progress-label">
            {status.done} de {status.total} aulas concluídas
          </p>
          <progress aria-label="Seu progresso no curso" max={status.total} value={status.done} />
          <a class="button button-block" href={status.next.url}>
            {status.finished ? 'Ver o projeto final' : 'Continuar'}
          </a>
        </>
      ) : (
        <a class="button button-block" href={status.next.url}>
          Bora começar
        </a>
      )}
      <h2 id="conteudo-do-curso">O que tem no curso</h2>
      <ol class="modules">
        {outline.modules.map((module) => (
          <li key={module.title}>
            <h3>{module.title}</h3>
            <ol class="lessons">
              {module.lessons.map((lesson) => (
                <li key={lesson.slug} class={done.has(lesson.slug) ? 'lesson-item is-done' : 'lesson-item'}>
                  <a href={lesson.url}>{lesson.title}</a>
                  {done.has(lesson.slug) && <span class="done-badge">concluída</span>}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <p class="project-link">
        <a href={outline.projectUrl}>Projeto final: {outline.projectTitle}</a>
      </p>
    </div>
  );
}
```

`apps/web/src/pages/cursos/[curso]/index.astro` passa a ser (a lista e o botão agora vêm da ilha, com a mesma marcação):

```astro
---
import { LEVEL_LABELS } from '@egt/content';
import type { InferGetStaticPropsType } from 'astro';
import CourseChips from '../../../components/CourseChips.astro';
import Island from '../../../components/Island.astro';
import NeedsCard from '../../../components/NeedsCard.astro';
import CourseProgress from '../../../islands/CourseProgress.tsx';
import App from '../../../layouts/App.astro';
import { getCourses } from '../../../lib/catalog.ts';
import { outcomeResult } from '../../../lib/course-text.ts';
import { outlineOf } from '../../../lib/urls.ts';

export async function getStaticPaths() {
  const courses = await getCourses();
  return courses.map((course) => ({ params: { curso: course.slug }, props: { course } }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

const { course } = Astro.props;
---

<App
  title={`${course.meta.title} · Escola Grátis de Tecnologia`}
  description={course.meta.outcome}
  tab="cursos"
>
  <p class="eyebrow">Curso grátis · {LEVEL_LABELS[course.meta.level]}</p>
  <h1>{course.meta.title}</h1>
  <p class="outcome">Você sai com: <mark>{outcomeResult(course.meta.outcome)}</mark></p>
  <CourseChips course={course} />
  <NeedsCard course={course} />
  <Island name="course-progress" component={CourseProgress} props={{ outline: outlineOf(course) }} />
</App>
```

Acrescente ao fim de `apps/web/src/styles/global.css`:

```css
/* Course progress island */

.progress-label {
  margin-bottom: var(--space-2);
  color: var(--color-muted);
  font-size: 0.9375rem;
}

.course-progress progress {
  margin-bottom: var(--space-3);
}

.done-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-success);
  font-size: 0.875rem;
  font-weight: 700;
}

.done-badge::before {
  content: '✓' / '';
}
```

Na CI (`.github/workflows/ci.yml`), logo depois do passo `pnpm build`:

```yaml
      - run: pnpm --filter @egt/web check:csp
```

- [ ] **Step 6: Registrar a decisão (ADR 0021)**

`docs/adr/0021-javascript-sob-csp-estrita.md`:

```md
# 0021. JavaScript no cliente sob CSP estrita

- Status: aceita
- Data: 2026-10-09
- Decisão do spec: D1 (complementa)

## Contexto

A borda envia `script-src 'self'` e `style-src 'self'` em todas as respostas (response headers policy do CloudFront). As ilhas do Astro 7 (`client:load`, `client:visible` etc.) injetam dois scripts inline em cada página: o runtime das ilhas e o da diretiva. Num teste de 2026-10-09, os dois seriam bloqueados e nenhuma ilha funcionaria em produção.

O `security.csp` do Astro 7 calcula hashes, mas os grava numa meta tag por página; a CSP do cabeçalho continua valendo e bloqueia do mesmo jeito. O `@vite-pwa/astro`, citado no spec para o service worker, declara suporte só até o Astro 5.

## Decisão

- Ilhas Preact são renderizadas no build pelo Astro, **sem** diretiva `client:*`, dentro de `<div data-island data-props>` (`src/components/Island.astro`). O script externo `src/scripts/islands.ts` hidrata cada uma com `hydrate()` do Preact e importa o componente sob demanda (`src/islands/registry.ts`).
- Melhorias pequenas e sem estado (variantes por aparelho, concluir aula, instalar o app, atalho "Continuar curso") usam scripts externos sem framework.
- `vite.build.assetsInlineLimit: 0`: nenhum script, fonte ou imagem vira inline.
- O service worker é gerado pelo `workbox-build` numa integração própria no hook `astro:build:done`, com o runtime do Workbox em arquivo separado.
- A CI roda `pnpm --filter @egt/web check:csp`, que falha se o HTML gerado tiver `<script>` sem `src`, `<style>`, atributo `style` ou handler `on*`.

## Alternativas consideradas

- `security.csp` do Astro: a meta tag com hashes não libera o que o cabeçalho bloqueia.
- Hashes no cabeçalho do CloudFront: acopla o Terraform ao resultado de cada build.
- `'unsafe-inline'`: derruba a proteção contra injeção de script.
- `@vite-pwa/astro`: não declara suporte ao Astro 7.

## Consequências

- Positivas:
  - A CSP continua estrita, sem exceções.
  - JavaScript só onde há interação: o Preact pesa cerca de 6 KB gzip, e páginas sem ilha não baixam nada dele.
- Negativas:
  - Um runtime de ilhas próprio (cerca de 30 linhas) para manter.
  - Sem hidratação adiada (`client:visible`, `client:idle`): todas as ilhas hidratam no carregamento. Se precisar, o runtime ganha um `IntersectionObserver`.

## Pilares Well-Architected

Segurança (CSP estrita mantida) e eficiência de performance (JavaScript mínimo e sob demanda).

## Revisar quando

O Astro permitir ilhas sem script inline, ou a CSP passar a ser gerada por página.
```

Em `docs/adr/README.md`, acrescente a linha `| 0021 | JavaScript no cliente sob CSP estrita | aceita |` depois da 0020 e rode `pnpm exec prettier --write docs/adr/README.md`.

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm lint && pnpm typecheck && pnpm test && SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web check:csp && pnpm --filter @egt/web test:e2e`
Expected: `CSP OK: …` e todos os testes PASS. Se o `check:csp` acusar um `<script>` inline, alguma página usou `client:*` ou um script ficou pequeno demais para o Vite: confira o `assetsInlineLimit: 0`.

- [ ] **Step 8: Commit**

```bash
git add apps/web eslint.config.js .github/workflows/ci.yml docs/adr pnpm-lock.yaml
git commit -m "feat(web): ilhas Preact hidratadas por script externo, sem quebrar a CSP"
```

---

### Task 7: Aula interativa (quiz, concluir e continuar, variantes por aparelho)

**Files:**
- Create: `apps/web/src/islands/Quiz.tsx`, `apps/web/src/scripts/lesson-complete.ts`, `apps/web/src/scripts/platform-variants.ts`, `apps/web/src/lib/platform.ts`
- Modify: `apps/web/src/islands/registry.ts`, `apps/web/src/pages/cursos/[curso]/[aula].astro`, `apps/web/src/styles/global.css`
- Test: `apps/web/src/lib/platform.test.ts`, `apps/web/e2e/lesson.spec.ts`

**Interfaces:**
- Consumes: `Island.astro`, `readProgress`/`writeProgress` (Task 6); `completeLesson`, `visitLesson`, `recordCorrectAnswer` (Task 2); marcação da aula (Task 5).
- Produces:
  - `detectPlatform(userAgent: string, maxTouchPoints?: number): Platform | undefined` (reusado na Task 9).
  - Ilha `quiz` com props `{ course: string; lesson: string; questions: QuizQuestion[] }`.
  - `[data-lesson]` recebe `data-ready="true"` quando o script de conclusão está ativo; `[data-variants]` recebe `data-ready="true"` quando o seletor está ativo.

- [ ] **Step 1: Teste unitário que falha**

`apps/web/src/lib/platform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform.ts';

describe('detectPlatform', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36', 0, 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 0, 'mac'],
    ['Mozilla/5.0 (X11; CrOS x86_64 15917.0.0) AppleWebKit/537.36 Chrome/130 Safari/537.36', 0, 'chromeos'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', 0, 'windows'],
  ])('%s → %s', (userAgent, touchPoints, expected) => {
    expect(detectPlatform(userAgent, touchPoints)).toBe(expected);
  });

  it('returns undefined for other systems', () => {
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0')).toBeUndefined();
  });
});
```

Run: `pnpm vitest run --project web`
Expected: FAIL — `platform.ts` não existe.

- [ ] **Step 2: Implementar `detectPlatform`**

`apps/web/src/lib/platform.ts`:

```ts
import type { Platform } from '@egt/content';

/** Best guess of the learner's device, to open the right steps of module 0 (they can switch). */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform | undefined {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS identifies as a Mac; touch support tells them apart.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/CrOS/i.test(userAgent)) return 'chromeos';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  return undefined;
}
```

Run: `pnpm vitest run --project web`
Expected: PASS.

- [ ] **Step 3: Escrever o e2e que falha**

`apps/web/e2e/lesson.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { courseUrl, lessonUrl, lessonsOf, projectUrl } from '../src/lib/urls.ts';
import { expectNoA11yViolations } from './support/axe.ts';
import { gzippedScriptBytes } from './support/budget.ts';
import { pilotCourse } from './support/catalog.ts';

test('the quiz tells right from wrong and explains the answer', async ({ page }) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course)[0]!;
  const question = lesson.frontmatter.quiz[0]!;
  const wrong = question.options.findIndex((_, index) => index !== question.answer);

  await page.goto(lessonUrl(course, lesson));
  await expect(page.locator('[data-island="quiz"]')).toHaveAttribute('data-hydrated', 'true');
  const group = page.getByRole('group', { name: question.question });

  await group.getByLabel(question.options[wrong]!, { exact: true }).check();
  await group.getByRole('button', { name: 'Conferir' }).click();
  await expect(group.getByText('Ainda não. Releia a aula e tente outra opção.')).toBeVisible();

  await group.getByLabel(question.options[question.answer]!, { exact: true }).check();
  await group.getByRole('button', { name: 'Conferir' }).click();
  await expect(group.getByText(`Isso aí! ${question.explanation}`)).toBeVisible();
});

test('finishing every lesson leads to the project and is remembered', async ({ page }) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);

  await page.goto(lessonUrl(course, lessons[0]!));
  for (const [index, lesson] of lessons.entries()) {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.frontmatter.title);
    await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
    const last = index === lessons.length - 1;
    await page.getByRole('link', { name: last ? 'Concluir e ver o projeto' : 'Concluir e continuar' }).click();
  }
  await expect(page).toHaveURL(projectUrl(course));

  await page.goto(courseUrl(course));
  await expect(page.getByText(`${lessons.length} de ${lessons.length} aulas concluídas`)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver o projeto final' })).toHaveAttribute('href', projectUrl(course));
});

test('module 0 opens the steps for the learner device and lets them switch', async ({ page }, testInfo) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
  const mine = testInfo.project.name === 'iphone' ? 'iPhone' : 'Android';
  const other = mine === 'iPhone' ? 'Android' : 'iPhone';

  await page.goto(lessonUrl(course, lesson));
  const variants = page.locator('[data-variants]');
  await expect(variants).toHaveAttribute('data-ready', 'true');

  await expect(variants.getByRole('button', { name: mine })).toHaveAttribute('aria-pressed', 'true');
  await expect(variants.getByRole('heading', { name: mine, level: 3 })).toBeVisible();
  await expect(variants.getByRole('heading', { name: other, level: 3 })).toBeHidden();

  await variants.getByRole('button', { name: other }).click();
  await expect(variants.getByRole('heading', { name: other, level: 3 })).toBeVisible();
  await expect(variants.getByRole('heading', { name: mine, level: 3 })).toBeHidden();
});

test('opening a lesson marks the course as started', async ({ page }) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);

  await page.goto(lessonUrl(course, lessons[1]!));
  await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
  await page.goto(courseUrl(course));

  await expect(page.getByText(`0 de ${lessons.length} aulas concluídas`)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continuar' })).toHaveAttribute('href', lessonUrl(course, lessons[0]!));
});

for (const scheme of ['light', 'dark'] as const) {
  test(`an interactive lesson is accessible (${scheme})`, async ({ page }) => {
    const course = await pilotCourse();
    const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(lessonUrl(course, lesson));
    await expect(page.locator('[data-island="quiz"]')).toHaveAttribute('data-hydrated', 'true');
    await expectNoA11yViolations(page);
  });
}

test('a lesson stays within the 30 KB gzip JavaScript budget', async ({ page }) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
  expect(await gzippedScriptBytes(page, lessonUrl(course, lesson))).toBeLessThanOrEqual(30 * 1024);
});
```

Run: `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e lesson`
Expected: FAIL — não há quiz, nem `data-ready`, nem seletor de aparelho.

- [ ] **Step 4: Implementar quiz, conclusão e variantes**

`apps/web/src/islands/Quiz.tsx`:

```tsx
import type { QuizQuestion } from '@egt/content';
import { recordCorrectAnswer } from '@egt/core';
import { useState } from 'preact/hooks';
import { readProgress, writeProgress } from '../lib/progress-store.ts';

interface Props {
  course: string;
  lesson: string;
  questions: QuizQuestion[];
}

interface Answer {
  selected?: number;
  result?: 'correct' | 'wrong';
}

/** Formative quiz: checks each answer on the spot and remembers the right ones on this device. */
export default function Quiz({ course, lesson, questions }: Props) {
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({})));
  const update = (index: number, answer: Answer) =>
    setAnswers((current) => current.map((item, position) => (position === index ? answer : item)));

  const check = (index: number) => {
    const question = questions[index];
    const selected = answers[index]?.selected;
    if (!question || selected === undefined) return;
    const correct = selected === question.answer;
    update(index, { selected, result: correct ? 'correct' : 'wrong' });
    if (correct) writeProgress(recordCorrectAnswer(readProgress(), course, lesson, index, new Date()));
  };

  return (
    <div class="quiz">
      {questions.map((question, index) => {
        const answer = answers[index] ?? {};
        return (
          <fieldset class="quiz-question" key={question.question}>
            <legend>{question.question}</legend>
            {question.options.map((option, optionIndex) => (
              <label class="quiz-option" key={option}>
                <input
                  type="radio"
                  name={`${lesson}-pergunta-${index}`}
                  value={optionIndex}
                  checked={answer.selected === optionIndex}
                  onChange={() => update(index, { selected: optionIndex })}
                />
                <span>{option}</span>
              </label>
            ))}
            <button
              type="button"
              class="button button-secondary"
              disabled={answer.selected === undefined}
              onClick={() => check(index)}
            >
              Conferir
            </button>
            <p class={answer.result ? `quiz-feedback is-${answer.result}` : 'quiz-feedback'} aria-live="polite">
              {answer.result === 'correct' && `Isso aí! ${question.explanation}`}
              {answer.result === 'wrong' && 'Ainda não. Releia a aula e tente outra opção.'}
            </p>
          </fieldset>
        );
      })}
    </div>
  );
}
```

Registre em `apps/web/src/islands/registry.ts`:

```ts
export const islands: IslandRegistry = {
  'course-progress': () => import('./CourseProgress.tsx'),
  quiz: () => import('./Quiz.tsx'),
};
```

`apps/web/src/scripts/lesson-complete.ts`:

```ts
import { completeLesson, visitLesson } from '@egt/core';
import { readProgress, writeProgress } from '../lib/progress-store.ts';

// Lesson page: remembers the visit and marks the lesson done when the learner moves on.
const lesson = document.querySelector<HTMLElement>('[data-lesson]');
if (lesson) {
  const course = lesson.dataset.course ?? '';
  const slug = lesson.dataset.lesson ?? '';
  writeProgress(visitLesson(readProgress(), course, slug, new Date()));
  lesson.querySelector('[data-complete]')?.addEventListener('click', () => {
    writeProgress(completeLesson(readProgress(), course, slug, new Date()));
  });
  lesson.dataset.ready = 'true';
}
```

`apps/web/src/scripts/platform-variants.ts`:

```ts
import { detectPlatform } from '../lib/platform.ts';

// Module 0: shows only the steps for the learner's device, with buttons to switch.
const root = document.querySelector<HTMLElement>('[data-variants]');
if (root) {
  const sections = [...root.querySelectorAll<HTMLElement>('[data-platform]')];
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-show]')];
  const show = (platform: string) => {
    for (const section of sections) section.hidden = section.dataset.platform !== platform;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.show === platform));
  };

  const available = sections.map((section) => section.dataset.platform ?? '');
  const detected = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  show(detected && available.includes(detected) ? detected : (available[0] ?? ''));
  for (const button of buttons) button.addEventListener('click', () => show(button.dataset.show ?? ''));

  const switcher = root.querySelector<HTMLElement>('[data-switcher]');
  if (switcher) switcher.hidden = false;
  root.dataset.ready = 'true';
}
```

`apps/web/src/pages/cursos/[curso]/[aula].astro` completo (entram o seletor de aparelho, o quiz e os dois scripts):

```astro
---
import { PLATFORMS, PLATFORM_LABELS } from '@egt/content';
import type { InferGetStaticPropsType } from 'astro';
import Island from '../../../components/Island.astro';
import Quiz from '../../../islands/Quiz.tsx';
import App from '../../../layouts/App.astro';
import { getCourses } from '../../../lib/catalog.ts';
import { renderMarkdown } from '../../../lib/markdown.ts';
import { courseUrl, lessonUrl, lessonsOf, projectUrl } from '../../../lib/urls.ts';

export async function getStaticPaths() {
  const courses = await getCourses();
  return courses.flatMap((course) => {
    const lessons = lessonsOf(course);
    return lessons.map((lesson, index) => ({
      params: { curso: course.slug, aula: lesson.slug },
      props: { course, lesson, index, total: lessons.length, next: lessons[index + 1] },
    }));
  });
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

const { course, lesson, index, total, next } = Astro.props;
const { title, summary, variants, checkpoint, video, quiz } = lesson.frontmatter;
const variantEntries = PLATFORMS.flatMap((platform) => {
  const variant = variants?.[platform];
  return variant ? [{ platform, label: PLATFORM_LABELS[platform], html: renderMarkdown(variant.steps) }] : [];
});
---

<App title={`${title} · ${course.meta.title}`} description={summary} tab="cursos">
  <article class="lesson" data-course={course.slug} data-lesson={lesson.slug}>
    <p class="back"><a href={courseUrl(course)}>{course.meta.title}</a></p>
    <div class="video-slot">
      <p>O vídeo desta aula está em produção. Por enquanto, leia a transcrição logo abaixo.</p>
    </div>
    <h1>{title}</h1>
    <p class="position">Aula {index + 1} de {total}</p>
    <progress aria-label="Posição no curso" max={total} value={index + 1}></progress>
    <p class="lead summary">{summary}</p>
    {
      variantEntries.length > 0 && (
        <section class="variants" data-variants aria-labelledby="aparelho-titulo">
          <h2 id="aparelho-titulo">No seu aparelho</h2>
          <div class="variant-switcher" data-switcher role="group" aria-label="Escolha seu aparelho" hidden>
            {variantEntries.map((variant) => (
              <button type="button" class="button button-secondary" data-show={variant.platform} aria-pressed="false">
                {variant.label}
              </button>
            ))}
          </div>
          {variantEntries.map((variant) => (
            <section class="variant" data-platform={variant.platform} aria-label={variant.label}>
              <h3>{variant.label}</h3>
              <div class="prose" set:html={variant.html} />
            </section>
          ))}
        </section>
      )
    }
    {
      checkpoint && (
        <section class="checkpoint" aria-labelledby="mao-na-massa-titulo">
          <h2 id="mao-na-massa-titulo">Mão na massa</h2>
          <ul class="checklist">
            {checkpoint.map((item) => (
              <li>{item}</li>
            ))}
          </ul>
        </section>
      )
    }
    <details class="box quiz-box" open>
      <summary>Teste rápido ({quiz.length} {quiz.length === 1 ? 'pergunta' : 'perguntas'})</summary>
      <Island
        name="quiz"
        component={Quiz}
        props={{ course: course.slug, lesson: lesson.slug, questions: quiz }}
      />
    </details>
    <details class="box transcript" open={!video}>
      <summary>Transcrição</summary>
      <div class="prose" set:html={renderMarkdown(lesson.body)} />
    </details>
    <div class="lesson-actions">
      <a
        class="button button-block"
        data-complete
        href={next ? lessonUrl(course, next) : projectUrl(course)}
      >
        {next ? 'Concluir e continuar' : 'Concluir e ver o projeto'}
      </a>
    </div>
  </article>
</App>

<script src="../../../scripts/lesson-complete.ts"></script>
<script src="../../../scripts/platform-variants.ts"></script>
```

Sem JavaScript, o seletor continua escondido e todas as variantes ficam visíveis.

Acrescente ao fim de `apps/web/src/styles/global.css`:

```css
/* Quiz */

.quiz {
  display: grid;
  gap: var(--space-4);
}

.quiz-question {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.quiz-question legend {
  margin-bottom: var(--space-2);
  padding: 0;
  font-weight: 700;
}

.quiz-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-small);
  cursor: pointer;
}

.quiz-option:has(input:checked) {
  border-color: var(--color-accent);
  background: var(--color-surface);
}

.quiz-option input {
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--color-accent);
}

.quiz-question .button {
  justify-self: start;
}

.quiz-feedback {
  min-height: 1.6em;
  margin: 0;
  font-weight: 700;
}

.quiz-feedback.is-correct {
  color: var(--color-success);
}

.quiz-feedback.is-wrong {
  color: var(--color-danger);
}

/* Platform variants */

.variant-switcher {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.variant-switcher .button[aria-pressed='true'] {
  background: var(--color-accent);
  color: var(--color-accent-fg);
}

.variant h3 {
  margin-top: var(--space-2);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm lint && pnpm typecheck && pnpm test && SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web check:csp && pnpm --filter @egt/web test:e2e`
Expected: PASS em tudo, nos dois projetos.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): quiz, concluir e continuar e passo a passo por aparelho nas aulas"
```

---

### Task 8: Continue de onde parou, aba Eu e atalho "Continuar curso"

**Files:**
- Create: `apps/web/src/islands/ContinueCard.tsx`, `apps/web/src/islands/MyProgress.tsx`, `apps/web/src/scripts/continue.ts`, `apps/web/src/pages/continuar.astro`
- Modify: `apps/web/src/islands/registry.ts`, `apps/web/src/pages/index.astro`, `apps/web/src/pages/eu.astro`, `apps/web/src/styles/global.css`
- Test: `apps/web/e2e/progress.spec.ts`

**Interfaces:**
- Consumes: `courseStatus`, `mostRecentCourse`, `emptyProgress` (Task 2); `readProgress`, `clearProgress`, `Island.astro` (Task 6); `outlineOf`, `getCourses` (Task 5).
- Produces: ilhas `continue-card` e `my-progress` (props `{ outlines: CourseOutline[] }`); página `/continuar/` (atalho do app na Task 9) com `[data-continue]` que recebe `data-ready="true"`.

- [ ] **Step 1: Escrever o e2e que falha**

`apps/web/e2e/progress.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { lessonUrl, lessonsOf } from '../src/lib/urls.ts';
import { expectNoA11yViolations } from './support/axe.ts';
import { pilotCourse } from './support/catalog.ts';

async function finishFirstLesson(page: Page) {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);
  await page.goto(lessonUrl(course, lessons[0]!));
  await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('link', { name: 'Concluir e continuar' }).click();
  await expect(page).toHaveURL(lessonUrl(course, lessons[1]!));
  return { course, lessons };
}

test('home offers to continue after the first lesson', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-island="continue-card"]')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByRole('region', { name: 'Continue de onde parou' })).toHaveCount(0);

  const { course, lessons } = await finishFirstLesson(page);
  await page.goto('/');

  const card = page.getByRole('region', { name: 'Continue de onde parou' });
  await expect(card).toContainText(course.meta.title);
  await expect(card).toContainText(`1 de ${lessons.length} aulas concluídas`);
  await expect(card.getByRole('link', { name: 'Continuar' })).toHaveAttribute('href', lessonUrl(course, lessons[1]!));
});

test('the Eu tab lists courses in progress and can clear them', async ({ page }) => {
  await page.goto('/eu/');
  await expect(page.getByText('Você ainda não começou nenhum curso.')).toBeVisible();

  const { course, lessons } = await finishFirstLesson(page);
  await page.goto('/eu/');
  await expect(page.getByRole('link', { name: course.meta.title })).toBeVisible();
  await expect(page.getByText(`1 de ${lessons.length} aulas concluídas`)).toBeVisible();

  await page.getByRole('button', { name: 'Apagar meu progresso deste aparelho' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('link', { name: course.meta.title })).toBeVisible();

  await page.getByRole('button', { name: 'Apagar meu progresso deste aparelho' }).click();
  await expect(page.getByRole('button', { name: 'Apagar progresso' })).toBeFocused();
  await page.getByRole('button', { name: 'Apagar progresso' }).click();
  await expect(page.getByRole('status')).toHaveText('Progresso apagado.');
  await expect(page.getByText('Você ainda não começou nenhum curso.')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Você ainda não começou nenhum curso.')).toBeVisible();
});

test('the "Continuar curso" shortcut jumps to the next lesson', async ({ page }) => {
  await page.goto('/continuar/');
  await expect(page.locator('[data-continue]')).toHaveAttribute('data-ready', 'true');
  const course = await pilotCourse();
  await expect(page.getByRole('link', { name: course.meta.title })).toBeVisible();

  const { lessons } = await finishFirstLesson(page);
  await page.goto('/continuar/');
  await expect(page).toHaveURL(lessonUrl(course, lessons[1]!));
});

for (const scheme of ['light', 'dark'] as const) {
  test(`home and Eu are accessible with progress (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await finishFirstLesson(page);
    for (const url of ['/', '/eu/']) {
      await page.goto(url);
      await expect(page.locator('[data-island]').first()).toHaveAttribute('data-hydrated', 'true');
      await expectNoA11yViolations(page);
    }
  });
}
```

Run: `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e progress`
Expected: FAIL — as ilhas e a página `/continuar/` não existem.

- [ ] **Step 2: Implementar**

`apps/web/src/islands/ContinueCard.tsx`:

```tsx
import { courseStatus, mostRecentCourse, type CourseOutline, type Progress } from '@egt/core';
import { useEffect, useState } from 'preact/hooks';
import { readProgress } from '../lib/progress-store.ts';

interface Props {
  outlines: CourseOutline[];
}

/** Home: "Continue de onde parou" for the course touched most recently on this device. */
export default function ContinueCard({ outlines }: Props) {
  const [progress, setProgress] = useState<Progress | undefined>(undefined);
  useEffect(() => setProgress(readProgress()), []);

  const outline = progress ? mostRecentCourse(progress, outlines) : undefined;
  if (!progress || !outline) return null;
  const status = courseStatus(outline, progress.courses[outline.slug]);

  return (
    <section class="card continue" aria-labelledby="continue-titulo">
      <h2 id="continue-titulo">Continue de onde parou</h2>
      <p class="continue-course">{outline.title}</p>
      <p class="progress-label">
        {status.done} de {status.total} aulas concluídas
      </p>
      <progress aria-label={`Seu progresso em ${outline.title}`} max={status.total} value={status.done} />
      <a class="button" href={status.next.url}>
        Continuar
      </a>
    </section>
  );
}
```

`apps/web/src/islands/MyProgress.tsx`:

```tsx
import { courseStatus, emptyProgress, type CourseOutline, type Progress } from '@egt/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clearProgress, readProgress } from '../lib/progress-store.ts';

interface Props {
  outlines: CourseOutline[];
}

/** Eu tab: courses in progress on this device, with a confirmed way to clear them. */
export default function MyProgress({ outlines }: Props) {
  const [progress, setProgress] = useState<Progress | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => setProgress(readProgress()), []);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  if (!progress) return <p class="lead">Carregando seu progresso…</p>;

  const started = outlines
    .map((outline) => ({ outline, status: courseStatus(outline, progress.courses[outline.slug]) }))
    .filter(({ status }) => status.started);

  const clear = () => {
    clearProgress();
    setProgress(emptyProgress());
    setConfirming(false);
    setCleared(true);
  };

  return (
    <div class="my-progress">
      <h2>Seus cursos</h2>
      {started.length === 0 ? (
        <p>
          Você ainda não começou nenhum curso. <a href="/cursos/">Ver os cursos</a>
        </p>
      ) : (
        <ul class="my-courses">
          {started.map(({ outline, status }) => (
            <li key={outline.slug} class="card">
              <a class="my-course-title" href={outline.url}>
                {outline.title}
              </a>
              <p class="progress-label">
                {status.done} de {status.total} aulas concluídas
              </p>
              <progress aria-label={`Seu progresso em ${outline.title}`} max={status.total} value={status.done} />
              <a class="button button-secondary" href={status.next.url}>
                Continuar
              </a>
            </li>
          ))}
        </ul>
      )}
      <p class="status" role="status">
        {cleared ? 'Progresso apagado.' : ''}
      </p>
      {started.length > 0 && !confirming && (
        <button
          type="button"
          class="button button-secondary"
          onClick={() => {
            setCleared(false);
            setConfirming(true);
          }}
        >
          Apagar meu progresso deste aparelho
        </button>
      )}
      {confirming && (
        <div class="confirm" role="group" aria-labelledby="apagar-pergunta">
          <p id="apagar-pergunta">
            Isso apaga o progresso de todos os cursos neste aparelho. Quer mesmo apagar?
          </p>
          <div class="confirm-actions">
            <button type="button" class="button button-danger" ref={confirmButton} onClick={clear}>
              Apagar progresso
            </button>
            <button type="button" class="button button-secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Registre as duas em `apps/web/src/islands/registry.ts`:

```ts
export const islands: IslandRegistry = {
  'continue-card': () => import('./ContinueCard.tsx'),
  'course-progress': () => import('./CourseProgress.tsx'),
  'my-progress': () => import('./MyProgress.tsx'),
  quiz: () => import('./Quiz.tsx'),
};
```

`apps/web/src/scripts/continue.ts`:

```ts
import { courseStatus, mostRecentCourse, type CourseOutline } from '@egt/core';
import { readProgress } from '../lib/progress-store.ts';

// /continuar/ (app shortcut): jumps to the next lesson of the course touched most recently.
const root = document.querySelector<HTMLElement>('[data-continue]');
if (root) {
  const outlines = JSON.parse(root.dataset.outlines ?? '[]') as CourseOutline[];
  const progress = readProgress();
  const outline = mostRecentCourse(progress, outlines);
  if (outline) location.replace(courseStatus(outline, progress.courses[outline.slug]).next.url);
  root.dataset.ready = 'true';
}
```

`apps/web/src/pages/continuar.astro`:

```astro
---
import App from '../layouts/App.astro';
import { getCourses } from '../lib/catalog.ts';
import { outlineOf } from '../lib/urls.ts';

const outlines = (await getCourses()).map(outlineOf);
---

<App
  title="Continuar curso · Escola Grátis de Tecnologia"
  description="Volte para a próxima aula do curso que você está fazendo."
  noindex
>
  <h1>Continuar curso</h1>
  <div data-continue data-outlines={JSON.stringify(outlines)}>
    {
      outlines.length > 0 ? (
        <>
          <p>Escolha o curso para continuar:</p>
          <ul>
            {outlines.map((outline) => (
              <li>
                <a href={outline.url}>{outline.title}</a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p class="empty">Os primeiros cursos estão chegando. Volte em breve!</p>
      )
    }
  </div>
</App>

<script src="../scripts/continue.ts"></script>
```

`apps/web/src/pages/index.astro` completo:

```astro
---
import CourseCard from '../components/CourseCard.astro';
import Island from '../components/Island.astro';
import ContinueCard from '../islands/ContinueCard.tsx';
import App from '../layouts/App.astro';
import { getCourses } from '../lib/catalog.ts';
import { outlineOf } from '../lib/urls.ts';

const courses = await getCourses();
---

<App
  title="Escola Grátis de Tecnologia"
  description="Microcursos grátis de tecnologia, feitos pro celular, com certificado verificável. Aprenda e saia resolvendo um problema de verdade."
  tab="inicio"
>
  <p class="eyebrow">100% grátis · feito para o celular</p>
  <h1>Aprenda tecnologia de graça e saia resolvendo um problema de <mark>verdade</mark>.</h1>
  <p class="lead">
    Microcursos com aulas de 2 a 5 minutos e um projeto real no final, com certificado que qualquer
    pessoa consegue conferir.
  </p>
  <a class="button" href="/cursos/">Ver os cursos</a>
  <Island name="continue-card" component={ContinueCard} props={{ outlines: courses.map(outlineOf) }} />
  <section aria-labelledby="comece-titulo">
    <h2 id="comece-titulo">Comece por aqui</h2>
    {
      courses.length > 0 ? (
        <div class="course-list">
          {courses.map((course) => (
            <CourseCard course={course} headingLevel={3} />
          ))}
        </div>
      ) : (
        <p class="empty">Os primeiros cursos estão chegando. Volte em breve!</p>
      )
    }
  </section>
  <ul class="points">
    <li><strong>100% grátis</strong>, sempre. Sem pegadinha.</li>
    <li><strong>Mão na massa</strong>: todo curso termina num projeto real.</li>
    <li><strong>Certificado verificável</strong> pra mostrar no LinkedIn.</li>
  </ul>
</App>
```

`apps/web/src/pages/eu.astro` completo:

```astro
---
import Island from '../components/Island.astro';
import MyProgress from '../islands/MyProgress.tsx';
import App from '../layouts/App.astro';
import { getCourses } from '../lib/catalog.ts';
import { outlineOf } from '../lib/urls.ts';

const outlines = (await getCourses()).map(outlineOf);
---

<App
  title="Eu · Escola Grátis de Tecnologia"
  description="Seu progresso nos cursos da Escola Grátis de Tecnologia."
  tab="eu"
>
  <h1>Eu</h1>
  <Island name="my-progress" component={MyProgress} props={{ outlines }} />
  <section class="card" aria-labelledby="conta-titulo">
    <h2 id="conta-titulo">Sua conta</h2>
    <p>
      Por enquanto, seu progresso fica salvo só neste aparelho. Em breve, você vai poder entrar com
      sua conta e levar o progresso para qualquer aparelho.
    </p>
  </section>
</App>
```

Acrescente ao fim de `apps/web/src/styles/global.css`:

```css
/* Continue card and Eu tab */

.continue {
  margin: var(--space-4) 0;
}

.continue h2 {
  margin-top: 0;
}

.continue-course {
  margin-bottom: var(--space-1);
  font-weight: 700;
}

.continue progress,
.my-courses progress {
  margin-bottom: var(--space-3);
}

.my-courses {
  display: grid;
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.my-course-title {
  display: inline-block;
  margin-bottom: var(--space-1);
  font-weight: 700;
}

.status {
  min-height: 1.6em;
  color: var(--color-success);
  font-weight: 700;
}

.confirm {
  margin: var(--space-3) 0;
  padding: var(--space-3);
  border: 2px solid var(--color-danger);
  border-radius: var(--radius);
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.button-danger {
  background: var(--color-danger);
  color: var(--color-bg);
}

.my-progress + .card {
  margin-top: var(--space-5);
}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `pnpm lint && pnpm typecheck && pnpm test && SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web check:csp && pnpm --filter @egt/web test:e2e`
Expected: PASS em tudo.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): continue de onde parou, progresso na aba Eu e atalho Continuar curso"
```

---

### Task 9: App instalável (PWA) e página sem internet

**Files:**
- Modify: `apps/web/package.json`, `apps/web/astro.config.mjs`, `apps/web/src/layouts/Base.astro`, `apps/web/src/pages/index.astro`, `apps/web/src/pages/eu.astro`, `apps/web/src/styles/global.css`
- Create: `apps/web/integrations/service-worker.ts`, `apps/web/src/pages/manifest.json.ts`, `apps/web/src/pages/offline.astro`, `apps/web/src/scripts/register-sw.ts`, `apps/web/src/scripts/install-prompt.ts`, `apps/web/src/components/InstallPrompt.astro`
- Test: `apps/web/e2e/pwa.spec.ts`

**Interfaces:**
- Consumes: `detectPlatform` (Task 7); ícones em `apps/web/public/icons/` (já no repositório).
- Produces: `/manifest.json`, `/sw.js` (+ `workbox-*.js`), `/offline/`; componente `InstallPrompt.astro` (sem props).

- [ ] **Step 1: Escrever o e2e que falha**

`apps/web/e2e/pwa.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { lessonUrl, lessonsOf } from '../src/lib/urls.ts';
import { pilotCourse } from './support/catalog.ts';

test('the manifest describes an installable app in pt-BR', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');

  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest).toMatchObject({
    name: 'Escola Grátis de Tecnologia',
    short_name: 'Escola Grátis',
    lang: 'pt-BR',
    start_url: '/',
    display: 'standalone',
    shortcuts: [{ name: 'Continuar curso', url: '/continuar/' }],
  });
  expect(manifest.icons).toContainEqual(expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }));
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }
});

test('visited pages open offline and the rest shows the offline page', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright only controls service workers in Chromium');
  const course = await pilotCourse();
  const lesson = lessonsOf(course)[0]!;

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto(lessonUrl(course, lesson));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.frontmatter.title);

  // The deterministic part first: the visited page and the offline page are in the caches.
  const cached = await page.evaluate(async (url) => {
    const visited = await (await caches.open('paginas')).match(url);
    const offline = await caches.match('/offline/index.html', { ignoreSearch: true });
    return { visited: Boolean(visited), offline: Boolean(offline) };
  }, lessonUrl(course, lesson));
  expect(cached).toEqual({ visited: true, offline: true });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.frontmatter.title);

  await page.goto('/eu/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Você está sem internet');
  await context.setOffline(false);
});

test('iPhone users get the Add to Home Screen steps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iPhone only');
  await page.goto('/eu/');
  await expect(page.locator('[data-install]')).toHaveAttribute('data-ready', 'true');

  const button = page.getByRole('button', { name: 'Como instalar no iPhone' });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Adicionar à Tela de Início')).toBeVisible();
});

test('Android users get an install button when the browser allows it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android', 'Android only');
  await page.goto('/eu/');
  await expect(page.locator('[data-install]')).toHaveAttribute('data-ready', 'true');

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        document.body.dataset.prompted = 'true';
        return Promise.resolve();
      },
    });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Instalar app' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-prompted', 'true');
});
```

Run: `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e pwa`
Expected: FAIL — não há manifesto, service worker nem botão de instalar.

Se, depois da implementação, as checagens de cache passarem mas a parte com `setOffline` falhar porque a emulação de rede não chega ao service worker na versão instalada do Playwright, mantenha as checagens de cache, troque a parte offline por `test.fixme` com esse motivo e confira o modo offline à mão no Chrome (DevTools → Application → Service Workers → Offline).

- [ ] **Step 2: Implementar**

```bash
pnpm --filter @egt/web add -D workbox-build@^7.4.1
```

`apps/web/integrations/service-worker.ts`:

```ts
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { generateSW } from 'workbox-build';

/** Generates /sw.js after the build with Workbox; the runtime goes to its own file (ADR 0021). */
export function serviceWorker(): AstroIntegration {
  return {
    name: 'egt-service-worker',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const { count, size, warnings } = await generateSW({
          globDirectory: root,
          // App shell only: styles, scripts, the title font, the mark and the offline page.
          globPatterns: ['_astro/*.{css,js}', 'fonts/*.woff2', 'brand/*.svg', 'offline/index.html'],
          swDest: `${root}/sw.js`,
          mode: 'production',
          sourcemap: false,
          inlineWorkboxRuntime: false,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              // Pages the learner opened stay available offline; others fall back to /offline/.
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'paginas',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 60 },
                precacheFallback: { fallbackURL: '/offline/index.html' },
              },
            },
          ],
        });
        for (const warning of warnings) logger.warn(warning);
        logger.info(`service worker: ${count} files precached (${Math.round(size / 1024)} KB)`);
      },
    },
  };
}
```

Em `apps/web/astro.config.mjs`: `import { serviceWorker } from './integrations/service-worker.ts';` e `integrations: [preact(), serviceWorker()]`.

`apps/web/src/pages/manifest.json.ts`:

```ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: 'Escola Grátis de Tecnologia',
      short_name: 'Escola Grátis',
      description: 'Microcursos grátis de tecnologia, feitos pro celular.',
      lang: 'pt-BR',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        {
          name: 'Continuar curso',
          short_name: 'Continuar',
          url: '/continuar/',
          icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
        },
      ],
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
```

`apps/web/src/scripts/register-sw.ts`:

```ts
// Registers the service worker in production builds only (dev servers have no /sw.js).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
```

Em `apps/web/src/layouts/Base.astro`: no `<head>`, depois do `apple-touch-icon`, `<link rel="manifest" href="/manifest.json" />`; no fim do `<body>`, depois do `<slot />`, `<script src="../scripts/register-sw.ts"></script>`.

`apps/web/src/pages/offline.astro`:

```astro
---
import App from '../layouts/App.astro';
---

<App
  title="Sem internet · Escola Grátis de Tecnologia"
  description="Você está sem internet. As páginas que você já abriu continuam disponíveis."
  noindex
>
  <h1>Você está sem internet</h1>
  <p class="lead">
    As páginas que você já abriu continuam disponíveis. Quando a conexão voltar, é só atualizar.
  </p>
  <p><a href="/">Voltar para o início</a></p>
</App>
```

`apps/web/src/components/InstallPrompt.astro`:

```astro
---
// Hidden until src/scripts/install-prompt.ts decides the browser can install the app.
---

<section class="card install" data-install hidden aria-labelledby="instalar-titulo">
  <h2 id="instalar-titulo">Instale o app</h2>
  <p>Abra a Escola direto da tela inicial, como um aplicativo.</p>
  <button type="button" class="button" data-install-android hidden>Instalar app</button>
  <button
    type="button"
    class="button"
    data-install-ios
    hidden
    aria-expanded="false"
    aria-controls="instalar-iphone"
  >
    Como instalar no iPhone
  </button>
  <ol id="instalar-iphone" class="install-steps" hidden>
    <li>
      Toque em <strong>Compartilhar</strong>
      <svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3v12"></path>
        <path d="m8 7 4-4 4 4"></path>
        <path d="M5 11v9h14v-9"></path>
      </svg>
      na barra do Safari.
    </li>
    <li>Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.</li>
    <li>Toque em <strong>Adicionar</strong>.</li>
  </ol>
</section>

<script src="../scripts/install-prompt.ts"></script>
```

`apps/web/src/scripts/install-prompt.ts`:

```ts
import { detectPlatform } from '../lib/platform.ts';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

// Android: the browser's install prompt. iPhone: the Add to Home Screen steps.
const section = document.querySelector<HTMLElement>('[data-install]');
if (section) {
  const android = section.querySelector<HTMLButtonElement>('[data-install-android]');
  const ios = section.querySelector<HTMLButtonElement>('[data-install-ios]');
  const steps = section.querySelector<HTMLElement>('#instalar-iphone');
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (!standalone && ios && steps && detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === 'ios') {
    section.hidden = false;
    ios.hidden = false;
    ios.addEventListener('click', () => {
      const open = steps.hidden;
      steps.hidden = !open;
      ios.setAttribute('aria-expanded', String(open));
    });
  }

  let deferred: InstallEvent | undefined;
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    if (android) {
      section.hidden = false;
      android.hidden = false;
    }
  });
  android?.addEventListener('click', async () => {
    if (!deferred) return;
    await deferred.prompt();
    deferred = undefined;
    android.hidden = true;
    section.hidden = true;
  });

  section.dataset.ready = 'true';
}
```

Inclua o convite nas duas páginas. Em `apps/web/src/pages/eu.astro` e `apps/web/src/pages/index.astro`, acrescente `import InstallPrompt from '../components/InstallPrompt.astro';` ao frontmatter e `<InstallPrompt />` como último elemento antes de `</App>`. O `eu.astro` fica assim:

```astro
---
import InstallPrompt from '../components/InstallPrompt.astro';
import Island from '../components/Island.astro';
import MyProgress from '../islands/MyProgress.tsx';
import App from '../layouts/App.astro';
import { getCourses } from '../lib/catalog.ts';
import { outlineOf } from '../lib/urls.ts';

const outlines = (await getCourses()).map(outlineOf);
---

<App
  title="Eu · Escola Grátis de Tecnologia"
  description="Seu progresso nos cursos da Escola Grátis de Tecnologia."
  tab="eu"
>
  <h1>Eu</h1>
  <Island name="my-progress" component={MyProgress} props={{ outlines }} />
  <section class="card" aria-labelledby="conta-titulo">
    <h2 id="conta-titulo">Sua conta</h2>
    <p>
      Por enquanto, seu progresso fica salvo só neste aparelho. Em breve, você vai poder entrar com
      sua conta e levar o progresso para qualquer aparelho.
    </p>
  </section>
  <InstallPrompt />
</App>
```

E, no `index.astro` da Task 8, o `<InstallPrompt />` entra logo depois da lista `.points`.

Acrescente ao fim de `apps/web/src/styles/global.css`:

```css
/* Install prompt */

.install {
  margin-top: var(--space-5);
}

.install h2 {
  margin-top: 0;
}

.install-steps {
  margin: var(--space-3) 0 0;
  padding-left: 1.25em;
}

.install-steps li + li {
  margin-top: var(--space-2);
}

.share-icon {
  width: 1.25rem;
  height: 1.25rem;
  vertical-align: -0.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `pnpm lint && pnpm typecheck && pnpm test && SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && ls apps/web/dist/sw.js apps/web/dist/manifest.json apps/web/dist/offline/index.html && pnpm --filter @egt/web check:csp && pnpm --filter @egt/web test:e2e`
Expected: os três arquivos existem; `CSP OK`; testes PASS (o de offline roda só no projeto android).

- [ ] **Step 4: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): app instalável com service worker, atalho e página sem internet"
```

---

### Task 10: Orçamentos no Lighthouse, documentação e fechamento do 1A

**Files:**
- Modify: `apps/web/lighthouserc.json`, `apps/web/CLAUDE.md`, `CLAUDE.md`, `docs/arquitetura/well-architected.md`, `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`, `docs/runbooks/deploy.md`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 9.
- Produces: o PR da Fase 1A pronto para o mantenedor.

- [ ] **Step 1: Lighthouse nas páginas novas**

Em `apps/web/lighthouserc.json`, dentro de `ci.collect`, acrescente a lista de páginas (as aulas ficam fundo demais para a descoberta automática, que para em 2 níveis):

```json
"url": [
  "/index.html",
  "/404.html",
  "/cursos/index.html",
  "/cursos/crie-seu-site-com-ia/index.html",
  "/cursos/crie-seu-site-com-ia/deixe-as-ferramentas-a-mao/index.html",
  "/cursos/crie-seu-site-com-ia/projeto/index.html",
  "/eu/index.html"
]
```

Run: `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web lighthouse`
Expected: todas as asserções passam (≥ 0,95 nas quatro categorias, LCP ≤ 2000 ms, CLS ≤ 0,05). Se alguma página cair, corrija a causa (imagem sem tamanho, contraste, texto de link) em vez de afrouxar a asserção.

- [ ] **Step 2: Documentação**

`apps/web/CLAUDE.md`: troque o primeiro item (**Static-first**) e acrescente os novos padrões:

```md
- **Static-first:** páginas geradas no build, zero JavaScript por padrão. Interação vem de ilhas Preact (`src/islands/`) hidratadas pelo nosso script externo, nunca pela diretiva `client:*` do Astro, que gera script inline bloqueado pela CSP (ADR 0021). Nova ilha: componente em `src/islands/`, entrada em `src/islands/registry.ts`, uso com `<Island name component props />`. A primeira renderização da ilha tem de ser igual à do build: leia o aparelho (`localStorage`, `navigator`) só em `useEffect`.
- **Scripts sem framework:** melhorias pequenas em `src/scripts/*.ts`, incluídas com `<script src="…">` (o Astro gera arquivo externo porque `assetsInlineLimit` é 0). Ao terminar de ligar os eventos, marque `data-ready="true"` no elemento raiz, que os testes esperam.
- **Conteúdo:** as páginas leem `content/` por `getCourses()` (`src/lib/catalog.ts`), que falha o build se o `content:check` falharia. `SITE_DRAFTS=true` mostra cursos em rascunho (local, dev e CI); o deploy de prod usa `false`.
- **Progresso:** só no `localStorage` (`egt:progress:v1`), via `src/lib/progress-store.ts` e as regras de `@egt/core`.
- **Checagens:** `pnpm --filter @egt/web check:csp` depois do build; e2e com `SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build && pnpm --filter @egt/web test:e2e`.
```

`CLAUDE.md` (raiz): na tabela **Mapa do repositório**, acrescente as linhas:

```md
| `packages/content` | Schemas e validação do conteúdo (`pnpm content:check`) | `content/CLAUDE.md` |
| `packages/core`    | Regras puras (progresso, conclusão)                   | —                    |
| `content/`         | Cursos em Markdown e YAML                              | `content/CLAUDE.md`  |
```

e, em **Comandos**, depois de `pnpm lint …`, o item `- pnpm content:check — valida os cursos de content/ (roda na CI)`. Rode `pnpm exec prettier --write CLAUDE.md`.

`docs/arquitetura/well-architected.md`: acrescente uma linha ao fim de cada tabela indicada e rode o Prettier no arquivo:

```md
Excelência operacional:
| Conteúdo validado na CI (`pnpm content:check`) e rascunhos só em dev | feito (Fase 1A) |

Segurança:
| Nenhum script ou estilo inline no HTML (`check:csp` na CI, ADR 0021) | feito (Fase 1A) |

Confiabilidade:
| Páginas visitadas disponíveis offline (service worker) | feito (Fase 1A) |

Eficiência de performance:
| Ilhas Preact sob demanda; JS medido em gzip no e2e | feito (Fase 1A) |
```

`docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`:

- §4.1, tabela do `course.yaml`: na linha de `requirements`, troque o exemplo por "contas grátis necessárias: `google`, `github`, `claude`" e acrescente ao fim da tabela:

  ```md
  | `paidTools` | ferramentas pagas citadas, cada uma com `freeAlternative` |
  | `modules` | lista ordenada `{ id, title }` igual às pastas `NN-slug`; a primeira é `00-preparacao` |
  ```

- §4.1, tabela da aula: a linha de `quiz` passa a dizer "obrigatório: 1–3 perguntas: `question`, `options`, `answer`, `explanation`" e a de `variants`, "(só no módulo 0) passo a passo `{ steps }` por plataforma: `android`, `ios`, `windows`, `mac`, `chromeos`". Logo depois da tabela, acrescente o parágrafo:

  ```md
  A URL da aula é `/cursos/{curso}/{aula}/`, com o nome do arquivo sem o número; ele não se repete no curso, e `projeto` é reservado. Corpo e passos só em Markdown: HTML solto é recusado; exemplos de HTML vão entre crases ou em bloco de código.
  ```

- §4.5: troque "Service worker (Workbox via `@vite-pwa/astro`)" por "Service worker gerado pelo `workbox-build` no fim do build (ADR 0021)".
- §13: depois da lista do `pnpm dev`, acrescente o parágrafo "Cursos em rascunho aparecem quando `SITE_DRAFTS=true` (local, dev e build da CI); o deploy de prod usa `false`."

`docs/runbooks/deploy.md`: no item 2 de "Como funciona", depois de "build e publicação do site", acrescente "(dev mostra os cursos em rascunho, `SITE_DRAFTS=true`; prod mostra só os publicados)".

- [ ] **Step 3: Verificação completa**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm content:check
SITE_ENV=prod SITE_DRAFTS=true SITE_URL=https://escolagratisdetecnologia.com.br pnpm --filter @egt/web build
pnpm --filter @egt/web check:csp && pnpm --filter @egt/web test:e2e && pnpm --filter @egt/web lighthouse
```

Expected: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lighthouserc.json apps/web/CLAUDE.md CLAUDE.md docs
git commit -m "docs: registra a Fase 1A no spec, no Well-Architected e nos guias"
```

- [ ] **Step 5: [mantenedor] PR, deploy e conferência**

1. Abrir o PR da branch no GitHub com o template preenchido (delta de custo: sem impacto na AWS; pilares: segurança, performance, excelência operacional; ADR 0021).
2. Depois do merge, o deploy roda dev e espera a aprovação de prod. Em `https://dev.escolagratisdetecnologia.com`: o curso piloto aparece em Cursos, as aulas funcionam no celular, o app instala. Em `https://escolagratisdetecnologia.com.br`: a identidade nova, as abas e "Os primeiros cursos estão chegando" (o piloto continua em rascunho).
3. Atualizar a memória do projeto: Fase 1A concluída; próximo plano, 1B (API e dados).
