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
    ['<a href=" JavaScript:alert(1)">z</a>', 'unsafe-url'],
  ])('flags %s', (html, kind) => {
    expect(findInlineCode(html).map((finding) => finding.kind)).toEqual([kind]);
  });

  it('accepts external scripts, plain links and images', () => {
    const html =
      '<script type="module" src="/_astro/a.js"></script><a href="/cursos/">ok</a><img src="/brand/egt-mark.svg" alt="">';
    expect(findInlineCode(html)).toEqual([]);
  });

  it.each([
    ['<svg><script>x()</script></svg>', ['script']],
    ['<svg><style>p{}</style><rect style="fill:red"/></svg>', ['style', 'style-attribute']],
    ['<svg><a xlink:href="javascript:x()"><text>t</text></a></svg>', ['unsafe-url']],
    ['<a href="java&#9;script:x()">a</a>', ['unsafe-url']],
    ['<a href="&#106;avascript:x()">b</a>', ['unsafe-url']],
    ['<a href="vbscript:msgbox(1)">x</a>', ['unsafe-url']],
    ['<a href="data:text/html,<script>x()</script>">y</a>', ['unsafe-url']],
    ['<img src="data:image/png;base64,AAAA" alt="">', ['unsafe-url']],
    ['<iframe src=" DATA:text/html,x"></iframe>', ['unsafe-url']],
    ['<button ONCLICK="go()">c</button>', ['event-handler']],
    ['<template><script>x()</script></template>', ['script']],
  ])('flags %s', (html, kinds) => {
    expect(findInlineCode(html).map((finding) => finding.kind)).toEqual(kinds);
  });

  it('accepts a clean document with an inline SVG icon', () => {
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="/_astro/a.css"></head><body><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7"></path></svg><script type="module" src="/_astro/a.js"></script><a href="/cursos/">ok</a></body></html>';
    expect(findInlineCode(html)).toEqual([]);
  });
});
