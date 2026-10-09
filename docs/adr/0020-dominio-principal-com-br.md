# 0020. Domínio principal .com.br

- Status: aceita
- Data: 2026-10-09
- Decisão do spec: D19

## Contexto

O site nasceu em `escolagratisdetecnologia.com` (prod) e `dev.escolagratisdetecnologia.com` (dev). Em 2026-10-09 o mantenedor registrou `escolagratisdetecnologia.com.br` no GoDaddy e escolheu torná-lo o endereço oficial da escola. Ainda não há alunos, certificados emitidos nem e-mails enviados: trocar agora não quebra links nem credenciais.

## Decisão

- Prod passa a responder em `escolagratisdetecnologia.com.br`. `www.escolagratisdetecnologia.com.br`, `escolagratisdetecnologia.com` e `www.escolagratisdetecnologia.com` redirecionam para ele com 301, mantendo caminho e query.
- Os redirecionamentos usam a mesma distribuição do CloudFront, o mesmo WAF e a mesma CloudFront Function que já redirecionavam o `www`. O certificado ACM de prod cobre os quatro nomes.
- A zona `escolagratisdetecnologia.com.br` fica na conta prod e é criada no bootstrap (`additional_zone_names`). A zona `escolagratisdetecnologia.com` continua na conta prod, para os redirecionamentos e para a delegação de dev.
- Dev continua em `dev.escolagratisdetecnologia.com`.
- Nas próximas fases, os nomes de prod usam o `.com.br`: `auth.escolagratisdetecnologia.com.br` (Cognito), o domínio de e-mail do SES e o emissor `did:web:escolagratisdetecnologia.com.br` dos certificados (ADR 0010). Em dev, `auth.dev.escolagratisdetecnologia.com`.

Custo: US$ 0,50 por mês da zona nova, mais impostos. O certificado ACM é gratuito e os redirecionamentos ficam no free tier do CloudFront. O registro anual dos dois domínios no GoDaddy entra na transparência financeira (Fase 4).

## Alternativas consideradas

- `.com.br` redirecionando para o `.com`: a mesma infraestrutura, mas com o endereço oficial no `.com`.
- Encaminhamento do GoDaddy: sem custo, mas fora do Terraform e da auditoria por tag, com HTTPS dependente do GoDaddy.
- Mover dev para `dev.escolagratisdetecnologia.com.br`: tudo no mesmo domínio, ao custo de recriar a zona e a delegação de dev sem ganho para quem usa o site.

## Consequências

- Positivas:
  - Endereço oficial em domínio brasileiro, e quem digitar `.com` ou `www` chega ao mesmo lugar.
  - Nenhum serviço novo: a borda continua com uma distribuição e um WAF por ambiente.
- Negativas:
  - Dois domínios para renovar. Se o `.com` expirar, os links antigos param de redirecionar.
  - Prod (`.com.br`) e dev (`.com`) ficam em domínios diferentes.
  - Na troca, o certificado de prod é recriado (o ACM não altera os nomes de um certificado existente). A validação por DNS exige que a delegação do `.com.br` já esteja publicada antes do deploy.

## Pilares Well-Architected

Excelência operacional (tudo no Terraform, na mesma borda), confiabilidade (os endereços antigos continuam funcionando) e custo (só a zona nova).

## Revisar quando

Algum dos dois domínios deixar de ser renovado, ou dev precisar estar no mesmo domínio de prod (por exemplo, para testar cookies ou a federação do Cognito).
