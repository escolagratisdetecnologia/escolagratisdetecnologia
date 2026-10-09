import { courseStatus, mostRecentCourse, type CourseOutline, type Progress } from '@egt/core';
import { useEffect, useState } from 'preact/hooks';
import { readProgress } from '../lib/progress-store.ts';

interface Props {
  outlines: CourseOutline[];
}

/** Home: "Continue de onde parou" for the course touched most recently on this device. */
export default function ContinueCard({ outlines }: Props) {
  const [progress, setProgress] = useState<Progress | undefined>(undefined);
  useEffect(() => setProgress(readProgress()), []);

  const outline = progress ? mostRecentCourse(progress, outlines) : undefined;
  if (!progress || !outline) return null;
  const status = courseStatus(outline, progress.courses[outline.slug]);

  return (
    <section class="card continue" aria-labelledby="continue-titulo">
      <h2 id="continue-titulo">Continue de onde parou</h2>
      <p class="continue-course">{outline.title}</p>
      <p class="progress-label">
        {status.done} de {status.total} aulas concluídas
      </p>
      <progress
        aria-label={`Seu progresso em ${outline.title}`}
        max={status.total}
        value={status.done}
      />
      <a class="button" href={status.next.url}>
        Continuar
      </a>
    </section>
  );
}
