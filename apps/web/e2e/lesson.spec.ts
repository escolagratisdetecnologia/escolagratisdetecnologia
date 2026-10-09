import { PLATFORM_LABELS, type Platform } from '@egt/content';
import { devices, expect, test } from '@playwright/test';
import { PROGRESS_KEY } from '../src/lib/progress-store.ts';
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

// A tablet-size Chromium: the switcher used to push the steps down ~176 px there (CLS 0.12).
const { defaultBrowserType: _browser, ...tablet } = devices['Galaxy Tab S4'];
test.describe('layout stability', () => {
  test.use(tablet);

  test('the lesson with variants does not jump while it loads', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'layout-shift entries are Chromium-only');
    const course = await pilotCourse();
    const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;

    // Slow scripts, like a real phone: the page is painted before the deferred ones run.
    await page.route('**/_astro/*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await page.goto(lessonUrl(course, lesson));
    await expect(page.locator('[data-variants]')).toHaveAttribute('data-ready', 'true');
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
    // The sticky action bar legitimately overlaps content mid-scroll; check from the end of the page.
    // Keeping focus out from under the bar is covered by the keyboard test below.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expectNoA11yViolations(page);
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('module 0 shows every device and no switcher', async ({ page }) => {
    const course = await pilotCourse();
    const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
    await page.goto(lessonUrl(course, lesson));

    const switcher = page.locator('[data-switcher]');
    await expect(switcher).toHaveCount(1);
    await expect(switcher).toBeHidden();
    for (const platform of Object.keys(lesson.frontmatter.variants!) as Platform[]) {
      await expect(
        page.getByRole('heading', { name: PLATFORM_LABELS[platform], level: 3 }),
      ).toBeVisible();
    }
  });
});

test('keyboard focus is never hidden behind the action bar', async ({ page }) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
  await page.goto(lessonUrl(course, lesson));
  await expect(page.locator('[data-variants]')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-island="quiz"]')).toHaveAttribute('data-hydrated', 'true');

  // "Conferir" stays disabled (and unfocusable) until an option is picked.
  await page.getByRole('radio').first().check();
  const targets = [
    page.locator('[data-switcher] button').last(),
    page.getByRole('button', { name: 'Conferir' }).first(),
  ];
  for (const target of targets) {
    await target.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(target).toBeFocused();
    // Let the browser finish scrolling the focused element into view.
    await page.waitForTimeout(300);
    const box = (await target.boundingBox())!;
    const bar = (await page.locator('.lesson-actions').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
    expect(box.y).toBeGreaterThanOrEqual(0);
  }
});

test('a correct answer is remembered on this device', async ({ page }) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
  const question = lesson.frontmatter.quiz[0]!;

  await page.goto(lessonUrl(course, lesson));
  await expect(page.locator('[data-island="quiz"]')).toHaveAttribute('data-hydrated', 'true');
  const group = page.getByRole('group', { name: question.question });
  await group.getByLabel(question.options[question.answer]!, { exact: true }).check();
  await group.getByRole('button', { name: 'Conferir' }).click();
  await expect(group.getByText(`Isso aí! ${question.explanation}`)).toBeVisible();

  await page.reload();
  const stored = await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY);
  const progress = JSON.parse(stored!) as {
    courses: Record<string, { correctAnswers: string[] }>;
  };
  expect(progress.courses[course.slug]!.correctAnswers).toContain(`${lesson.slug}#0`);
});

test('a lesson stays within the 30 KB gzip JavaScript budget', async ({ page }) => {
  const course = await pilotCourse();
  const lesson = lessonsOf(course).find((candidate) => candidate.frontmatter.variants)!;
  expect(await gzippedScriptBytes(page, lessonUrl(course, lesson))).toBeLessThanOrEqual(30 * 1024);
});
