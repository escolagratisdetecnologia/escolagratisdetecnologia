import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Problem } from '../src/index.ts';

export const VALID = fileURLToPath(new URL('./fixtures/valid/', import.meta.url));
export const COURSE = 'courses/curso-teste';

/** Copies the valid fixture to a temp dir so a test can break one thing in it. */
export async function copyFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'egt-content-'));
  await cp(VALID, dir, { recursive: true });
  return dir;
}

export async function edit(dir: string, file: string, change: (source: string) => string) {
  const target = path.join(dir, file);
  await writeFile(target, change(await readFile(target, 'utf8')));
}

export async function remove(dir: string, file: string) {
  await rm(path.join(dir, file), { recursive: true });
}

/** Problems as "relative/path: message", easier to read in assertions. */
export function describeProblems(dir: string, problems: Problem[]): string[] {
  return problems.map((problem) => `${path.relative(dir, problem.file)}: ${problem.message}`);
}
