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
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfter = useRef<'trigger' | 'heading' | undefined>(undefined);

  useEffect(() => setProgress(readProgress()), []);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (focusAfter.current === 'trigger') trigger.current?.focus();
    if (focusAfter.current === 'heading') heading.current?.focus();
    focusAfter.current = undefined;
  });

  // Same shape as the empty state below, so hydration does not move the page.
  if (!progress)
    return (
      <div class="my-progress">
        <h2>Seus cursos</h2>
        <p class="my-progress-note">Seu progresso neste aparelho aparece aqui.</p>
        <p class="status" role="status" />
      </div>
    );

  const started = outlines
    .map((outline) => ({ outline, status: courseStatus(outline, progress.courses[outline.slug]) }))
    .filter(({ status }) => status.started);

  const clear = () => {
    clearProgress();
    setProgress(emptyProgress());
    setConfirming(false);
    setCleared(true);
    focusAfter.current = 'heading';
  };

  return (
    <div class="my-progress">
      <h2 ref={heading} tabIndex={-1}>
        Seus cursos
      </h2>
      {started.length === 0 ? (
        <p class="my-progress-note">
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
              <a
                class="button button-secondary"
                href={status.next.url}
                aria-label={`Continuar ${outline.title}`}
              >
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
          ref={trigger}
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
              onClick={() => {
                focusAfter.current = 'trigger';
                setConfirming(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
