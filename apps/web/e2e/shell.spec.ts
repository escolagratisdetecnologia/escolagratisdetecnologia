import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe.ts';

const TABS = [
  { name: 'Início', path: '/' },
  { name: 'Cursos', path: '/cursos/' },
  { name: 'Eu', path: '/eu/' },
];

for (const tab of TABS) {
  test(`the ${tab.name} tab marks itself as the current page`, async ({ page }) => {
    await page.goto(tab.path);

    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link')).toHaveCount(3);
    await expect(nav.getByRole('link', { name: tab.name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`${tab.path} has no accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(tab.path);
      await expectNoA11yViolations(page);
    });
  }
}

test('tabs and the brand link are big enough to tap', async ({ page }) => {
  await page.goto('/');
  const targets = [
    page.getByRole('link', { name: 'Escola Grátis de Tecnologia' }),
    ...TABS.map((tab) =>
      page
        .getByRole('navigation', { name: 'Principal' })
        .getByRole('link', { name: tab.name, exact: true }),
    ),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
});

test('the mark has light letters in dark mode', async ({ page }) => {
  const currentMark = () =>
    page.locator('.brand-mark').evaluate((img: HTMLImageElement) => img.currentSrc);

  await page.goto('/');
  expect(await currentMark()).toMatch(/\/brand\/egt-mark\.svg$/);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  expect(await currentMark()).toMatch(/\/brand\/egt-mark-dark\.svg$/);
});

test('the title font is preloaded and served', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveAttribute(
    'href',
    '/fonts/bricolage-grotesque-800.woff2',
  );
  expect((await request.get('/fonts/bricolage-grotesque-800.woff2')).status()).toBe(200);
});
