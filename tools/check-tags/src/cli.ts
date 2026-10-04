import { readFileSync } from 'node:fs';
import { findTagViolations, formatViolations, type TerraformPlan } from './check-tags.ts';

const [planPath] = process.argv.slice(2);

if (!planPath) {
  console.error('Uso: node tools/check-tags/src/cli.ts <plano.json>');
  process.exit(2);
}

let plan: TerraformPlan;
try {
  plan = JSON.parse(readFileSync(planPath, 'utf8')) as TerraformPlan;
} catch (error) {
  console.error(`Não consegui ler o plano em ${planPath}: ${(error as Error).message}`);
  process.exit(2);
}

const violations = findTagViolations(plan);

if (violations.length > 0) {
  console.error(formatViolations(violations));
  process.exit(1);
}

console.log('Tags OK: todos os recursos tagueáveis têm as tags obrigatórias.');
