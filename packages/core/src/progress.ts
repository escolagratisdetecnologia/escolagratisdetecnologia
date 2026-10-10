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
  const current = progress.courses[course] ?? {
    completedLessons: [],
    correctAnswers: [],
    updatedAt: now.toISOString(),
  };
  return {
    ...progress,
    courses: {
      ...progress.courses,
      [course]: { ...current, ...change(current), updatedAt: now.toISOString() },
    },
  };
}

/**
 * What progress may hold: for each course, its lessons and how many quiz questions each one has.
 * Built from content/ (the API embeds it at build time).
 */
export type ProgressCatalog = Record<string, Record<string, number>>;

const ANSWER = /^(.+)#(\d{1,3})$/;

const lessonsOf = (catalog: ProgressCatalog, course: string) =>
  Object.hasOwn(catalog, course) ? catalog[course] : undefined;

export function isKnownLesson(catalog: ProgressCatalog, course: string, lesson: string): boolean {
  const lessons = lessonsOf(catalog, course);
  return lessons !== undefined && Object.hasOwn(lessons, lesson);
}

/**
 * Keeps only courses, lessons and quiz answers the catalog knows. Renamed or removed content and
 * junk sent by a client are dropped, which also bounds how much a learner can store.
 */
export function keepKnownProgress(
  courses: Record<string, CourseProgress>,
  catalog: ProgressCatalog,
): Record<string, CourseProgress> {
  const known: Record<string, CourseProgress> = {};
  for (const [slug, course] of Object.entries(courses)) {
    const lessons = lessonsOf(catalog, slug);
    if (lessons === undefined) continue;
    const isLesson = (lesson: string) => Object.hasOwn(lessons, lesson);
    known[slug] = {
      completedLessons: course.completedLessons.filter(isLesson),
      correctAnswers: course.correctAnswers.filter((answer) => {
        const match = ANSWER.exec(answer);
        return match !== null && isLesson(match[1]!) && Number(match[2]) < lessons[match[1]!]!;
      }),
      ...(course.lastLesson !== undefined && isLesson(course.lastLesson)
        ? { lastLesson: course.lastLesson }
        : {}),
      updatedAt: course.updatedAt,
    };
  }
  return known;
}

export function visitLesson(
  progress: Progress,
  course: string,
  lesson: string,
  now: Date,
): Progress {
  return update(progress, course, now, () => ({ lastLesson: lesson }));
}

export function completeLesson(
  progress: Progress,
  course: string,
  lesson: string,
  now: Date,
): Progress {
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

export function courseStatus(
  outline: CourseOutline,
  progress: CourseProgress | undefined,
): CourseStatus {
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
    next: pending
      ? { title: pending.title, url: pending.url }
      : { title: 'Projeto final', url: outline.projectUrl },
  };
}

/** The known course the learner touched most recently ("Continue de onde parou"). */
export function mostRecentCourse(
  progress: Progress,
  outlines: CourseOutline[],
): CourseOutline | undefined {
  let best: { outline: CourseOutline; updatedAt: string } | undefined;
  for (const outline of outlines) {
    const course = progress.courses[outline.slug];
    if (course && (!best || course.updatedAt > best.updatedAt))
      best = { outline, updatedAt: course.updatedAt };
  }
  return best?.outline;
}
