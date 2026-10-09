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
    expect(
      course?.modules.flatMap((module) => module.lessons.map((lesson) => lesson.slug)),
    ).toEqual(['boas-vindas', 'no-seu-aparelho', 'primeiro-passo']);
    expect(course?.modules[1]?.captions).toEqual(['01-primeiro-passo.vtt']);
    expect(course?.modules[0]?.lessons[0]?.body).toBe('Olá! Este é o roteiro da aula.');
    expect(course?.project.frontmatter.passScore).toBe(70);
    expect(catalog.cast.hosts.map((host) => host.id)).toEqual(['ana']);
  });

  it('points schema problems to the file and field', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/00-preparacao/01-boas-vindas.md`, (s) =>
        s.replace('answer: 0', 'answer: 5'),
      ),
    );
    expect(problems).toEqual([
      `${COURSE}/00-preparacao/01-boas-vindas.md: quiz.0.answer: answer aponta para uma opção que não existe (conte a partir de 0)`,
    ]);
  });

  it('reports invalid YAML in course.yaml', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/course.yaml`, (s) => `${s}\ntitle: [aberto\n`),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(new RegExp(`^${COURSE}/course.yaml: YAML inválido: `));
  });

  it('requires the preparation module first', async () => {
    const problems = await problemsAfter(async (dir) => {
      await remove(dir, `${COURSE}/00-preparacao`);
      await edit(dir, `${COURSE}/course.yaml`, (s) =>
        s
          .replace('  - id: 00-preparacao\n    title: Prepare seu ambiente\n', '')
          .replace('modules:\n', 'modules:\n  - id: 02-extra\n    title: Extra\n'),
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
        s.replace(
          'quiz:',
          'variants:\n  android:\n    steps: Abra o Chrome e siga.\n  ios:\n    steps: Abra o Safari e siga.\nquiz:',
        ),
      ),
    );
    expect(problems).toEqual([
      `${COURSE}/01-mao-na-massa/01-primeiro-passo.md: variants só pode aparecer no módulo 00-preparacao`,
    ]);
  });

  it('checks that declared captions exist', async () => {
    const problems = await problemsAfter((dir) =>
      remove(dir, `${COURSE}/01-mao-na-massa/01-primeiro-passo.vtt`),
    );
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
      `${COURSE}/00-preparacao/01-boas-vindas.md: use Markdown: HTML fora de código não é permitido (exemplos de HTML vão entre crases ou em bloco de código; a CSP do site bloqueia estilos e scripts inline)`,
    ]);
  });

  it('accepts HTML examples inside code', async () => {
    const problems = await problemsAfter((dir) =>
      edit(
        dir,
        `${COURSE}/00-preparacao/01-boas-vindas.md`,
        (s) =>
          `${s}\n\`\`\`html\n<a href="https://wa.me/5511999999999">Chamar no WhatsApp</a>\n\`\`\`\n\nUse a tag \`<strong>\` para negrito.\n`,
      ),
    );
    expect(problems).toEqual([]);
  });

  it('accepts Markdown autolinks', async () => {
    const problems = await problemsAfter((dir) =>
      edit(
        dir,
        `${COURSE}/00-preparacao/01-boas-vindas.md`,
        (s) => `${s}\nVeja <https://github.com> para criar sua conta.\n`,
      ),
    );
    expect(problems).toEqual([]);
  });

  it('still rejects HTML in platform steps', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/00-preparacao/02-no-seu-aparelho.md`, (s) =>
        s.replace('1. Abra o Chrome.', '1. Abra o <b>Chrome</b>.'),
      ),
    );
    expect(problems).toEqual([
      `${COURSE}/00-preparacao/02-no-seu-aparelho.md: use Markdown: HTML fora de código não é permitido (exemplos de HTML vão entre crases ou em bloco de código; a CSP do site bloqueia estilos e scripts inline)`,
    ]);
  });

  it('requires rubric weights that add up to 100', async () => {
    const problems = await problemsAfter((dir) =>
      edit(dir, `${COURSE}/projeto.md`, (s) => s.replace('weight: 40', 'weight: 30')),
    );
    expect(problems).toEqual([
      `${COURSE}/projeto.md: os pesos da rubrica somam 90; precisam somar 100`,
    ]);
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
    const problems = await problemsAfter((dir) =>
      writeFile(path.join(dir, COURSE, 'notas.txt'), 'x'),
    );
    expect(problems).toEqual([
      `${COURSE}/notas.txt: esperado course.yaml, projeto.md ou pastas de módulo como 01-nome-do-modulo`,
    ]);
  });
});
