import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { lessonUrl, lessonsOf } from '../src/lib/urls.ts';
import {
  codeFor,
  completeSignUp,
  needsLocalServices,
  newEmail,
  signInWithEmail,
} from './support/accounts.ts';
import { expectNoA11yViolations } from './support/axe.ts';
import { pilotCourse } from './support/catalog.ts';

needsLocalServices();

test('a new learner signs up with a code and takes the device progress along', async ({
  page,
  browser,
}) => {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);
  await page.goto(lessonUrl(course, lessons[0]!));
  await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('link', { name: 'Concluir e continuar' }).click();
  await expect(page).toHaveURL(lessonUrl(course, lessons[1]!));
  const email = newEmail();

  await signInWithEmail(page, email);
  await completeSignUp(page);

  await expect(page).toHaveURL('/eu/');
  await expect(page.getByText(`Você entrou como ${email}.`)).toBeVisible();
  await expect(page.getByText(`1 de ${lessons.length} aulas concluídas`)).toBeVisible();

  // Another device: the progress comes from the account.
  const other = await browser.newPage();
  await signInWithEmail(other, email);
  await expect(other).toHaveURL('/eu/');
  await expect(other.getByText(`1 de ${lessons.length} aulas concluídas`)).toBeVisible();
  await other.close();
});

test('a wrong code asks to check the e-mail', async ({ page }) => {
  const email = newEmail();
  await page.goto('/entrar/');
  await expect(page.locator('[data-island="login"]')).toHaveAttribute('data-hydrated', 'true');
  await page.getByLabel('Seu e-mail').fill(email);
  await page.getByRole('button', { name: 'Receber código' }).click();
  const code = await codeFor(email);

  await page.getByLabel('Código').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'Código incorreto ou vencido. Confira o e-mail ou peça um novo código.',
  );
});

test('nobody who may be under 12 gets an account', async ({ page }) => {
  await signInWithEmail(page, newEmail());

  await completeSignUp(page, '2014');

  await expect(page.getByRole('alert')).toContainText('a Escola é para quem nasceu até 2013');
  await expect(page.getByRole('link', { name: 'Ver os cursos' })).toBeVisible();
});

test('signs in with Google', async ({ page }) => {
  const email = newEmail();
  await page.goto('/entrar/');
  await expect(page.locator('[data-island="login"]')).toHaveAttribute('data-hydrated', 'true');

  await page.getByRole('link', { name: 'Entrar com Google' }).click();
  // mock-oauth2-server's login page: the e-mail goes in as the user.
  await page.locator('input[name="username"]').fill(email);
  await page.getByRole('button', { name: 'Sign-in' }).click();
  await completeSignUp(page);

  await expect(page).toHaveURL('/eu/');
  await expect(page.getByText(`Você entrou como ${email}.`)).toBeVisible();
});

test('signing out leaves nothing on the device', async ({ page }) => {
  await signInWithEmail(page, newEmail());
  await completeSignUp(page);
  await expect(page).toHaveURL('/eu/');
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();

  await expect(page).toHaveURL('/eu/?conta=saiu');
  await expect(
    page.getByText('Você saiu da conta. O progresso continua salvo nela.'),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain('egt:progress:v1');
});

/** Completes one lesson on this device (nothing reaches an account), and returns the stored progress. */
async function seedDeviceProgress(page: Page): Promise<string> {
  const course = await pilotCourse();
  const lessons = lessonsOf(course);
  await page.goto(lessonUrl(course, lessons[0]!));
  await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('link', { name: 'Concluir e continuar' }).click();
  await expect(page).toHaveURL(lessonUrl(course, lessons[1]!));
  const stored = await page.evaluate(() => localStorage.getItem('egt:progress:v1'));
  expect(stored).not.toBeNull();
  return stored ?? '';
}

test('an unfinished sign-up can sign out and keeps the device progress', async ({ page }) => {
  const before = await seedDeviceProgress(page);
  await signInWithEmail(page, newEmail());
  await expect(page).toHaveURL(/\/entrar\/cadastro\//);
  await page.goto('/eu/');
  await expect(page.getByRole('link', { name: 'Completar cadastro' })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Sair' }).click();

  await expect(page).toHaveURL('/eu/?conta=saiu-cadastro');
  await expect(
    page.getByText('Você saiu. O progresso deste aparelho continua aqui.'),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('egt:progress:v1'))).toBe(before);
});

test('an unfinished sign-up can be cancelled and starts over next time', async ({ page }) => {
  const before = await seedDeviceProgress(page);
  const email = newEmail();
  await signInWithEmail(page, email);
  await expect(page).toHaveURL(/\/entrar\/cadastro\//);
  await expect(page.locator('[data-island="complete-profile"]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );

  await page.getByRole('button', { name: 'Cancelar cadastro' }).click();
  await expect(page.getByRole('button', { name: 'Cancelar cadastro' })).toBeFocused();
  await page.getByRole('button', { name: 'Cancelar cadastro' }).click();

  await expect(page).toHaveURL('/eu/?conta=cadastro-cancelado');
  await expect(
    page.getByText(
      'Cadastro cancelado: apagamos a conta que você começou. O progresso deste aparelho continua aqui.',
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('egt:progress:v1'))).toBe(before);
  // The account is gone: the same e-mail asks for sign-up again.
  await signInWithEmail(page, email);
  await expect(page).toHaveURL(/\/entrar\/cadastro\//);
});

test.describe('with the service worker blocked', () => {
  // WebKit routes requests through the service worker, where `page.route` cannot see them.
  test.use({ serviceWorkers: 'block' });
  test('a failed sign-out keeps the learner and the device progress', async ({ page }) => {
    const course = await pilotCourse();
    const lessons = lessonsOf(course);
    await page.goto(lessonUrl(course, lessons[0]!));
    await expect(page.locator('[data-lesson]')).toHaveAttribute('data-ready', 'true');
    await page.getByRole('link', { name: 'Concluir e continuar' }).click();
    await expect(page).toHaveURL(lessonUrl(course, lessons[1]!));
    await signInWithEmail(page, newEmail());
    await completeSignUp(page);
    await expect(page).toHaveURL('/eu/');
    const signOut = page.getByRole('button', { name: 'Sair' });
    await expect(signOut).toBeVisible();
    const before = await page.evaluate(() => localStorage.getItem('egt:progress:v1'));
    expect(before).not.toBeNull();

    await page.route('**/api/auth/logout', (route) => route.abort());
    await signOut.click();

    await expect(page.getByRole('alert')).toHaveText(
      'Não conseguimos falar com a Escola agora. Confira sua internet e tente de novo.',
    );
    await expect(page).toHaveURL('/eu/');
    await expect(signOut).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('egt:progress:v1'))).toBe(before);
  });
});

test('the learner downloads everything the school keeps', async ({ page }) => {
  const email = newEmail();
  await signInWithEmail(page, email);
  await completeSignUp(page);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar meus dados' }).click();
  const file = await download;

  expect(file.suggestedFilename()).toBe('meus-dados-escola-gratis.json');
  const data = JSON.parse(await readFile(await file.path(), 'utf8')) as {
    account: { email: string };
    profile: { birthYear: number };
  };
  expect(data.account.email).toBe(email);
  expect(data.profile.birthYear).toBe(2000);
});

test('deleting the account erases it', async ({ page }) => {
  const email = newEmail();
  await signInWithEmail(page, email);
  await completeSignUp(page);

  await page.getByRole('button', { name: 'Excluir conta' }).click();
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();

  await expect(page).toHaveURL('/eu/?conta=excluida');
  await expect(page.getByText('Sua conta foi excluída e apagamos os seus dados.')).toBeVisible();
  // The same e-mail starts from scratch.
  await signInWithEmail(page, email);
  await expect(page).toHaveURL(/\/entrar\/cadastro\//);
});

test('the account pages have no accessibility violations', async ({ page }) => {
  for (const path of ['/entrar/', '/termos/', '/privacidade/']) {
    await page.goto(path);
    await expectNoA11yViolations(page);
  }
  const email = newEmail();
  await page.goto('/entrar/');
  await expect(page.locator('[data-island="login"]')).toHaveAttribute('data-hydrated', 'true');
  await page.getByLabel('Seu e-mail').fill(email);
  await page.getByRole('button', { name: 'Receber código' }).click();
  await expect(page.getByLabel('Código')).toBeFocused();
  await expectNoA11yViolations(page);

  await page.getByLabel('Código').fill(await codeFor(email));
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('[data-island="complete-profile"]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expectNoA11yViolations(page);
  await completeSignUp(page);
  await expect(page).toHaveURL('/eu/');
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await expectNoA11yViolations(page);
});
