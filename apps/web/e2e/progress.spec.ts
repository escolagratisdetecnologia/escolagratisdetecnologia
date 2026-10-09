import { completeLesson, emptyProgress } from '@egt/core';
import { expect, test, type Page } from '@playwright/test';
import { PROGRESS_KEY } from '../src/lib/progress-store.ts';
import { lessonUrl, lessonsOf } from '../src/lib/urls.ts';
import { expectNoA11yViolations } from './support/axe.ts';
import { pilotCourse } from './support/catalog.ts';

async function finishFirstLesson(page: Page) {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);
  await page.goto(lessonUrl(course, lessons[0]!));
  await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('link', { name: 'Concluir e continuar' }).click();
  await expect(page).toHaveURL(lessonUrl(course, lessons[1]!));
  return { course, lessons };
}

test('home offers to continue after the first lesson', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-island="home-action"]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.getByRole('link', { name: 'Ver os cursos' })).toHaveAttribute(
    'href',
    '/cursos/',
  );
  await expect(page.getByRole('link', { name: 'Continuar de onde parou' })).toHaveCount(0);

  const { course, lessons } = await finishFirstLesson(page);
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Continuar de onde parou' })).toHaveAttribute(
    'href',
    lessonUrl(course, lessons[1]!),
  );
  await expect(page.locator('.home-action-note')).toHaveText(
    `${course.meta.title}: 1 de ${lessons.length} aulas concluídas`,
  );
});

test('the home does not jump for returning learners', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'layout-shift entries are Chromium-only');
  const course = await pilotCourse();
  const lessons = lessonsOf(course);
  const progress = completeLesson(
    emptyProgress(),
    course.slug,
    lessons[0]!.slug,
    new Date('2026-10-09T12:00:00Z'),
  );
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: PROGRESS_KEY,
    value: JSON.stringify(progress),
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Continuar de onde parou' })).toBeVisible();
  await page.waitForTimeout(300);

  const { supported, shift } = await page.evaluate(
    () =>
      new Promise<{ supported: boolean; shift: number }>((resolve) => {
        const supported = PerformanceObserver.supportedEntryTypes.includes('layout-shift');
        let sum = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
          }[]) {
            if (!entry.hadRecentInput) sum += entry.value;
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve({ supported, shift: sum }), 500);
      }),
  );
  expect(supported).toBe(true);
  expect(shift).toBeLessThanOrEqual(0.05);
});

test('the Eu tab lists courses in progress and can clear them', async ({ page }) => {
  await page.goto('/eu/');
  await expect(page.getByText('Você ainda não começou nenhum curso.')).toBeVisible();

  const { course, lessons } = await finishFirstLesson(page);
  await page.goto('/eu/');
  await expect(page.getByRole('link', { name: course.meta.title, exact: true })).toBeVisible();
  await expect(page.getByText(`1 de ${lessons.length} aulas concluídas`)).toBeVisible();

  await page.getByRole('button', { name: 'Apagar meu progresso deste aparelho' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(
    page.getByRole('button', { name: 'Apagar meu progresso deste aparelho' }),
  ).toBeFocused();
  await expect(page.getByRole('link', { name: course.meta.title, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Apagar meu progresso deste aparelho' }).click();
  await expect(page.getByRole('button', { name: 'Apagar progresso' })).toBeFocused();
  await page.getByRole('button', { name: 'Apagar progresso' }).click();
  await expect(page.getByRole('status')).toHaveText('Progresso apagado.');
  await expect(page.getByRole('heading', { name: 'Seus cursos' })).toBeFocused();
  await expect(page.getByText('Você ainda não começou nenhum curso.')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Você ainda não começou nenhum curso.')).toBeVisible();
});

test('the "Continuar curso" shortcut jumps to the next lesson', async ({ page }) => {
  await page.goto('/continuar/');
  await expect(page.locator('[data-continue]')).toHaveAttribute('data-ready', 'true');
  const course = await pilotCourse();
  await expect(page.getByRole('link', { name: course.meta.title, exact: true })).toBeVisible();

  const { lessons } = await finishFirstLesson(page);
  await page.goto('/continuar/');
  await expect(page).toHaveURL(lessonUrl(course, lessons[1]!));
});

for (const scheme of ['light', 'dark'] as const) {
  test(`home and Eu are accessible with progress (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const { course } = await finishFirstLesson(page);

    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Continuar de onde parou' })).toBeVisible();
    await expectNoA11yViolations(page);

    await page.goto('/eu/');
    await expect(page.getByRole('link', { name: course.meta.title, exact: true })).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByRole('button', { name: 'Apagar meu progresso deste aparelho' }).click();
    await expect(page.getByRole('button', { name: 'Apagar progresso' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
}
