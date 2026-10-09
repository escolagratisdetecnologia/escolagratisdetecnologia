import type { Course, Lesson } from '@egt/content';
import type { CourseOutline } from '@egt/core';

export const courseUrl = (course: Course): string => `/cursos/${course.slug}/`;
export const lessonUrl = (course: Course, lesson: Lesson): string =>
  `/cursos/${course.slug}/${lesson.slug}/`;
export const projectUrl = (course: Course): string => `/cursos/${course.slug}/projeto/`;
export const lessonsOf = (course: Course): Lesson[] =>
  course.modules.flatMap((module) => module.lessons);

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
