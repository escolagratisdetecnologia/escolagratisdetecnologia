import { courseStatus, emptyProgress, type CourseOutline, type Progress } from '@egt/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clearProgress, readProgress } from '../lib/progress-store.ts';

interface Props {
  outlines: CourseOutline[];
}

/** Eu tab: courses in progress on this device, with a confirmed way to clear them. */
export default function MyProgress({ outlines }: Props) {
  const [progress, setProgress] = useState<Progress | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => setProgress(readProgress()), []);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  if (!progress) return <p class="lead">Carregando seu progresso…</p>;

  const started = outlines
    .map((outline) => ({ outline, status: courseStatus(outline, progress.courses[outline.slug]) }))
    .filter(({ status }) => status.started);

  const clear = () => {
    clearProgress();
    setProgress(emptyProgress());
    setConfirming(false);
    setCleared(true);
  };

  return (
    <div class="my-progress">
      <h2>Seus cursos</h2>
      {started.length === 0 ? (
        <p>
          Você ainda não começou nenhum curso. <a href="/cursos/">Ver os cursos</a>
        </p>
      ) : (
        <ul class="my-courses">
          {started.map(({ outline, status }) => (
            <li key={outline.slug} class="card">
              <a class="my-course-title" href={outline.url}>
                {outline.title}
              </a>
              <p class="progress-label">
                {status.done} de {status.total} aulas concluídas
              </p>
              <progress
                aria-label={`Seu progresso em ${outline.title}`}
                max={status.total}
                value={status.done}
              />
              <a class="button button-secondary" href={status.next.url}>
                Continuar
              </a>
            </li>
          ))}
        </ul>
      )}
      <p class="status" role="status">
        {cleared ? 'Progresso apagado.' : ''}
      </p>
      {started.length > 0 && !confirming && (
        <button
          type="button"
          class="button button-secondary"
          onClick={() => {
            setCleared(false);
            setConfirming(true);
          }}
        >
          Apagar meu progresso deste aparelho
        </button>
      )}
      {confirming && (
        <div class="confirm" role="group" aria-labelledby="apagar-pergunta">
          <p id="apagar-pergunta">
            Isso apaga o progresso de todos os cursos neste aparelho. Quer mesmo apagar?
          </p>
          <div class="confirm-actions">
            <button type="button" class="button button-danger" ref={confirmButton} onClick={clear}>
              Apagar progresso
            </button>
            <button
              type="button"
              class="button button-secondary"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
