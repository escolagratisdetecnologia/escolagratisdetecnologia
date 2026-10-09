import { completeLesson, emptyProgress } from '@egt/core';
import { expect, test } from '@playwright/test';
import { PROGRESS_KEY } from '../src/lib/progress-store.ts';
import { courseUrl, lessonUrl, lessonsOf } from '../src/lib/urls.ts';
import { gzippedScriptBytes } from './support/budget.ts';
import { pilotCourse } from './support/catalog.ts';

test('the course page shows what is already done on this device', async ({ page }) => {
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

  await page.goto(courseUrl(course));
  await expect(page.locator('[data-island="course-progress"]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );

  await expect(page.getByText(`1 de ${lessons.length} aulas concluídas`)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
    'href',
    lessonUrl(course, lessons[1]!),
  );
  await expect(page.locator('.lesson-item.is-done')).toHaveCount(1);
});

test('the course page still works when storage holds garbage', async ({ page }) => {
  const course = await pilotCourse();
  await page.addInitScript((key) => localStorage.setItem(key, 'lixo'), PROGRESS_KEY);

  await page.goto(courseUrl(course));
  await expect(page.locator('[data-island="course-progress"]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.getByRole('link', { name: 'Bora começar' })).toBeVisible();
});

test('the course page stays within the 30 KB gzip JavaScript budget', async ({ page }) => {
  const course = await pilotCourse();
  expect(await gzippedScriptBytes(page, courseUrl(course))).toBeLessThanOrEqual(30 * 1024);
});
