import { expect, test } from '@playwright/test';
import { courseUrl, lessonUrl, lessonsOf, projectUrl } from '../src/lib/urls.ts';
import { expectNoA11yViolations } from './support/axe.ts';
import { pilotCourse } from './support/catalog.ts';

const result = (outcome: string) => outcome.replace(/^Você sai com: /, '');

test('the catalog lists the pilot course with its outcome', async ({ page }) => {
  const course = await pilotCourse();
  await page.goto('/cursos/');

  const card = page.getByRole('article').filter({ hasText: course.meta.title });
  await expect(card.getByRole('link', { name: course.meta.title })).toHaveAttribute(
    'href',
    courseUrl(course),
  );
  await expect(card.locator('mark')).toHaveText(result(course.meta.outcome));
  await expect(card.getByText('R$ 0')).toBeVisible();
});

test('the home page invites to the pilot course', async ({ page }) => {
  const course = await pilotCourse();
  await page.goto('/');
  await expect(page.getByRole('link', { name: course.meta.title })).toHaveAttribute(
    'href',
    courseUrl(course),
  );
});

test('the course page shows the outcome, what you need and every lesson', async ({ page }) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);
  await page.goto(courseUrl(course));

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(course.meta.title);
  await expect(page.locator('.outcome mark')).toHaveText(result(course.meta.outcome));
  await expect(page.getByRole('heading', { name: 'O que você precisa' })).toBeVisible();
  for (const module of course.modules) {
    await expect(page.getByRole('heading', { name: module.title })).toBeVisible();
  }
  for (const lesson of lessons) {
    await expect(
      page.getByRole('link', { name: lesson.frontmatter.title, exact: true }),
    ).toHaveAttribute('href', lessonUrl(course, lesson));
  }
  await expect(page.getByRole('link', { name: 'Bora começar' })).toHaveAttribute(
    'href',
    lessonUrl(course, lessons[0]!),
  );
  await expect(
    page.getByRole('link', { name: `Projeto final: ${course.project.frontmatter.title}` }),
  ).toHaveAttribute('href', projectUrl(course));
});

test('each lesson leads to the next one and the last one to the project', async ({ page }) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);

  for (const [index, lesson] of lessons.entries()) {
    await page.goto(lessonUrl(course, lesson));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.frontmatter.title);
    await expect(page.getByText(`Aula ${index + 1} de ${lessons.length}`)).toBeVisible();
    const next = lessons[index + 1];
    const action = page.getByRole('link', {
      name: next ? 'Concluir e continuar' : 'Concluir e ver o projeto',
    });
    await expect(action).toHaveAttribute(
      'href',
      next ? lessonUrl(course, next) : projectUrl(course),
    );
  }
});

test('a lesson without video keeps the transcript open', async ({ page }) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course)[0]!;
  await page.goto(lessonUrl(course, lesson));

  await expect(page.getByText('O vídeo desta aula está em produção.')).toBeVisible();
  await expect(page.locator('details.transcript')).toHaveAttribute('open', '');
});

test('the project page explains what to deliver and how it is graded', async ({ page }) => {
  const course = await pilotCourse();
  const { frontmatter } = course.project;
  await page.goto(projectUrl(course));

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Projeto final: ${frontmatter.title}`,
  );
  await expect(page.locator('.criteria li')).toHaveCount(frontmatter.criteria.length);
  await expect(page.getByText(`Para passar: ${frontmatter.passScore} de 100 pontos`)).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`course, lesson and project pages are accessible (${scheme})`, async ({ page }) => {
    const course = await pilotCourse();
    await page.emulateMedia({ colorScheme: scheme });
    for (const url of [
      courseUrl(course),
      lessonUrl(course, lessonsOf(course)[1]!),
      projectUrl(course),
    ]) {
      await page.goto(url);
      // The sticky lesson bar legitimately overlaps content mid-scroll; check from the end of the page.
      // Focus visibility is covered by the keyboard test in lesson.spec.ts.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expectNoA11yViolations(page);
    }
  });
}
