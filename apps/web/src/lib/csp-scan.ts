import { parse, serializeOuter } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export interface InlineCode {
  kind: 'script' | 'style' | 'style-attribute' | 'event-handler' | 'javascript-url';
  snippet: string;
}

// Attributes whose value a browser may navigate to or load as a URL.
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'data']);

// Browsers drop tab/LF/CR anywhere in a URL and trim leading C0 controls and spaces.
function isJavascriptUrl(value: string): boolean {
  const cleaned = value
    .replace(/[\t\n\r]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/^[\u0000- ]+/, '')
    .toLowerCase();
  return cleaned.startsWith('javascript:');
}

function isElement(node: Node): node is Element {
  return 'tagName' in node;
}

/**
 * Inline code the CloudFront CSP would block (script-src and style-src are 'self' only).
 * Uses parse5, the WHATWG tree builder, so SVG/MathML content and <template> contents are seen
 * the same way a browser sees them.
 */
export function findInlineCode(html: string): InlineCode[] {
  const findings: InlineCode[] = [];

  const visit = (node: Node): void => {
    if (isElement(node)) {
      const add = (kind: InlineCode['kind']) =>
        findings.push({ kind, snippet: serializeOuter(node).slice(0, 120) });
      const names = node.attrs.map((attr) => attr.name.toLowerCase());
      // Attribute names are matched without prefix so that xlink:href counts as href.
      const localNames = node.attrs.map((attr) => attr.name.toLowerCase().replace(/^.*:/, ''));

      if (node.tagName === 'script' && !names.includes('src') && !localNames.includes('href'))
        add('script');
      if (node.tagName === 'style') add('style');
      if (names.includes('style')) add('style-attribute');
      if (names.some((name) => name.startsWith('on'))) add('event-handler');
      const isScriptUrl = node.attrs.some(
        (attr) =>
          URL_ATTRIBUTES.has(attr.name.toLowerCase().replace(/^.*:/, '')) &&
          isJavascriptUrl(attr.value),
      );
      if (isScriptUrl) add('javascript-url');
    }
    if ('content' in node) visit(node.content);
    if ('childNodes' in node) node.childNodes.forEach(visit);
  };

  visit(parse(html));
  return findings;
}
