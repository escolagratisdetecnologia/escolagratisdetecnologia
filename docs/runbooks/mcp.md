# Servidores MCP do projeto

O `.mcp.json` declara os conectores usados pelas skills de operação (ADR 0011). As chaves vêm de variáveis de ambiente do seu shell — nunca do repositório.

| Servidor | URL                                  | Autenticação              | Variável         | Uso                                                                     |
| -------- | ------------------------------------ | ------------------------- | ---------------- | ----------------------------------------------------------------------- |
| HeyGen   | `https://mcp.heygen.com/mcp/v1/`     | OAuth (sem chave)         | —                | Elenco, Video Agent, cortes. **Só no Claude Code local do mantenedor.** |
| Buffer   | `https://mcp.buffer.com/mcp`         | Bearer                    | `BUFFER_API_KEY` | Agendar posts e ler métricas                                            |
| Stripe   | `https://mcp.stripe.com`             | Bearer (chave restrita)   | `STRIPE_MCP_KEY` | Payment Links e consultas de receita                                    |
| GitHub   | `https://api.githubcopilot.com/mcp/` | Bearer (PAT fine-grained) | `GITHUB_MCP_PAT` | Branches, PRs, issues                                                   |

## Configurar

1. Gere as chaves:
   - Buffer: https://publish.buffer.com/settings/api
   - Stripe: Dashboard → Developers → API keys → **Restricted key**. Para consultas use só leitura (Balance, Balance transactions, Charges, Payment Links). Para criar links de doação, gere uma chave separada com escrita apenas em Payment Links e Prices/Products, e apague-a depois do uso.
   - GitHub: Settings → Developer settings → Fine-grained token, só neste repositório (Contents, Pull requests e Issues: read/write).
2. Exporte no seu shell (ex.: `~/.bashrc` ou `direnv`), nunca em arquivo versionado:
   `export BUFFER_API_KEY=... STRIPE_MCP_KEY=... GITHUB_MCP_PAT=...`
3. Abra o Claude Code na raiz do repo, aprove os servidores do projeto e rode `/mcp`. No HeyGen, conclua o login OAuth.

Se você já usa os conectores do claude.ai para o mesmo serviço, recuse o servidor duplicado do projeto.

## No CI

Workflows que usam Buffer ou Stripe (Fases 4 e 5) recebem as chaves por GitHub Secrets. O HeyGen não aceita chave no MCP remoto; por isso a geração de vídeos não roda no CI.

## Regras

- Publicar post, criar link de pagamento e gerar vídeo (consome créditos) só com aprovação explícita.
- Chave vazou? Revogue no painel do serviço imediatamente e gere outra.
