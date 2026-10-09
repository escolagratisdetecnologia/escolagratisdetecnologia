import { describe, expect, it } from 'vitest';
import { findInlineCode } from './csp-scan.ts';

describe('findInlineCode', () => {
  it('accepts external scripts and stylesheets', () => {
    const html =
      '<link rel="stylesheet" href="/_astro/a.css"><script type="module" src="/_astro/b.js"></script><p class="x">Oi</p>';
    expect(findInlineCode(html)).toEqual([]);
  });

  it('flags inline scripts, styles, style attributes and event handlers', () => {
    const html =
      '<script>alert(1)</script><style>p{}</style><p style="color:red">x</p><button onclick="go()">y</button>';
    expect(findInlineCode(html).map((finding) => finding.kind)).toEqual([
      'script',
      'style',
      'style-attribute',
      'event-handler',
    ]);
  });
});
