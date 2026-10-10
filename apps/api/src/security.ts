import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { apiError } from './errors.ts';

// Through CloudFront a 403 becomes the site's 404 page (ADR 0022): only direct access, which
// never passes through CloudFront, may get 403.

/** Only CloudFront knows the secret it sends in x-origin-verify. Skipped locally. */
export function requireOriginVerify(secret: string | undefined): MiddlewareHandler {
  if (secret === undefined) return async (_c, next) => next();
  const expected = Buffer.from(secret);
  return async (c, next) => {
    const received = Buffer.from(c.req.header('x-origin-verify') ?? '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return c.json(apiError('forbidden', 'Acesso direto à API não é permitido.'), 403);
    }
    await next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF: changes only from the site's own pages (spec §3.6). */
export function requireSiteOrigin(siteOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && c.req.header('origin') !== siteOrigin) {
      return c.json(
        apiError(
          'invalid_origin',
          'Não conseguimos confirmar de onde veio o pedido. Recarregue a página e tente de novo.',
        ),
        400,
      );
    }
    await next();
  };
}

/** API answers are personal: no cache in the browser, the service worker or the CDN. */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
};

/** The WAF common rule set blocks bodies over 8 KB; fail the same way locally, in JSON. */
export const limitBody = bodyLimit({
  maxSize: 8 * 1024,
  onError: (c) =>
    c.json(
      apiError('payload_too_large', 'O pedido ficou grande demais. Tente enviar menos de uma vez.'),
      413,
    ),
});
