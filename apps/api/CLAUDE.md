# apps/api — API Hono

- **Composição:** `createApp(config)` em `src/app.ts` monta as rotas. Cada recurso fica em `src/routes/<recurso>.ts`, exportando uma função que recebe dependências e devolve um `Hono`.
- **Entradas finas:** `src/lambda.ts` (handler AWS) e `src/server.ts` (servidor local) não têm lógica.
- **Configuração:** só `src/config.ts` lê `process.env` (`loadConfig`). O resto recebe `AppConfig` por parâmetro.
- **Erros:** sempre `{ error: { code, message } }` — `code` em snake_case inglês, `message` em pt-BR no tom da Escola. 404 `not_found`, 500 `internal_error`; validação (zod, Fase 1) → 400 `invalid_request`.
- **Testes:** Vitest com `app.request()`; um arquivo por rota em `test/`; nada de rede real.
- **Logs:** JSON estruturado em inglês (Powertools for AWS Lambda a partir da Fase 1).
- **Bundle:** esbuild → `dist/lambda.mjs` (Node 24, ESM, arm64). Mantenha dependências enxutas — tamanho do bundle afeta o cold start.
