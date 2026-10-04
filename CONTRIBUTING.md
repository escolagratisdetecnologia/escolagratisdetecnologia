# Como contribuir

Que bom que você quer ajudar! A Escola é feita em aberto e toda contribuição passa por pull request.

## Fluxo

1. Abra uma issue descrevendo o que quer mudar (ou comente numa existente).
2. Crie uma branch a partir da `main` (ou um fork).
3. Rode o projeto localmente (veja o README) e faça a mudança com testes.
4. Rode `pnpm lint && pnpm typecheck && pnpm test` (e `pnpm test:e2e` se mexeu no site).
5. Abra o PR preenchendo o template.

## Convenções

- **Idioma:** docs, commits e PRs em pt-BR; código (nomes, comentários técnicos) em inglês; textos que aparecem para as pessoas em pt-BR.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) — ex.: `feat(web): adiciona página do curso`.
- **Testes primeiro:** escreva o teste que falha antes da implementação.
- **Infra:** mudanças em `infra/` precisam do plano Terraform e do delta de custo no PR; decisões de arquitetura precisam de ADR (`docs/adr/`).
- **Tags AWS:** todo recurso novo segue o padrão de `infra/CLAUDE.md`.
- **Segredos:** nunca commite chaves, e-mails pessoais ou IDs de conta.

## Conteúdo dos cursos

A partir da Fase 3, cursos ficam em `content/courses/` e seguem o guia de estilo em `docs/conteudo/`. Ao contribuir com conteúdo, você concorda em licenciá-lo sob CC BY-SA 4.0.

## Convivência

Seja gentil e paciente: muita gente aqui está começando. Críticas vão para o código, nunca para a pessoa.
