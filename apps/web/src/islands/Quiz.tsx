import type { QuizQuestion } from '@egt/content';
import { recordCorrectAnswer } from '@egt/core';
import { useState } from 'preact/hooks';
import { readProgress } from '../lib/progress-store.ts';
import { saveProgress } from '../lib/progress-sync.ts';

interface Props {
  course: string;
  lesson: string;
  questions: QuizQuestion[];
}

interface Answer {
  selected?: number;
  result?: 'correct' | 'wrong';
}

/** Formative quiz: checks each answer on the spot and remembers the right ones (device and account). */
export default function Quiz({ course, lesson, questions }: Props) {
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({})));
  const update = (index: number, answer: Answer) =>
    setAnswers((current) => current.map((item, position) => (position === index ? answer : item)));

  const check = (index: number) => {
    const question = questions[index];
    const selected = answers[index]?.selected;
    if (!question || selected === undefined) return;
    const correct = selected === question.answer;
    update(index, { selected, result: correct ? 'correct' : 'wrong' });
    if (correct)
      saveProgress(recordCorrectAnswer(readProgress(), course, lesson, index, new Date()), course);
  };

  return (
    <div class="quiz">
      {questions.map((question, index) => {
        const answer = answers[index] ?? {};
        return (
          <fieldset class="quiz-question" key={question.question}>
            <legend>{question.question}</legend>
            {question.options.map((option, optionIndex) => (
              <label class="quiz-option" key={option}>
                <input
                  type="radio"
                  name={`${lesson}-pergunta-${index}`}
                  value={optionIndex}
                  checked={answer.selected === optionIndex}
                  onChange={() => update(index, { selected: optionIndex })}
                />
                <span>{option}</span>
              </label>
            ))}
            <button
              type="button"
              class="button button-secondary"
              disabled={answer.selected === undefined}
              onClick={() => check(index)}
            >
              Conferir
            </button>
            <p
              class={answer.result ? `quiz-feedback is-${answer.result}` : 'quiz-feedback'}
              aria-live="polite"
            >
              {answer.result === 'correct' && `Isso aí! ${question.explanation}`}
              {answer.result === 'wrong' && 'Ainda não. Releia a aula e tente outra opção.'}
            </p>
          </fieldset>
        );
      })}
    </div>
  );
}
