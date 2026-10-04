# 0001. Site static-first com Astro e API serverless

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D1

## Contexto

O público é majoritariamente de celulares intermediários com 4G e plano de dados limitado.

O carregamento precisa ser muito rápido e o custo ocioso deve ser próximo de zero.

## Decisão

O Astro gera HTML estático servido pelo CloudFront. A interatividade vive apenas em ilhas (Preact) carregadas sob demanda. Os dados dinâmicos vêm da API em `/api`.

## Alternativas consideradas

- Next.js SSR em Lambda (OpenNext): mais JavaScript e cold start a cada página.
- SPA React: tela branca até o JavaScript carregar e SEO fraco.

## Consequências

- Positivas:
  - Páginas servidas na borda, orçamento de 30 KB de JavaScript viável e custo ocioso próximo de zero.
- Negativas:
  - Publicar um curso exige novo build; os dados por usuário são montados no cliente.

## Pilares Well-Architected

Performance, custo e sustentabilidade.

## Revisar quando

O build passar de 10 minutos ou surgir conteúdo personalizado que precise de renderização no servidor.
