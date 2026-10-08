import { readFileSync } from 'node:fs';
import {
  findUntaggedResources,
  formatReport,
  type IgnoreRules,
  type SearchOutput,
} from './tag-audit.ts';

const [environment] = process.argv.slice(2);

if (!environment) {
  console.error('Uso: node tools/tag-audit/src/cli.ts <ambiente>');
  process.exit(2);
}

const ignore = JSON.parse(
  readFileSync(new URL('../ignore.json', import.meta.url), 'utf8'),
) as IgnoreRules;

let output: SearchOutput;
try {
  output = JSON.parse(readFileSync(0, 'utf8')) as SearchOutput;
} catch (error) {
  console.error(`Não consegui ler o resultado da busca: ${(error as Error).message}`);
  process.exit(2);
}

const untagged = findUntaggedResources(output, ignore);

console.log(formatReport(environment, untagged));
process.exit(untagged.length > 0 ? 1 : 0);
