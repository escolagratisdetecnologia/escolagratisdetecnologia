import { describe, expect, it } from 'vitest';
import { nextPath, signUpUrl } from './sign-in.ts';

describe('nextPath', () => {
  it('keeps paths of this site', () => {
    expect(nextPath('?next=/cursos/crie-seu-site-com-ia/')).toBe('/cursos/crie-seu-site-com-ia/');
    expect(nextPath('?next=%2Feu%2F')).toBe('/eu/');
  });

  it('falls back to the Eu tab for anything else', () => {
    for (const search of [
      '',
      '?next=',
      '?next=//evil.example',
      '?next=https://evil.example',
      '?next=/eu/?x=1',
      '?next=/../x',
      `?next=/${'a'.repeat(200)}`,
    ]) {
      expect(nextPath(search)).toBe('/eu/');
    }
  });
});

describe('signUpUrl', () => {
  it('keeps where to go after sign-up', () => {
    expect(signUpUrl('/cursos/')).toBe('/entrar/cadastro/?next=%2Fcursos%2F');
  });
});
