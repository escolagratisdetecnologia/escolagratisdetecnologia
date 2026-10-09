import { describe, expect, it } from 'vitest';
import { ptBrErrors } from '../src/messages.ts';
import { courseMetaSchema, lessonFrontmatterSchema } from '../src/schema.ts';

const messages = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => result.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];

const lesson = {
  title: 'Boas-vindas',
  summary: 'O que você vai fazer neste curso.',
  quiz: [
    { question: 'Quanto custa?', options: ['Nada', 'R$ 10'], answer: 0, explanation: 'É grátis.' },
  ],
};

describe('lessonFrontmatterSchema', () => {
  it('accepts a minimal lesson', () => {
    expect(lessonFrontmatterSchema.safeParse(lesson).success).toBe(true);
  });

  it('rejects an answer that points to a missing option', () => {
    const result = lessonFrontmatterSchema.safeParse(
      { ...lesson, quiz: [{ ...lesson.quiz[0], answer: 2 }] },
      { error: ptBrErrors },
    );
    expect(messages(result)).toEqual([
      'quiz.0.answer: answer aponta para uma opção que não existe (conte a partir de 0)',
    ]);
  });

  it('keeps lessons between 2 and 5 minutes', () => {
    const result = lessonFrontmatterSchema.safeParse(
      { ...lesson, video: { id: 'aula-curta', durationSec: 60 } },
      { error: ptBrErrors },
    );
    expect(messages(result)).toEqual([
      'video.durationSec: aulas têm de 2 a 5 minutos (120 a 300 segundos)',
    ]);
  });

  it('explains unknown fields and missing ones in pt-BR', () => {
    const { summary: _summary, ...withoutSummary } = lesson;
    const result = lessonFrontmatterSchema.safeParse(
      { ...withoutSummary, titulo: 'x' },
      { error: ptBrErrors },
    );
    expect(messages(result)).toEqual(
      expect.arrayContaining(['summary: campo obrigatório', ': campo desconhecido: titulo']),
    );
  });
});

describe('courseMetaSchema', () => {
  const meta = {
    title: 'Curso',
    outcome: 'Você sai com: um site no ar',
    level: 'iniciante',
    durationMin: 45,
    devices: ['celular'],
    cost: 0,
    skills: ['Publicar sites'],
    status: 'draft',
    modules: [
      { id: '00-preparacao', title: 'Prepare seu ambiente' },
      { id: '01-mao-na-massa', title: 'Mão na massa' },
    ],
  };

  it('fills optional lists with empty defaults', () => {
    const result = courseMetaSchema.parse(meta);
    expect(result).toMatchObject({ paidTools: [], requirements: [], hosts: [] });
  });

  it('requires the outcome to start with "Você sai com: "', () => {
    const result = courseMetaSchema.safeParse(
      { ...meta, outcome: 'Um site no ar' },
      { error: ptBrErrors },
    );
    expect(messages(result)).toEqual([
      'outcome: comece com "Você sai com: " e diga o resultado concreto do curso',
    ]);
  });

  it('only accepts courses that cost nothing', () => {
    const result = courseMetaSchema.safeParse({ ...meta, cost: 10 }, { error: ptBrErrors });
    expect(messages(result)).toEqual([
      'cost: o curso precisa custar R$ 0; ferramenta paga vai em paidTools, com alternativa grátis',
    ]);
  });

  it('lists the allowed values of an enum', () => {
    const result = courseMetaSchema.safeParse(
      { ...meta, level: 'avancado' },
      { error: ptBrErrors },
    );
    expect(messages(result)).toEqual(['level: valor inválido: use "iniciante" ou "intermediario"']);
  });
});
