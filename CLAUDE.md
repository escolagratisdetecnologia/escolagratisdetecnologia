# Escola Grátis de Tecnologia — guia para o Claude

## Missão

Escola online 100% gratuita e beneficente para brasileiros (maioria geração Z, pouca experiência com tecnologia) aprenderem em microcursos, saírem resolvendo um problema real e receberem certificado verificável.

- Design (fonte de verdade): `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`
- Decisões: `docs/adr/` · Well-Architected: `docs/arquitetura/well-architected.md` · Operação: `docs/runbooks/`
- Planos por fase: `docs/superpowers/plans/`

## Mapa do repositório

| Caminho            | O que é                                                     | Guia                 |
| ------------------ | ----------------------------------------------------------- | -------------------- |
| `apps/web`         | Site Astro static-first (PWA a partir da Fase 1)            | `apps/web/CLAUDE.md` |
| `apps/api`         | API Hono (Lambda + servidor local)                          | `apps/api/CLAUDE.md` |
| `packages/content` | Schemas e validação do conteúdo (`pnpm content:check`)      | `content/CLAUDE.md`  |
| `packages/core`    | Regras puras (progresso, conclusão)                         | —                    |
| `packages/db`      | Tabela única, ElectroDB e repositórios (DynamoDB e memória) | `apps/api/CLAUDE.md` |
| `content/`         | Cursos em Markdown e YAML                                   | `content/CLAUDE.md`  |
| `tools/`           | CLIs e scripts do repositório                               | `tools/CLAUDE.md`    |
| `infra/`           | Terraform: `bootstrap/`, `modules/`, raiz `live/`           | `infra/CLAUDE.md`    |
| `docs/`            | Specs, planos, ADRs, arquitetura, runbooks                  | —                    |

## Comandos

- `mise install` — Node 24, pnpm, Terraform, tflint, Trivy, Infracost nas versões do projeto
- Em shells não interativos (como os de agentes), as ferramentas do mise ficam disponíveis com `export PATH="$HOME/.local/share/mise/shims:$PATH"`. Para reaproveitar providers do Terraform entre raízes, use `export TF_PLUGIN_CACHE_DIR="$HOME/.cache/terraform-plugins"`.
- `pnpm install`
- `pnpm dev` — site em http://localhost:4321 e API em http://localhost:3001 (o site encaminha `/api`)
- `pnpm lint` · `pnpm format` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm build`
- `pnpm db:up` — sobe o DynamoDB Local no Docker; a API cria a tabela ao iniciar. Sem Docker, o `pnpm dev` guarda o progresso na memória. Testes de integração: `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test` (na CI, sempre).
- `pnpm content:check` — valida os cursos de `content/` (roda na CI); recusa HTML solto no Markdown (HTML dentro de código e autolinks são aceitos), usando o lexer do `marked`, o mesmo renderizador do site
- `infra/tf <raiz> <ambiente> <comando>` — Terraform com backend e variáveis do ambiente (ex.: `infra/tf live dev plan`)

## Convenções

- **Idioma:** documentação, ADRs, commits e PRs em pt-BR. Identificadores, comentários técnicos, logs e mensagens de exceção em inglês. Todo texto exibido a pessoas (UI, respostas da API, saída de CLIs do repo) em pt-BR, no tom da Escola: próximo, simples, sem jargão sem explicação. No Terraform, as `description` de `variable` e `output` são pt-BR (documentação do módulo); os metadados que vão para a AWS (atributos `comment`/`description` de recursos AWS) são em inglês, só ASCII.
- **TDD:** teste que falha → ver falhar → implementação mínima → ver passar → commit.
- **TypeScript:** estrito, ESM, imports relativos com extensão `.ts` (o Node 24 executa TypeScript direto; esbuild e Astro empacotam).
- **Commits:** Conventional Commits em pt-BR (`feat(api): ...`, `fix(web): ...`, `docs: ...`).
- **PRs:** toda mudança entra por PR na `main`. Preencha o template (delta de custo, pilares, ADR).
- **Arquitetura:** decisão nova ou alterada exige ADR em `docs/adr/` e atualização de `docs/arquitetura/well-architected.md`.
- **Infra:** PR com plano Terraform e delta de custo (Infracost). Nunca rode `apply` em prod fora do pipeline. Exceção: o bootstrap e a remoção total, executados pelo mantenedor seguindo os runbooks (`docs/runbooks/bootstrap-aws.md` e `docs/runbooks/remover-projeto.md`).
- **Tags AWS:** obrigatórias em todo recurso — veja `infra/CLAUDE.md`, seção Tags.
- **Segredos:** nunca no repositório (nem e-mails pessoais ou IDs de conta). Use SSM Parameter Store, GitHub Secrets/Variables e `.env` local (ignorado pelo git).
- **Produto:** pré-requisitos mínimos, mobile-first e acessibilidade são requisitos, não extras.

## Antes de dizer que terminou

`pnpm lint && pnpm typecheck && pnpm test` verdes. Mexeu no site: `pnpm test:e2e`. Mexeu na API ou em `packages/db`: `pnpm db:up` e `DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test`. Mexeu em `infra/`: `terraform fmt -check -recursive infra`, `terraform validate` da raiz afetada, `tflint` e `trivy config`.

## MCP e ações externas

`.mcp.json` declara HeyGen, Buffer, Stripe e GitHub — chaves e usos em `docs/runbooks/mcp.md`. Publicar post, criar link de pagamento, gerar vídeo (consome créditos), mudar DNS ou criar recursos na AWS só com aprovação explícita do mantenedor.
