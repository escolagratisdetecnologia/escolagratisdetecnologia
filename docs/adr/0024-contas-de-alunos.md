# 0024. Contas de alunos: Cognito sem senha atrás da API

- Status: aceita
- Data: 2026-10-10
- Decisão do spec: D7 e D8 (detalha)

## Contexto

A Fase 1C liga o login de verdade (spec §5): código por e-mail e Google no pool Essentials, telas próprias e sessão em cookies HttpOnly. Ao detalhar, apareceram restrições do Cognito:

- O login sem senha por código (`EMAIL_OTP`) exige o plano Essentials, envio pelo SES (`DEVELOPER`, na mesma região do pool) e um domínio do pool, mesmo sem usar as páginas do Cognito. Enquanto a conta estiver no sandbox do SES, só endereços verificados recebem e-mail.
- Com a proteção contra enumeração de usuários ligada, o Cognito responde um desafio falso para e-mail sem conta, e o `SignUp` recusa e-mail que já tem conta: quem decide entre cadastro e login é a API.
- O código do cadastro tem 6 dígitos; o do login, 8.
- O primeiro login com Google de quem já tem conta por e-mail só é vinculado num gatilho de pré-cadastro, e esse primeiro login falha por desenho: o Cognito só entra na conta vinculada na tentativa seguinte. Quem entra primeiro pelo Google e depois por e-mail ficaria com duas contas.
- A rotação do refresh token não convive com o fluxo `REFRESH_TOKEN_AUTH`.
- O Cognito não roda localmente.

## Decisão

- **Uma conta por aluno, sempre por e-mail.** Todo aluno é um usuário nativo do pool: o e-mail é o login e o `sub` identifica o aluno nos dados. O gatilho de pré-cadastro vincula o primeiro login com Google ao usuário com o mesmo e-mail. Se esse usuário não existe, o gatilho o cria, sem senha e com o e-mail já verificado. Em seguida, falha de propósito (`ACCOUNT_LINKED`), e a API refaz o login com Google uma vez, sozinha, em `/api/auth/callback`. Só e-mails confirmados pelo Google (`email_verified`) são vinculados. O gatilho só vincula a uma conta de e-mail confirmada. Se a única conta daquele e-mail é um cadastro por e-mail nunca confirmado (sem login e sem dados), o gatilho a apaga e cria uma conta nova, sem senha e com o e-mail verificado, e então vincula o Google. Isso é preciso porque a API apaga cadastros não confirmados no próximo login por e-mail, o que levaria junto o vínculo e os dados do aluno (por isso a Lambda dos gatilhos também tem `cognito-idp:AdminDeleteUser`, só no pool).
- **Código por e-mail pela API (BFF).** `POST /api/auth/email/start` tenta o `SignUp` sem senha. Se o e-mail já tem conta, pede o código de login (`AdminInitiateAuth` com `USER_AUTH` e `EMAIL_OTP`). A resposta é a mesma nos dois casos. O estado do passo seguinte fica num cookie HttpOnly (`egt_login`, 15 minutos). Os e-mails com código saem em pt-BR, escritos pelo gatilho de mensagem.
- **Sessão em cookies** (spec §5.2):
  - `egt_at`: access token, `Path=/api`, 1 hora.
  - `egt_rt`: refresh token, `Path=/api/auth`, 30 dias, com rotação (`GetTokensFromRefreshToken`).
  - `egt_hint`: legível pelo site, só diz que há sessão.

  Todos são `Secure` e `SameSite=Lax`, e só o `egt_hint` não é `HttpOnly`. Nenhum tem `Domain`, então `www` e o `.com` não recebem a sessão: eles só redirecionam para o domínio principal. A API ainda responde nesses nomes, mas sem sessão e, nas mudanças, com o `Origin` errado (ADR 0022).

- **Cadastro completo antes dos dados de estudo.** Depois do primeiro login, o aluno informa o ano de nascimento e aceita os termos (`PATCH /api/me`).
  - Só entra quem nasceu até `ano atual − 13`. Com só o ano, alguém nascido em `ano atual − 12` ainda pode ter 11 anos (regra conservadora, decisão do mantenedor).
  - Abaixo disso, a conta recém-criada é apagada.
  - As rotas de progresso respondem 409 até o cadastro ficar completo.
  - Um cadastro completo nunca é refeito: o pedido responde 409 antes de olhar a idade.
- **Progresso limitado ao catálogo.** O build da API embute as aulas e o número de perguntas de cada curso de `content/`. A API só guarda o que esse catálogo conhece, o que limita o tamanho dos dados por aluno.
- **Autoatendimento da LGPD:** `GET /api/me/export` (JSON) e `DELETE /api/me` (progresso, perfil e usuário do Cognito, com o Google desvinculado antes).
- **Domínio de login e limite do WAF.** O domínio de login é `auth.<domínio>`, com certificado em us-east-1 no módulo `edge`. O WAF tem um limite próprio para `/api/auth/*`: 50 requisições por IP a cada 5 minutos, com 429 em JSON.
- **Ambiente local:**
  - Um provedor no próprio processo da API faz o papel do Cognito: códigos no Mailpit e no terminal, tokens assinados com uma chave em memória.
  - O mock-oauth2-server faz o papel do Google (`pnpm db:up`).
  - O servidor local se recusa a rodar fora de `APP_ENV=local`.
- **Ao sair**, o site apaga o progresso do aparelho, e ele continua na conta (decisão do mantenedor, pensando em celulares compartilhados). Só depois que a API confirma a saída o site apaga o progresso do aparelho; se o pedido falhar, ele mostra o erro e não apaga nada.

## Alternativas consideradas

- Usuários federados separados, unidos pelo e-mail numa tabela de vínculos no nosso banco: mais uma leitura por requisição e mais dados para apagar.
- Páginas do Cognito (managed login): tiram as telas do nosso controle (pt-BR, tom, acessibilidade) e põem outro domínio no fluxo do e-mail.
- Ano e mês de nascimento: bloqueio exato, ao custo de mais um dado pessoal.
- Refresh token sem rotação (`REFRESH_TOKEN_AUTH`): exige o nome do usuário a cada renovação, e a AWS recomenda a rotação.

## Consequências

- Positivas: um aluno, um `sub`, qualquer que seja a forma de entrar. Os tokens nunca chegam ao JavaScript. O login é testável de ponta a ponta localmente e na CI, sem AWS.
- Negativas:
  - O primeiro login com Google de quem já tem conta faz uma ida extra ao Google, automática.
  - O SES precisa sair do sandbox antes do lançamento (portão do spec §20). Até lá, em cada conta, só e-mails verificados no SES recebem código.
  - Alguns comportamentos só a AWS mostra: o código de 8 dígitos, o e-mail em pt-BR no login e a conta criada pelo gatilho entrando com código. Eles são conferidos no dev depois do deploy (`docs/runbooks/contas.md`).
  - Renomear uma aula interrompe o progresso dela: o antigo continua guardado, mas some das telas.
  - Um access token continua válido até expirar (1 hora) depois do logout. Na exclusão da conta, as rotas de dados exigem o perfil, que já foi apagado, então o token antigo não lê nem grava nada.

## Pilares Well-Architected

Segurança (serviço gerenciado, tokens só em cookies HttpOnly, limite do WAF no login, menor privilégio), confiabilidade (cada passo do login testado com fakes, nos testes e no e2e) e custo (Essentials gratuito até 10 mil MAU; SES pago por e-mail enviado).

## Revisar quando

O Cognito passar a vincular contas sem a falha do primeiro login, o projeto chegar a 30 mil MAU (ADR 0007) ou a revisão jurídica pedir outra regra de idade.
