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

  it.each([
    ['<script data-src="x">alert(1)</script>', 'script'],
    ['<p style=color:red>x</p>', 'style-attribute'],
    ['<button onclick=go()>y</button>', 'event-handler'],
    ['<a href=" JavaScript:alert(1)">z</a>', 'javascript-url'],
  ])('flags %s', (html, kind) => {
    expect(findInlineCode(html).map((finding) => finding.kind)).toEqual([kind]);
  });

  it('accepts external scripts, plain links and images', () => {
    const html =
      '<script type="module" src="/_astro/a.js"></script><a href="/cursos/">ok</a><img src="/brand/egt-mark.svg" alt="">';
    expect(findInlineCode(html)).toEqual([]);
  });
});
