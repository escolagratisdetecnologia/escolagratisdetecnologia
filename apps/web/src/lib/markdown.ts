import { marked } from 'marked';

/** Renders course Markdown; content:check rejects raw HTML, so the output carries no inline code. */
export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false, gfm: true }) as string;
}
