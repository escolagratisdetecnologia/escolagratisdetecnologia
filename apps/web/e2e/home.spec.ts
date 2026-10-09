import { expect, test } from '@playwright/test';
import { gzippedScriptBytes } from './support/budget.ts';

test('home introduces the school in pt-BR', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Escola Grátis de Tecnologia');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Aprenda tecnologia de graça',
  );
  await expect(page.getByRole('link', { name: 'Ver os cursos' })).toHaveAttribute(
    'href',
    '/cursos/',
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /grátis/i);
  await expect(page.locator('footer')).toContainText('Veja o código no GitHub.');
});

test('home stays within the 30 KB gzip JavaScript budget', async ({ page }) => {
  expect(await gzippedScriptBytes(page, '/')).toBeLessThanOrEqual(30 * 1024);
});

test('unknown routes show the friendly 404 page', async ({ page }) => {
  const response = await page.goto('/nao-existe');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Página não encontrada');
  await expect(page.getByRole('link', { name: 'Voltar para o início' })).toHaveAttribute(
    'href',
    '/',
  );
  // Even in prod, the 404 must stay out of search results and must not claim a canonical URL.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
});

test('robots.txt is served as plain text', async ({ request }) => {
  const response = await request.get('/robots.txt');

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('User-agent: *');
});
