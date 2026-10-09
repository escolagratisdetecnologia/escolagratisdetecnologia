import { Window } from 'happy-dom';

export interface InlineCode {
  kind: 'script' | 'style' | 'style-attribute' | 'event-handler' | 'javascript-url';
  snippet: string;
}

const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction'];

/** Inline code the CloudFront CSP would block (script-src and style-src are 'self' only). */
export function findInlineCode(html: string): InlineCode[] {
  const window = new Window();
  try {
    window.document.write(html);
    const findings: InlineCode[] = [];
    const add = (kind: InlineCode['kind'], element: { outerHTML: string }) =>
      findings.push({ kind, snippet: element.outerHTML.slice(0, 120) });

    for (const element of window.document.querySelectorAll('*')) {
      const tag = element.tagName.toLowerCase();
      if (tag === 'script' && !element.hasAttribute('src')) add('script', element);
      if (tag === 'style') add('style', element);
      if (element.hasAttribute('style')) add('style-attribute', element);
      const names = element.getAttributeNames();
      if (names.some((name) => name.toLowerCase().startsWith('on'))) add('event-handler', element);
      const isScriptUrl = URL_ATTRIBUTES.some((name) =>
        element.getAttribute(name)?.trim().toLowerCase().startsWith('javascript:'),
      );
      if (isScriptUrl) add('javascript-url', element);
    }
    return findings;
  } finally {
    window.happyDOM.close();
  }
}
