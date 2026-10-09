// Fails when a course with status "draft" was built into dist (prod must never show drafts).
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from '@egt/content';
import { leakedDrafts } from '../src/lib/drafts-guard.ts';

const dist = path.resolve(import.meta.dirname, '../dist');
const content = path.resolve(import.meta.dirname, '../../../content');

let folders: string[];
try {
  folders = await readdir(path.join(dist, 'cursos'));
} catch {
  console.error('Não encontrei apps/web/dist/cursos: rode o build antes.');
  process.exit(2);
}

const { catalog } = await loadCatalog(content);
const courses = catalog.courses.map((course) => ({
  slug: course.slug,
  status: course.meta.status,
}));
const leaked = leakedDrafts(courses, folders);

if (leaked.length > 0) {
  console.log(`Cursos em rascunho publicados no build: ${leaked.join(', ')}.`);
  console.log('Faça o build de prod com SITE_DRAFTS=false.');
  process.exit(1);
}
console.log('Rascunhos OK: nenhum curso em rascunho foi publicado.');
