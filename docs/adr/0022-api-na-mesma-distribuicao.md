# 0022. API na mesma distribuição do CloudFront

- Status: aceita
- Data: 2026-10-09
- Decisão do spec: D5 (complementa)

## Contexto

A API (API Gateway HTTP + Lambda, ADR 0005) fica atrás da mesma distribuição do site, no caminho `/api/*`: mesma origem para o navegador, mesmo WAF, mesmos cabeçalhos de segurança. Quatro detalhes da borda afetam a API:

- As páginas de erro personalizadas (`custom_error_response`) valem para a distribuição inteira, não por caminho, e CloudFront Functions não rodam nas respostas da origem. Na Fase 0, 403 e 404 viravam `/404.html`; um 404 em JSON da API chegaria ao app como HTML.
- O bucket do site, sem `s3:ListBucket`, responde 403 para arquivo inexistente. O WAF também bloqueia com 403.
- A regra `SizeRestrictions_BODY` do conjunto gerenciado `AWSManagedRulesCommonRuleSet` bloqueia corpos acima de 8 KB.
- O endereço `*.execute-api` do API Gateway é público: sem proteção, daria para chamar a API sem passar pelo WAF.

## Decisão

- `/api/*` vai para o API Gateway sem cache (`Managed-CachingDisabled`), com todos os cabeçalhos do visitante exceto `Host` (`Managed-AllViewerExceptHostHeader`), a mesma política de cabeçalhos de segurança e sem a função de borda (ela reescreve caminhos para `index.html`).
- Só o **403** vira a página 404 do site. A API **nunca responde 403 pelo CloudFront**: usa 400 (pedido inválido, inclusive `Origin` errada), 401 (sem login) ou 404 (não existe), sempre em JSON.
- O rate limit do WAF responde **429** com corpo JSON (`rate_limited`) e `Retry-After: 300`, em vez do 403 padrão.
- Origem fechada: o CloudFront envia o cabeçalho `x-origin-verify` com um segredo gerado pelo Terraform (`random_password`, guardado no estado). A API compara em tempo constante e responde 403 sem ele; esse 403 só aparece em acesso direto, que não passa pelo CloudFront. O deploy confere que o acesso direto dá 403. O segredo chega à Lambda por variável de ambiente, não pelo SSM (spec §5.4): ele já fica visível na configuração da distribuição, e buscá-lo no SSM só somaria uma chamada ao cold start. A troca é por PR (`origin_verify_version`).
- Corpo de requisição até 8 KB, igual ao WAF: acima disso a API responde 413 em JSON, também no ambiente local. Arquivos grandes vão direto ao S3 por URL pré-assinada (Fase 2).
- Respostas da API levam `Cache-Control: no-store`.

## Alternativas consideradas

- Subdomínio próprio (`api.<domínio>`): CORS, mais um certificado e mais uma distribuição (ou domínio customizado no API Gateway), cookies entre subdomínios. Mais peças para o mesmo resultado.
- Dar `s3:ListBucket` ao OAC, para o S3 responder 404, e mapear só o 404: a API perderia os 404 em JSON, mais comuns que 403.
- Desligar o endpoint `execute-api` (`disable_execute_api_endpoint`): exige domínio customizado regional no API Gateway, com certificado e DNS próprios.

## Consequências

- Positivas: uma origem só para o navegador (sem CORS; cookies `SameSite=Lax` simples na Fase 1C); WAF e cabeçalhos de segurança valem para a API; erros da API chegam sempre em JSON.
- Negativas: bloqueios das regras gerenciadas do WAF (403) chegam ao app como a página 404 em HTML, então o cliente da API trata resposta sem JSON como erro genérico. Trocar o segredo de origem causa alguns minutos de erro na API enquanto o CloudFront propaga (runbook de deploy). O 429 em JSON depende de continuar no CloudFront pay-as-you-go (ADR 0019): nos planos flat-rate, respostas customizadas exigem o plano Pro. Pelo CloudFront, um corpo acima de 8 KB é barrado antes pelo WAF (403, que vira a página 404); o 413 da API aparece no ambiente local e em acesso direto e serve de rede de proteção. Por isso o cliente da API (Fase 1C) manda a mescla do progresso um curso por vez: cada curso mescla de forma independente, e o pedido fica bem abaixo do limite. O endereço `execute-api` do API Gateway não passa pelo WAF: sem o segredo, a API responde 403, mas cada chamada ainda invoca a Lambda; o throttling do estágio (`throttling_rate_limit` e `throttling_burst_limit` no módulo `api`) limita o custo de um abuso.

## Pilares Well-Architected

Segurança (WAF e cabeçalhos na API, origem fechada, CSRF por `Origin`), confiabilidade (erros previsíveis para o app) e custo (uma distribuição só).

## Revisar quando

A API precisar de respostas em cache na borda ou de corpos acima de 8 KB, ou o CloudFront passar a permitir páginas de erro por comportamento.
