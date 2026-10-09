import { courseStatus, type CourseOutline, type CourseProgress as StoredProgress } from '@egt/core';
import { useEffect, useState } from 'preact/hooks';
import { readProgress } from '../lib/progress-store.ts';

interface Props {
  outline: CourseOutline;
}

/** Course page: start or continue button and the lesson list, with what is done on this device. */
export default function CourseProgress({ outline }: Props) {
  // Starts empty so the first render matches the build-time HTML; the effect then reads the device.
  const [progress, setProgress] = useState<StoredProgress | undefined>(undefined);
  useEffect(() => setProgress(readProgress().courses[outline.slug]), [outline.slug]);

  const status = courseStatus(outline, progress);
  const done = new Set(progress?.completedLessons ?? []);

  return (
    <div class="course-progress">
      {status.started ? (
        <>
          <p class="progress-label">
            {status.done} de {status.total} aulas concluídas
          </p>
          <progress aria-label="Seu progresso no curso" max={status.total} value={status.done} />
          <a class="button button-block" href={status.next.url}>
            {status.finished ? 'Ver o projeto final' : 'Continuar'}
          </a>
        </>
      ) : (
        <a class="button button-block" href={status.next.url}>
          Bora começar
        </a>
      )}
      <h2 id="conteudo-do-curso">O que tem no curso</h2>
      <ol class="modules">
        {outline.modules.map((module) => (
          <li key={module.title}>
            <h3>{module.title}</h3>
            <ol class="lessons">
              {module.lessons.map((lesson) => (
                <li
                  key={lesson.slug}
                  class={done.has(lesson.slug) ? 'lesson-item is-done' : 'lesson-item'}
                >
                  <a href={lesson.url}>{lesson.title}</a>
                  {done.has(lesson.slug) && <span class="done-badge">concluída</span>}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <p class="project-link">
        <a href={outline.projectUrl}>Projeto final: {outline.projectTitle}</a>
      </p>
    </div>
  );
}
