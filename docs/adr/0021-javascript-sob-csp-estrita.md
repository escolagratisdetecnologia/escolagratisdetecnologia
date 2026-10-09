# 0021. JavaScript no cliente sob CSP estrita

- Status: aceita
- Data: 2026-10-09
- Decisão do spec: D1 (complementa)

## Contexto

A borda envia `script-src 'self'` e `style-src 'self'` em todas as respostas (response headers policy do CloudFront). As ilhas do Astro 7 (`client:load`, `client:visible` etc.) injetam dois scripts inline em cada página: o runtime das ilhas e o da diretiva. Num teste de 2026-10-09, os dois seriam bloqueados e nenhuma ilha funcionaria em produção.

O `security.csp` do Astro 7 calcula hashes, mas os grava numa meta tag por página; a CSP do cabeçalho continua valendo e bloqueia do mesmo jeito. O `@vite-pwa/astro`, citado no spec para o service worker, declara suporte só até o Astro 5.

## Decisão

- Ilhas Preact são renderizadas no build pelo Astro, **sem** diretiva `client:*`, dentro de `<div data-island data-props>` (`src/components/Island.astro`). O script externo `src/scripts/islands.ts` hidrata cada uma com `hydrate()` do Preact e importa o componente sob demanda (`src/islands/registry.ts`).
- Melhorias pequenas e sem estado (variantes por aparelho, concluir aula, instalar o app, atalho "Continuar curso") usam scripts externos sem framework.
- `vite.build.assetsInlineLimit: 0`: nenhum script, fonte ou imagem vira inline.
- O service worker é gerado pelo `workbox-build` numa integração própria no hook `astro:build:done`, com o runtime do Workbox em arquivo separado.
- A CI roda `pnpm --filter @egt/web check:csp`, que falha se o HTML gerado tiver `<script>` sem `src`, `<style>`, atributo `style` ou handler `on*`.

## Alternativas consideradas

- `security.csp` do Astro: a meta tag com hashes não libera o que o cabeçalho bloqueia.
- Hashes no cabeçalho do CloudFront: acopla o Terraform ao resultado de cada build.
- `'unsafe-inline'`: derruba a proteção contra injeção de script.
- `@vite-pwa/astro`: não declara suporte ao Astro 7.

## Consequências

- Positivas:
  - A CSP continua estrita, sem exceções.
  - JavaScript só onde há interação: o Preact pesa cerca de 6 KB gzip, e páginas sem ilha não baixam nada dele.
- Negativas:
  - Um runtime de ilhas próprio (cerca de 30 linhas) para manter.
  - Sem hidratação adiada (`client:visible`, `client:idle`): todas as ilhas hidratam no carregamento. Se precisar, o runtime ganha um `IntersectionObserver`.

## Pilares Well-Architected

Segurança (CSP estrita mantida) e eficiência de performance (JavaScript mínimo e sob demanda).

## Revisar quando

O Astro permitir ilhas sem script inline, ou a CSP passar a ser gerada por página.
