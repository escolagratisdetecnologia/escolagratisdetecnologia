import { courseStatus, mostRecentCourse, type CourseOutline, type Progress } from '@egt/core';
import { useEffect, useState } from 'preact/hooks';
import { readProgress } from '../lib/progress-store.ts';

interface Props {
  outlines: CourseOutline[];
}

/**
 * Home call to action. Same structure before and after the progress is read, so a returning
 * learner sees the button text change in place instead of the page jumping.
 */
export default function HomeAction({ outlines }: Props) {
  const [progress, setProgress] = useState<Progress | undefined>(undefined);
  useEffect(() => setProgress(readProgress()), []);

  const outline = progress ? mostRecentCourse(progress, outlines) : undefined;
  const status =
    progress && outline ? courseStatus(outline, progress.courses[outline.slug]) : undefined;

  return (
    <div class="home-action">
      {outline && status ? (
        <>
          <a class="button" href={status.next.url}>
            Continuar de onde parou
          </a>
          <p class="home-action-note">
            {outline.title}: {status.done} de {status.total} aulas concluídas
          </p>
        </>
      ) : (
        <>
          <a class="button" href="/cursos/">
            Ver os cursos
          </a>
          <p class="home-action-note">Escolha um curso e comece agora, sem criar conta.</p>
        </>
      )}
    </div>
  );
}
