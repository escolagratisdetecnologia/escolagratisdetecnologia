import type { Course } from '@egt/content';

/** Published courses always; drafts only in builds that show them (local, dev and CI). */
export function visibleCourses(courses: Course[], showDrafts: boolean): Course[] {
  return courses.filter((course) => course.meta.status === 'published' || showDrafts);
}
