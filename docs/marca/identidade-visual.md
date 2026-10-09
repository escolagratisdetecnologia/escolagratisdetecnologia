# Identidade visual

Escolhida pelo mantenedor em 2026-10-09: proposta "Caderno" (azul de caneta e marca-texto amarelo) com o logo EGT que a Escola já usa nas redes sociais.

## Logo

- Monograma EGT com o capelo: `apps/web/public/brand/egt-mark.svg` (letras grafite `#1a2129`, azul `#0066ff`) e `egt-mark-dark.svg` (letras `#eef1fb`) para o tema escuro. O site troca os dois com `<picture>` e `prefers-color-scheme`.
- Vetorizados a partir da arte original (PNG de 1254 px) com o vtracer e otimizados com o svgo (3,7 KB cada). Não recolora fora dessas duas versões.
- Altura mínima: 16 px. No cabeçalho, 32 px, ao lado de "Escola Grátis de Tecnologia" na fonte de títulos.
- Ícones do app e favicon: o monograma sobre fundo branco (`apps/web/public/icons/` e `apps/web/public/favicon.svg`), para aparecerem em telas e abas escuras. O ícone `maskable` deixa o monograma dentro da área segura central (66% da largura).

## Cores

Tokens em `apps/web/src/styles/global.css`. Todos os pares de texto passam no nível AA da WCAG 2.2 (5,8:1 ou mais).

| Token                  | Claro     | Escuro    | Uso                                               |
| ---------------------- | --------- | --------- | ------------------------------------------------- |
| `--color-bg`           | `#ffffff` | `#0d1226` | fundo                                             |
| `--color-surface`      | `#eef2fb` | `#182041` | cartões, trilho das barras                        |
| `--color-line`         | `#d6ddef` | `#2a3460` | bordas decorativas                                |
| `--color-fg`           | `#1a2129` | `#eef1fb` | texto (grafite do logo)                           |
| `--color-muted`        | `#4b5576` | `#aab3d6` | texto secundário                                  |
| `--color-accent`       | `#0052cc` | `#80b2ff` | links, botões, barras (mesmo tom do azul do logo) |
| `--color-accent-fg`    | `#ffffff` | `#0d1226` | texto sobre o azul                                |
| `--color-highlight`    | `#ffe14d` | `#ffd84a` | marca-texto                                       |
| `--color-highlight-fg` | `#1a2129` | `#0d1226` | texto sobre o marca-texto                         |
| `--color-success`      | `#17663a` | `#7fdca3` | resposta certa                                    |
| `--color-danger`       | `#b42318` | `#ff9b8f` | resposta errada, ação destrutiva                  |

**Marca-texto:** cobre a altura inteira da palavra e o texto sobre ele é sempre escuro, nos dois temas. Nunca use o amarelo como cor de texto, barra ou ícone: sobre o fundo claro ele não tem contraste.

## Tipografia

- Títulos e wordmark: Bricolage Grotesque, peso 800, licença OFL (`apps/web/public/fonts/OFL-bricolage-grotesque.txt`). Arquivo `bricolage-grotesque-800.woff2` com 17,6 KB: instância `wght=800, wdth=100, opsz=32` e subconjunto latino com todos os acentos do português, gerados assim:

      fonttools varLib.instancer "BricolageGrotesque[opsz,wdth,wght].ttf" wght=800 wdth=100 opsz=32 -o bricolage-800.ttf
      pyftsubset bricolage-800.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+0152-0153,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+20AC" --layout-features="kern,liga,calt" --flavor=woff2 --no-hinting --desubroutinize --output-file=bricolage-grotesque-800.woff2

- Texto corrido: fonte do sistema (zero download).
- `font-display: optional`: se a fonte demorar na primeira visita, os títulos ficam na fonte do sistema e nada pula na tela.

## Ícones do app

Gerados do `egt-mark.svg` com o sharp (dependência do Astro): fundo branco, monograma centralizado com 80% da largura (`icon-192.png`, `icon-512.png`), 66% no `icon-maskable-512.png` e 78% no `apple-touch-icon.png` (180 px).
