import { expect, test } from '@playwright/test';
import { lessonUrl, lessonsOf } from '../src/lib/urls.ts';
import { pilotCourse } from './support/catalog.ts';

test('the manifest describes an installable app in pt-BR', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');

  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest).toMatchObject({
    name: 'Escola Grátis de Tecnologia',
    short_name: 'Escola Grátis',
    lang: 'pt-BR',
    start_url: '/',
    display: 'standalone',
    shortcuts: [{ name: 'Continuar curso', url: '/continuar/' }],
  });
  expect(manifest.icons).toContainEqual(
    expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
  );
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }
});

test('visited pages open offline and the rest shows the offline page', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Playwright only controls service workers in Chromium');
  const course = await pilotCourse();
  const lesson = lessonsOf(course)[0]!;

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto(lessonUrl(course, lesson));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.frontmatter.title);

  // The deterministic part first: the visited page and the offline page are in the caches.
  const cached = await page.evaluate(
    async (url) => {
      const visited = await (await caches.open('paginas')).match(url);
      const offline = await caches.match('/offline/index.html', { ignoreSearch: true });
      return { visited: Boolean(visited), offline: Boolean(offline) };
    },
    lessonUrl(course, lesson),
  );
  expect(cached).toEqual({ visited: true, offline: true });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.frontmatter.title);

  await page.goto('/eu/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Você está sem internet');
  await context.setOffline(false);
});

test('iPhone users get the Add to Home Screen steps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iPhone only');
  await page.goto('/eu/');
  await expect(page.locator('[data-install]')).toHaveAttribute('data-ready', 'true');

  const button = page.getByRole('button', { name: 'Como instalar no iPhone' });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Adicionar à Tela de Início')).toBeVisible();
});

test('Android users get an install button when the browser allows it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'android', 'Android only');
  await page.goto('/eu/');
  await expect(page.locator('[data-install]')).toHaveAttribute('data-ready', 'true');

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        document.body.dataset.prompted = 'true';
        return Promise.resolve();
      },
    });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Instalar app' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-prompted', 'true');
});
