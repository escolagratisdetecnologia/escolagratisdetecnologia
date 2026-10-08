# Escola Grátis de Tecnologia

Aprenda tecnologia de graça, em aulas curtinhas pensadas pro celular, e saia de cada curso resolvendo um problema de verdade — com certificado que qualquer pessoa consegue conferir.

> **Status:** Fase 0 (fundação). Site: https://escolagratisdetecnologia.com

## Por que existe

- **100% grátis e beneficente:** sem anúncios, sem venda de dados.
- **Mão na massa:** todo curso termina num projeto real, corrigido e certificado (Open Badges 3.0).
- **Aberto e transparente:** código e conteúdo abertos; finanças públicas na página de transparência (Fase 4).

## Rodar localmente

1. Instale o [mise](https://mise.jdx.dev) e rode `mise install` (Node 24, pnpm, Terraform e ferramentas). Em shells não interativos, as ferramentas do mise ficam em `$HOME/.local/share/mise/shims`.
2. `pnpm install`
3. `pnpm dev` → site em http://localhost:4321 e API em http://localhost:3001/api/health

Verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.

No Linux/WSL, o WebKit dos testes e2e pode exigir, uma única vez: `sudo env "PATH=$HOME/.local/share/mise/shims:$PATH" pnpm --filter @egt/web exec playwright install-deps webkit chromium`.

## Estrutura

| Caminho    | O que é                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| `apps/web` | Site (Astro, static-first)                                               |
| `apps/api` | API (Hono; roda localmente nesta fase, deploy na AWS a partir da Fase 1) |
| `tools/`   | CLIs e scripts do repositório                                            |
| `infra/`   | Infraestrutura como código (Terraform, AWS)                              |
| `docs/`    | Design, decisões (ADRs), arquitetura e runbooks                          |

## Documentação

- Design completo: `docs/superpowers/specs/2026-10-03-escola-gratis-de-tecnologia-design.md`
- Decisões de arquitetura: `docs/adr/`
- Revisão AWS Well-Architected: `docs/arquitetura/well-architected.md`
- Runbooks de operação (`docs/runbooks/`):
  - [Bootstrap da AWS](docs/runbooks/bootstrap-aws.md)
  - [Configuração do GitHub](docs/runbooks/configurar-github.md)
  - [Deploy, reexecução e rollback](docs/runbooks/deploy.md)
  - [Plano flat-rate do CloudFront](docs/runbooks/cloudfront-flat-rate.md) (não usado hoje; ADR 0019)
  - [Servidores MCP](docs/runbooks/mcp.md)
  - [Remover 100% do projeto da AWS](docs/runbooks/remover-projeto.md)

## Contribua

Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licenças

- Código: [AGPL-3.0-or-later](LICENSE)
- Conteúdo: [CC BY-SA 4.0](LICENSE-CONTENT.md)
- Nome e marca: [TRADEMARK.md](TRADEMARK.md)
