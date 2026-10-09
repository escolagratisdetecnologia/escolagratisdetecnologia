import { expect, test, type Page } from '@playwright/test';
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
  await expect(page.locator('[data-island="continue-card"]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.getByRole('region', { name: 'Continue de onde parou' })).toHaveCount(0);

  const { course, lessons } = await finishFirstLesson(page);
  await page.goto('/');

  const card = page.getByRole('region', { name: 'Continue de onde parou' });
  await expect(card).toContainText(course.meta.title);
  await expect(card).toContainText(`1 de ${lessons.length} aulas concluídas`);
  await expect(card.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
    'href',
    lessonUrl(course, lessons[1]!),
  );
});

test('the Eu tab lists courses in progress and can clear them', async ({ page }) => {
  await page.goto('/eu/');
  await expect(page.getByText('Você ainda não começou nenhum curso.')).toBeVisible();

  const { course, lessons } = await finishFirstLesson(page);
  await page.goto('/eu/');
  await expect(page.getByRole('link', { name: course.meta.title })).toBeVisible();
  await expect(page.getByText(`1 de ${lessons.length} aulas concluídas`)).toBeVisible();

  await page.getByRole('button', { name: 'Apagar meu progresso deste aparelho' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('link', { name: course.meta.title })).toBeVisible();

  await page.getByRole('button', { name: 'Apagar meu progresso deste aparelho' }).click();
  await expect(page.getByRole('button', { name: 'Apagar progresso' })).toBeFocused();
  await page.getByRole('button', { name: 'Apagar progresso' }).click();
  await expect(page.getByRole('status')).toHaveText('Progresso apagado.');
  await expect(page.getByText('Você ainda não começou nenhum curso.')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Você ainda não começou nenhum curso.')).toBeVisible();
});

test('the "Continuar curso" shortcut jumps to the next lesson', async ({ page }) => {
  await page.goto('/continuar/');
  await expect(page.locator('[data-continue]')).toHaveAttribute('data-ready', 'true');
  const course = await pilotCourse();
  await expect(page.getByRole('link', { name: course.meta.title })).toBeVisible();

  const { lessons } = await finishFirstLesson(page);
  await page.goto('/continuar/');
  await expect(page).toHaveURL(lessonUrl(course, lessons[1]!));
});

for (const scheme of ['light', 'dark'] as const) {
  test(`home and Eu are accessible with progress (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await finishFirstLesson(page);
    for (const url of ['/', '/eu/']) {
      await page.goto(url);
      await expect(page.locator('[data-island]').first()).toHaveAttribute('data-hydrated', 'true');
      await expectNoA11yViolations(page);
    }
  });
}
