import { parse } from 'yaml';

export type FrontmatterResult =
  | { ok: true; data: unknown; body: string }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'yaml'; detail: string };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

/** Splits a Markdown file into its YAML frontmatter and its body; never throws. */
export function parseFrontmatter(source: string): FrontmatterResult {
  const match = FRONTMATTER.exec(source);
  if (!match) return { ok: false, reason: 'missing' };
  try {
    return { ok: true, data: parse(match[1] ?? '') as unknown, body: (match[2] ?? '').trim() };
  } catch (error) {
    return { ok: false, reason: 'yaml', detail: (error as Error).message };
  }
}
