import path from 'node:path';
import { loadCatalog, type LoadResult } from './load.ts';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const [dir] = process.argv.slice(2);

if (!dir) {
  console.error('Uso: node packages/content/src/cli.ts <pasta-do-conteúdo>');
  process.exitCode = 2;
} else {
  let result: LoadResult | undefined;
  try {
    result = await loadCatalog(path.resolve(dir));
  } catch (error) {
    console.error(`Não consegui ler o conteúdo em ${dir}: ${(error as Error).message}`);
    process.exitCode = 2;
  }
  if (result && result.problems.length > 0) {
    console.log(
      `Encontrei ${plural(result.problems.length, 'problema', 'problemas')} no conteúdo:`,
    );
    for (const problem of result.problems) {
      console.log(`- ${path.relative(process.cwd(), problem.file)}: ${problem.message}`);
    }
    process.exitCode = 1;
  } else if (result) {
    const { courses } = result.catalog;
    const lessons = courses.reduce(
      (total, course) =>
        total + course.modules.reduce((sum, module) => sum + module.lessons.length, 0),
      0,
    );
    console.log(
      `Conteúdo OK: ${plural(courses.length, 'curso', 'cursos')}, ${plural(lessons, 'aula', 'aulas')}.`,
    );
  }
}
