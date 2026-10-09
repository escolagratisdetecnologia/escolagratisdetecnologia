import type * as z from 'zod';

const TYPE_NAMES: Record<string, string> = {
  string: 'texto',
  number: 'número',
  boolean: 'verdadeiro ou falso (true/false)',
  array: 'lista',
  object: 'objeto',
};
const UNITS: Record<string, string> = { string: 'caracteres', array: 'itens' };

/** pt-BR messages for content authors (zod's bundled "pt" locale is European Portuguese). */
export const ptBrErrors: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined
        ? 'campo obrigatório'
        : `tipo inválido: esperado ${TYPE_NAMES[issue.expected] ?? issue.expected}`;
    case 'too_small':
      return issue.origin === 'number'
        ? `precisa ser no mínimo ${issue.minimum}`
        : `precisa ter no mínimo ${issue.minimum} ${UNITS[issue.origin] ?? 'itens'}`;
    case 'too_big':
      return issue.origin === 'number'
        ? `precisa ser no máximo ${issue.maximum}`
        : `precisa ter no máximo ${issue.maximum} ${UNITS[issue.origin] ?? 'itens'}`;
    case 'invalid_value':
      return `valor inválido: use ${issue.values.map((value) => JSON.stringify(value)).join(' ou ')}`;
    case 'invalid_format':
      return 'formato inválido';
    case 'unrecognized_keys':
      return `campo desconhecido: ${issue.keys.join(', ')}`;
    case 'invalid_key':
      return 'chave inválida';
    default:
      return undefined;
  }
};
