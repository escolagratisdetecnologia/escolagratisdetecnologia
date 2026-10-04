# tools — CLIs e scripts do repositório

- **CLIs em TypeScript** rodam direto no Node 24: `node tools/<nome>/src/cli.ts`. Evite dependências de runtime para que rodem no CI sem `pnpm install`.
- **Separação:** lógica pura e testada em `src/<nome>.ts`; `src/cli.ts` só faz entrada/saída e códigos de saída (0 ok, 1 encontrou problema, 2 uso incorreto).
- **Saída para pessoas em pt-BR.**
- **Scripts bash:** `set -euo pipefail`, validar argumentos com mensagem de uso, passar no shellcheck.
- **Existentes:** `check-tags` (tags no plano Terraform), `tag-audit` (recursos sem tag `Project`), `deploy-site.sh`, `smoke.sh`.
