import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home introduces the school in pt-BR', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Escola Grátis de Tecnologia');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Aprenda tecnologia de graça',
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /grátis/i);
  await expect(page.locator('footer')).toContainText('Veja o código no GitHub.');
});

test('home has no accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});

test('home stays within the 30 KB JavaScript budget', async ({ page }) => {
  // Collect the body promises and await them all before summing, so late script responses
  // (e.g. islands) are not missed.
  const scriptBodies: Promise<Buffer>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') {
      scriptBodies.push(response.body());
    }
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  const bodies = await Promise.all(scriptBodies);
  const scriptBytes = bodies.reduce((total, body) => total + body.length, 0);
  expect(scriptBytes).toBeLessThanOrEqual(30 * 1024);
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
