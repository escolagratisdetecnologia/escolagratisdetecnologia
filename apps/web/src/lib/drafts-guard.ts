/** Slugs of draft courses that ended up in the build output (a prod build must have none). */
export function leakedDrafts(
  courses: { slug: string; status: string }[],
  builtFolders: string[],
): string[] {
  return courses
    .filter((course) => course.status === 'draft' && builtFolders.includes(course.slug))
    .map((course) => course.slug);
}
