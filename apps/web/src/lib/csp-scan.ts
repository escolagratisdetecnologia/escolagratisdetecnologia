export interface InlineCode {
  kind: 'script' | 'style' | 'style-attribute' | 'event-handler';
  snippet: string;
}

const PATTERNS: [InlineCode['kind'], RegExp][] = [
  ['script', /<script\b(?![^>]*\bsrc=)[^>]*>/gi],
  ['style', /<style\b[^>]*>/gi],
  ['style-attribute', /<[a-z][^>]*\sstyle=["'][^>]*>/gi],
  ['event-handler', /<[a-z][^>]*\son[a-z]+=["'][^>]*>/gi],
];

/** Inline code the CloudFront CSP would block (script-src and style-src are 'self' only). */
export function findInlineCode(html: string): InlineCode[] {
  return PATTERNS.flatMap(([kind, pattern]) =>
    [...html.matchAll(pattern)].map((match) => ({ kind, snippet: match[0].slice(0, 120) })),
  );
}
