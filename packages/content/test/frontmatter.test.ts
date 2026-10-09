import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../src/frontmatter.ts';

describe('parseFrontmatter', () => {
  it('splits YAML data from the Markdown body', () => {
    expect(parseFrontmatter('---\ntitle: Oi\n---\n\nCorpo da aula.\n')).toEqual({
      ok: true,
      data: { title: 'Oi' },
      body: 'Corpo da aula.',
    });
  });

  it('reports a file without frontmatter', () => {
    expect(parseFrontmatter('Só texto')).toEqual({ ok: false, reason: 'missing' });
  });

  it('reports invalid YAML with the parser detail', () => {
    const result = parseFrontmatter('---\ntitle: [aberto\n---\nCorpo');
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'yaml' });
  });
});
