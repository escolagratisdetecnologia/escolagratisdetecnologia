# apps/web — site Astro

- **Static-first:** páginas geradas no build, zero JavaScript por padrão. Interatividade só em ilhas (Preact, a partir da Fase 1), carregadas sob demanda.
- **Orçamentos (CI bloqueia):** ≤ 30 KB de JS por página de conteúdo, LCP ≤ 2,0 s, CLS ≤ 0,05, Lighthouse ≥ 95 em performance, acessibilidade, boas práticas e SEO.
- **CSP estrita:** nada de `<script>` ou `<style>` inline (`build.inlineStylesheets: 'never'`). Precisa de script? Arquivo externo.
- **Acessibilidade (WCAG 2.2 AA):** `lang="pt-BR"`, um `h1` por página, alvos de toque ≥ 48 px, contraste, foco visível, `prefers-reduced-motion`, texto alternativo. O e2e roda axe em todas as páginas novas.
- **Mobile-first:** CSS começa no celular; media queries só ampliam.
- **Design tokens:** cores, espaços e raios em `src/styles/global.css` (claro e escuro). Não use cores soltas.
- **Variáveis de build:** `SITE_URL` (URL canônica) e `SITE_ENV` (`local` | `dev` | `prod`, via `astro:env`). Fora de `prod`, páginas `noindex` e `robots.txt` bloqueando tudo.
- **Microcopy:** tom da Escola — trate por "você", frases curtas, verbos de ação ("Bora começar", "Concluir e continuar"), sem gíria forçada, sem "clique aqui".
- **Astro 7:** compilador estrito — feche todas as tags; `compressHTML: true` mantém o espaço entre elementos inline.
- **Astro 7 e agentes de IA:** o Astro detecta agentes de IA e manda o `astro preview` para segundo plano. Em testes e scripts use `astro preview --ignore-lock` (já configurado no `playwright.config.ts`) e encerre o servidor pelo PID.
- **Estrutura:** `src/layouts/`, `src/pages/`, `src/styles/`, `public/`, `e2e/` (Playwright: Pixel 7 e iPhone 14).
