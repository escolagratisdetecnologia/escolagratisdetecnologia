import path from 'node:path';
import { marked } from 'marked';
import type { Course, Problem } from './load.ts';
import type { Cast } from './schema.ts';

const HTML_MESSAGE =
  'use Markdown: HTML fora de código não é permitido (exemplos de HTML vão entre crases ou em bloco de código; a CSP do site bloqueia estilos e scripts inline)';

/** True when the Markdown contains raw HTML as the site's renderer (marked) sees it; code and autolinks are not HTML. */
function containsHtml(markdown: string): boolean {
  let found = false;
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type === 'html') found = true;
  });
  return found;
}

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
    if (module.lessons.length === 0)
      report(path.join(course.dir, module.id), 'o módulo precisa de pelo menos uma aula');
    for (const lesson of module.lessons) {
      if (lesson.slug === 'projeto')
        report(lesson.file, '"projeto" é reservado para o projeto final; escolha outro nome');
      if (slugs.has(lesson.slug))
        report(lesson.file, `já existe outra aula "${lesson.slug}" neste curso`);
      slugs.add(lesson.slug);

      const { variants, captions, video } = lesson.frontmatter;
      if (variants) {
        if (module.number !== 0)
          report(lesson.file, 'variants só pode aparecer no módulo 00-preparacao');
        if (Object.keys(variants).length < 2)
          report(lesson.file, 'variants precisa de pelo menos duas plataformas');
      }
      if (captions && !module.captions.includes(captions))
        report(lesson.file, `legenda não encontrada: ${captions}`);
      if (course.meta.status === 'published') {
        if (!video) report(lesson.file, 'curso publicado: toda aula precisa de vídeo');
        if (!captions)
          report(
            lesson.file,
            'curso publicado: toda aula precisa de legenda em português (captions)',
          );
      }
      if (lesson.body.length === 0)
        report(lesson.file, 'escreva o roteiro ou a transcrição no corpo da aula');
      const texts = [lesson.body, ...Object.values(variants ?? {}).map((variant) => variant.steps)];
      if (texts.some((text) => containsHtml(text))) report(lesson.file, HTML_MESSAGE);
    }
  }

  const { project } = course;
  const total = project.frontmatter.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (total !== 100) report(project.file, `os pesos da rubrica somam ${total}; precisam somar 100`);
  const ids = project.frontmatter.criteria.map((criterion) => criterion.id);
  if (new Set(ids).size !== ids.length) report(project.file, 'há critérios com o mesmo id');
  if (project.body.length === 0)
    report(project.file, 'descreva o cenário do projeto no corpo do arquivo');
  if (containsHtml(project.body)) report(project.file, HTML_MESSAGE);

  const hosts = new Set(cast.hosts.map((host) => host.id));
  for (const host of course.meta.hosts) {
    if (!hosts.has(host))
      report(courseFile, `apresentador desconhecido: ${host} (cadastre em content/cast.yaml)`);
  }
  return problems;
}
