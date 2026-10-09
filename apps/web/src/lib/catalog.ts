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
      throw new Error(
        `Content has ${problems.length} problem(s); run "pnpm content:check".\n${details}`,
      );
    }
    return visibleCourses(catalog.courses, SITE_DRAFTS);
  });
  return courses;
}
