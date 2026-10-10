import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const MAILPIT = 'http://localhost:8025';

/** A new e-mail per test: tests run in parallel against the same API. */
export const newEmail = () => `aluno-${randomUUID()}@example.com`;

/**
 * Login tests need Mailpit and the fake Google (`pnpm db:up`). Locally they are skipped without
 * them; in the CI, the services always run.
 */
export function needsLocalServices(): void {
  test.beforeAll(async () => {
    const up = await fetch(`${MAILPIT}/api/v1/info`).then(
      (res) => res.ok,
      () => false,
    );
    test.skip(!up && !process.env.CI, 'Rode pnpm db:up para testar o login.');
  });
}

/**
 * The code sent to the e-mail, read from Mailpit. The message is deleted after reading, so the
 * next call waits for a new code instead of returning this one again.
 */
export async function codeFor(email: string): Promise<string> {
  let found: { ID: string; code: string } | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
        );
        const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
        const message = messages[0];
        const code = /(\d{6})/.exec(message?.Subject ?? '')?.[1];
        found = message && code ? { ID: message.ID, code } : undefined;
        return found;
      },
      { timeout: 10_000 },
    )
    .toBeDefined();
  if (!found) throw new Error(`No code for ${email}`);
  await fetch(`${MAILPIT}/api/v1/messages`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ IDs: [found.ID] }),
  });
  return found.code;
}

/** Signs in with an e-mail code, from the sign-in page. */
export async function signInWithEmail(page: Page, email: string, next = '/eu/'): Promise<void> {
  await page.goto(`/entrar/?next=${encodeURIComponent(next)}`);
  await expect(page.locator('[data-island="login"]')).toHaveAttribute('data-hydrated', 'true');
  await page.getByLabel('Seu e-mail').fill(email);
  await page.getByRole('button', { name: 'Receber código' }).click();
  await page.getByLabel('Código').fill(await codeFor(email));
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

/** The last step of sign-up, for someone born in `birthYear`. */
export async function completeSignUp(page: Page, birthYear = '2000'): Promise<void> {
  await expect(page).toHaveURL(/\/entrar\/cadastro\//);
  await expect(page.locator('[data-island="complete-profile"]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.getByLabel('Ano em que você nasceu').fill(birthYear);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Concluir cadastro' }).click();
}
