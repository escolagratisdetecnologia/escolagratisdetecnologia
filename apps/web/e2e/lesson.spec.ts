import { expect, test } from '@playwright/test';
import { courseUrl, lessonUrl, lessonsOf, projectUrl } from '../src/lib/urls.ts';
import { expectNoA11yViolations } from './support/axe.ts';
import { gzippedScriptBytes } from './support/budget.ts';
import { pilotCourse } from './support/catalog.ts';

test('the quiz tells right from wrong and explains the answer', async ({ page }) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course)[0]!;
  const question = lesson.frontmatter.quiz[0]!;
  const wrong = question.options.findIndex((_, index) => index !== question.answer);

  await page.goto(lessonUrl(course, lesson));
  await expect(page.locator('[data-island="quiz"]')).toHaveAttribute('data-hydrated', 'true');
  const group = page.getByRole('group', { name: question.question });

  await group.getByLabel(question.options[wrong]!, { exact: true }).check();
  await group.getByRole('button', { name: 'Conferir' }).click();
  await expect(group.getByText('Ainda não. Releia a aula e tente outra opção.')).toBeVisible();

  await group.getByLabel(question.options[question.answer]!, { exact: true }).check();
  await group.getByRole('button', { name: 'Conferir' }).click();
  await expect(group.getByText(`Isso aí! ${question.explanation}`)).toBeVisible();
});

test('finishing every lesson leads to the project and is remembered', async ({ page }) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);

  await page.goto(lessonUrl(course, lessons[0]!));
  for (const [index, lesson] of lessons.entries()) {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.frontmatter.title);
    await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
    const last = index === lessons.length - 1;
    await page
      .getByRole('link', { name: last ? 'Concluir e ver o projeto' : 'Concluir e continuar' })
      .click();
  }
  await expect(page).toHaveURL(projectUrl(course));

  await page.goto(courseUrl(course));
  await expect(
    page.getByText(`${lessons.length} de ${lessons.length} aulas concluídas`),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver o projeto final' })).toHaveAttribute(
    'href',
    projectUrl(course),
  );
});

test('module 0 opens the steps for the learner device and lets them switch', async ({
  page,
}, testInfo) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
  const mine = testInfo.project.name === 'iphone' ? 'iPhone' : 'Android';
  const other = mine === 'iPhone' ? 'Android' : 'iPhone';

  await page.goto(lessonUrl(course, lesson));
  const variants = page.locator('[data-variants]');
  await expect(variants).toHaveAttribute('data-ready', 'true');

  await expect(variants.getByRole('button', { name: mine })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(variants.getByRole('heading', { name: mine, level: 3 })).toBeVisible();
  await expect(variants.getByRole('heading', { name: other, level: 3 })).toBeHidden();

  await variants.getByRole('button', { name: other }).click();
  await expect(variants.getByRole('heading', { name: other, level: 3 })).toBeVisible();
  await expect(variants.getByRole('heading', { name: mine, level: 3 })).toBeHidden();
});

test('opening a lesson marks the course as started', async ({ page }) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);

  await page.goto(lessonUrl(course, lessons[1]!));
  await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
  await page.goto(courseUrl(course));

  await expect(page.getByText(`0 de ${lessons.length} aulas concluídas`)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
    'href',
    lessonUrl(course, lessons[0]!),
  );
});

for (const scheme of ['light', 'dark'] as const) {
  test(`an interactive lesson is accessible (${scheme})`, async ({ page }) => {
    const course = await pilotCourse();
    const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(lessonUrl(course, lesson));
    await expect(page.locator('[data-island="quiz"]')).toHaveAttribute('data-hydrated', 'true');
    await expectNoA11yViolations(page);
  });
}

test('a lesson stays within the 30 KB gzip JavaScript budget', async ({ page }) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
  expect(await gzippedScriptBytes(page, lessonUrl(course, lesson))).toBeLessThanOrEqual(30 * 1024);
});
