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
  const cast = (castData === undefined
    ? undefined
    : validate(castSchema, castData, castFile, problems)) ?? {
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
        message:
          'nome de pasta inválido: use letras minúsculas, números e hífens (ex.: crie-seu-site-com-ia)',
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

async function loadCourse(
  dir: string,
  slug: string,
  problems: Problem[],
): Promise<Course | undefined> {
  const metaFile = path.join(dir, 'course.yaml');
  const metaData = await readYaml(metaFile, problems);
  const meta =
    metaData === undefined ? undefined : validate(courseMetaSchema, metaData, metaFile, problems);

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
    const match =
      entry.isFile() && entry.name.endsWith('.md') ? NUMBERED.exec(entry.name.slice(0, -3)) : null;
    if (!match) {
      problems.push({ file, message: 'esperado aulas como 01-nome-da-aula.md ou legendas .vtt' });
      continue;
    }
    // Numbering is checked on file names, so an invalid lesson does not shift the ones after it.
    position += 1;
    if (Number(match[1]) !== position) {
      problems.push({
        file,
        message: `numeração fora de ordem: esperado ${String(position).padStart(2, '0')}`,
      });
    }
    const source = await readText(file, problems);
    const parsed =
      source === undefined
        ? undefined
        : parseMarkdown(source, file, lessonFrontmatterSchema, problems);
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
