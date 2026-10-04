import type { APIRoute } from 'astro';
import { SITE_ENV } from 'astro:env/server';

export const GET: APIRoute = () => {
  const body = SITE_ENV === 'prod' ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
