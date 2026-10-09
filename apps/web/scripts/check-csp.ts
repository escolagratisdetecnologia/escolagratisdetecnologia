// Fails when the built HTML carries code the CloudFront CSP would block (ADR 0021).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { findInlineCode } from '../src/lib/csp-scan.ts';

const dist = path.resolve(import.meta.dirname, '../dist');
const files = (await readdir(dist, { recursive: true })).filter((file) => file.endsWith('.html'));

let total = 0;
for (const file of files) {
  const findings = findInlineCode(await readFile(path.join(dist, file), 'utf8'));
  for (const finding of findings)
    console.log(`- dist/${file}: ${finding.kind}: ${finding.snippet}`);
  total += findings.length;
}

if (files.length === 0) {
  console.error('Nenhum HTML em apps/web/dist: rode o build antes.');
  process.exitCode = 2;
} else if (total > 0) {
  console.log(`A CSP do site bloquearia ${total} trecho(s) inline acima. Use arquivos externos.`);
  process.exitCode = 1;
} else {
  console.log(`CSP OK: ${files.length} páginas sem script ou estilo inline.`);
}
