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
});

test('home has no accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});

test('home stays within the 30 KB JavaScript budget', async ({ page }) => {
  let scriptBytes = 0;
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'script') {
      scriptBytes += (await response.body()).length;
    }
  });

  await page.goto('/', { waitUntil: 'networkidle' });

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
});

test('robots.txt is served as plain text', async ({ request }) => {
  const response = await request.get('/robots.txt');

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('User-agent: *');
});
