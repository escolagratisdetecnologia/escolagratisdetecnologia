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
