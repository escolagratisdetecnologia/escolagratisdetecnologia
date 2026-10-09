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
