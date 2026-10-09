import { describe, expect, it } from 'vitest';
import {
  capitalize,
  devicesText,
  listText,
  outcomeResult,
  requirementsText,
} from './course-text.ts';

describe('course text', () => {
  it('joins lists the Brazilian way', () => {
    expect(listText([])).toBe('');
    expect(listText(['a'])).toBe('a');
    expect(listText(['a', 'b'])).toBe('a e b');
    expect(listText(['a', 'b', 'c'])).toBe('a, b e c');
  });

  it('describes devices and free accounts', () => {
    expect(devicesText(['celular', 'computador'])).toBe('celular ou computador');
    expect(requirementsText(['github', 'claude'])).toBe('conta no GitHub e conta no Claude.ai');
  });

  it('extracts the result from the outcome and capitalizes', () => {
    expect(outcomeResult('Você sai com: um site no ar')).toBe('um site no ar');
    expect(capitalize('celular ou computador')).toBe('Celular ou computador');
  });
});
