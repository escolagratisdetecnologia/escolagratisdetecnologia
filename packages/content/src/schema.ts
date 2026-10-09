import * as z from 'zod';

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODULE_ID = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PLATFORMS = ['android', 'ios', 'windows', 'mac', 'chromeos'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABELS: Record<Platform, string> = {
  android: 'Android',
  ios: 'iPhone',
  windows: 'Windows',
  mac: 'Mac',
  chromeos: 'Chromebook',
};

export const LEVELS = ['iniciante', 'intermediario'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = {
  iniciante: 'iniciante',
  intermediario: 'intermediário',
};

export const DEVICES = ['celular', 'computador'] as const;
export type Device = (typeof DEVICES)[number];

export const REQUIREMENTS = ['google', 'github', 'claude'] as const;
export type Requirement = (typeof REQUIREMENTS)[number];
export const REQUIREMENT_LABELS: Record<Requirement, string> = {
  google: 'conta Google',
  github: 'conta no GitHub',
  claude: 'conta no Claude.ai',
};

export const DELIVERABLES = ['url', 'github', 'images', 'text'] as const;
export type Deliverable = (typeof DELIVERABLES)[number];
export const DELIVERABLE_LABELS: Record<Deliverable, string> = {
  url: 'Link do site no ar',
  github: 'Repositório no GitHub',
  images: 'Imagens (prints da tela)',
  text: 'Texto contando o que você fez',
};

const slug = z.string().regex(SLUG, { error: 'use letras minúsculas, números e hífens' });
const lessonLength = { error: 'aulas têm de 2 a 5 minutos (120 a 300 segundos)' };

export const courseMetaSchema = z.strictObject({
  title: z.string().min(3).max(80),
  outcome: z.string().regex(/^Você sai com: \S.{3,}$/, {
    error: 'comece com "Você sai com: " e diga o resultado concreto do curso',
  }),
  level: z.enum(LEVELS),
  durationMin: z.number().int().min(30).max(90),
  devices: z.array(z.enum(DEVICES)).min(1),
  cost: z.literal(0, {
    error: 'o curso precisa custar R$ 0; ferramenta paga vai em paidTools, com alternativa grátis',
  }),
  paidTools: z
    .array(z.strictObject({ name: z.string().min(2), freeAlternative: z.string().min(2) }))
    .default([]),
  requirements: z.array(z.enum(REQUIREMENTS)).default([]),
  skills: z.array(z.string().min(3)).min(1),
  hosts: z.array(slug).default([]),
  status: z.enum(['draft', 'published']),
  modules: z
    .array(
      z.strictObject({
        id: z
          .string()
          .regex(MODULE_ID, { error: 'use o nome da pasta do módulo, como 01-nome-do-modulo' }),
        title: z.string().min(3).max(60),
      }),
    )
    .min(2, { error: 'o curso precisa do módulo 00-preparacao e de pelo menos mais um' }),
});

const quizQuestionSchema = z
  .strictObject({
    question: z.string().min(5),
    options: z.array(z.string().min(1)).min(2).max(4),
    answer: z.number().int().min(0),
    explanation: z.string().min(5),
  })
  .refine((question) => question.answer < question.options.length, {
    error: 'answer aponta para uma opção que não existe (conte a partir de 0)',
    path: ['answer'],
  });

export const lessonFrontmatterSchema = z.strictObject({
  title: z.string().min(3).max(80),
  summary: z.string().min(10).max(140),
  video: z
    .strictObject({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/, { error: 'id de vídeo inválido' }),
      durationSec: z.number().int().min(120, lessonLength).max(300, lessonLength),
    })
    .optional(),
  captions: z
    .string()
    .regex(/^[a-z0-9-]+\.vtt$/, { error: 'informe o nome do arquivo .vtt da pasta do módulo' })
    .optional(),
  variants: z
    .partialRecord(z.enum(PLATFORMS), z.strictObject({ steps: z.string().min(10) }))
    .optional(),
  quiz: z.array(quizQuestionSchema).min(1).max(3),
  checkpoint: z.array(z.string().min(3)).min(1).optional(),
});

export const projectFrontmatterSchema = z.strictObject({
  title: z.string().min(3).max(80),
  deliverables: z.array(z.enum(DELIVERABLES)).min(1),
  criteria: z
    .array(
      z.strictObject({
        id: slug,
        description: z.string().min(5),
        weight: z.number().int().min(1).max(100),
        required: z.boolean(),
      }),
    )
    .min(1),
  passScore: z.number().int().min(0).max(100),
});

export const castSchema = z.strictObject({
  hosts: z.array(z.strictObject({ id: slug, name: z.string().min(2) })),
});

export type CourseMeta = z.output<typeof courseMetaSchema>;
export type LessonFrontmatter = z.output<typeof lessonFrontmatterSchema>;
export type QuizQuestion = LessonFrontmatter['quiz'][number];
export type ProjectFrontmatter = z.output<typeof projectFrontmatterSchema>;
export type Cast = z.output<typeof castSchema>;
