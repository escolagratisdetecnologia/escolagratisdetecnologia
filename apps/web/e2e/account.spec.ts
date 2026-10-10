import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
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
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();

  await expect(page).toHaveURL('/eu/?conta=saiu');
  await expect(
    page.getByText('Você saiu da conta. O progresso continua salvo nela.'),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain('egt:progress:v1');
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
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await expectNoA11yViolations(page);
});
