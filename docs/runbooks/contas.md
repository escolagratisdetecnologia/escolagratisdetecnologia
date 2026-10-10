# Contas de alunos (Cognito, Google e e-mail)

Como preparar, conferir e operar o login dos alunos (ADR 0024).

## Antes do primeiro deploy da Fase 1C

Faça uma vez, antes de abrir o PR da Fase 1C: o plano Terraform do PR já precisa dos valores do Google.

### 1. Clientes OAuth do Google

1. Em https://console.cloud.google.com, crie o projeto `Escola Gratis de Tecnologia` (um projeto serve aos dois ambientes).
2. Google Auth Platform → **Branding**: nome do app `Escola Grátis de Tecnologia`, e-mail de suporte e domínios autorizados `escolagratisdetecnologia.com.br` e `escolagratisdetecnologia.com`.
3. **Audience**: tipo **External**, depois **Publish app**. Em "Testing", só os usuários de teste conseguem entrar. Os escopos usados (`openid` e `email`) não exigem a verificação do app; a verificação da tela de consentimento é um portão do lançamento (spec §20).
4. **Clients** → **Create client** → **Web application**, um por ambiente, cada um com uma única URI de redirecionamento autorizada:

   | Cliente    | URI de redirecionamento autorizada                                 |
   | ---------- | ------------------------------------------------------------------ |
   | `egt-dev`  | `https://auth.dev.escolagratisdetecnologia.com/oauth2/idpresponse` |
   | `egt-prod` | `https://auth.escolagratisdetecnologia.com.br/oauth2/idpresponse`  |

5. Guarde o **Client ID** e o **Client secret** de cada um.

### 2. Valores no GitHub

Settings → Secrets and variables → Actions (no repositório, não nos environments, porque o plano dos PRs roda sem environment):

| Tipo     | Nome                        | Valor                           |
| -------- | --------------------------- | ------------------------------- |
| Variable | `GOOGLE_CLIENT_ID_DEV`      | Client ID do cliente `egt-dev`  |
| Variable | `GOOGLE_CLIENT_ID_PROD`     | Client ID do cliente `egt-prod` |
| Secret   | `GOOGLE_CLIENT_SECRET_DEV`  | Client secret do `egt-dev`      |
| Secret   | `GOOGLE_CLIENT_SECRET_PROD` | Client secret do `egt-prod`     |

O Client ID aparece no navegador durante o login, então pode ser Variable. O secret, nunca.

### 3. E-mail (SES) no sandbox

Contas novas da AWS ficam no sandbox do SES: só endereços verificados recebem e-mail (até 200 por dia). O deploy cria sozinho a identidade do domínio (DKIM, MAIL FROM `bounce.<domínio>` e DMARC). Para testar o código por e-mail antes do lançamento, verifique o seu endereço em cada conta:

1. Console da conta `egt-dev` (depois `egt-prod`), região **São Paulo (sa-east-1)** → Amazon SES → **Identities** → **Create identity** → **Email address**.
2. Abra o e-mail da AWS e clique no link de confirmação.

Antes do lançamento público (spec §20), peça a saída do sandbox na conta de prod: SES → **Account dashboard** → **Request production access** → tipo **Transactional**, site `https://escolagratisdetecnologia.com.br`, e a descrição "Códigos de login de uma escola online gratuita, enviados só para quem pede na tela de entrar". A AWS responde em até 24 horas. O login com Google funciona mesmo no sandbox.

## Depois do deploy: conferir no dev

Alguns comportamentos só a AWS mostra (ADR 0024). Depois do primeiro deploy, **segure a aprovação do `prod` até estas conferências passarem**. Confira em https://dev.escolagratisdetecnologia.com, com um e-mail verificado no SES do dev. Os itens 4 e 5 usam outros endereços: verifique cada um no SES do dev antes, do mesmo jeito que o seu (seção 3), senão o código não chega. Antes de tudo:

- **Plano sem mudanças:** logo depois do primeiro apply, rode `infra/tf live dev plan` de novo. Ele deve mostrar zero mudanças; se mostrar alguma, abra uma issue.
- **Domínio de login:** `https://auth.dev.escolagratisdetecnologia.com` precisa responder com TLS antes das conferências do Google (o domínio do Cognito pode demorar um pouco depois do primeiro apply).

Confira:

1. **E-mail novo:** chega um código de 6 dígitos, com o e-mail em português. Depois do código, a página pede o ano de nascimento e o aceite dos termos, e a aba Eu mostra o seu e-mail.
2. **Login de novo:** saia e entre com o mesmo e-mail. Desta vez chega um código de 8 dígitos.
3. **Google com o mesmo e-mail:** entre com o Google usando a conta desse e-mail. Você volta logado na mesma conta, com o mesmo progresso. Na primeira vez, o navegador vai ao Google duas vezes seguidas, sozinho.
4. **Google primeiro:** com outro e-mail, entre primeiro pelo Google e complete o cadastro. Saia e entre pelo código no e-mail. Deve ser a mesma conta (a aba Eu não pede cadastro de novo).
5. **Google sobre cadastro não confirmado:** comece o cadastro por e-mail com um terceiro endereço, sem digitar o código. Depois entre com o Google usando esse endereço: o cadastro deve terminar e o próximo código por e-mail deve entrar na mesma conta (a aba Eu não pede cadastro de novo).
6. **Dois aparelhos:** conclua uma aula num navegador e veja o progresso aparecer em outro (ou numa janela anônima) com a mesma conta.
7. **Seus dados:** na aba Eu, baixe os dados (JSON) e exclua a conta. Depois disso, entrar com o mesmo e-mail pede o cadastro de novo.
8. **Reenviar o código:** com um e-mail novo, clique em "Receber código" e, antes de digitar, em "Enviar outro código": chega um código novo.
9. **Sessão com mais de 1 hora:** deixe uma aba aberta por mais de uma hora, conclua uma aula nela e veja o progresso salvar, sem pedir login de novo.
10. **Excluir com Google vinculado:** exclua uma conta que tem o Google vinculado e entre com "Entrar com Google" de novo: a página pede o cadastro outra vez, sem erros.
11. **Aparelho compartilhado:** entre com o Google, clique em "Sair" e em "Entrar com Google" de novo no mesmo navegador: a escolha de conta do Google deve aparecer, sem entrar sozinho na conta anterior. Se entrar sozinho, abra uma issue antes do lançamento.
12. **Cadastro incompleto:** entre por e-mail e não termine o cadastro. Na aba Eu e em `/entrar/cadastro/`, "Sair" e "Cancelar cadastro" funcionam, e o progresso do aparelho continua.

Se algo falhar, veja os problemas comuns abaixo e os logs (CloudWatch, conta do ambiente): `/aws/lambda/egt-<env>-api-handler` (a API) e `/aws/lambda/egt-<env>-auth-triggers` (os gatilhos do Cognito).

## Problemas comuns

- **O código não chega:** o SES está no sandbox e o e-mail não foi verificado (veja acima). Confira também o spam.
- **"Não deu para entrar com o Google":** confira a URI de redirecionamento no Google Cloud (exatamente `https://auth.<domínio>/oauth2/idpresponse`), se o app do Google foi publicado e se o Client ID e o secret no GitHub são do ambiente certo (depois de corrigir, rode o deploy de novo). Nos logs da API, procure `google_sign_in_failed`.
- **"Muitas tentativas em pouco tempo" (429):** o WAF aceita até 50 requisições por IP a cada 5 minutos em `/api/auth/*`. Espere 5 minutos.
- **O e-mail do código chega em inglês:** o gatilho de mensagem não foi chamado para aquele tipo de código. Abra uma issue; a alternativa é o modelo de mensagem do próprio pool (um bloco `email_mfa_configuration`, que hoje não existe, a acrescentar ao pool no módulo `auth`).

## Trocar o segredo do Google

1. No Google Cloud, em **Clients**, abra o cliente do ambiente e adicione um secret novo (o antigo continua valendo).
2. Atualize o Secret `GOOGLE_CLIENT_SECRET_<AMBIENTE>` no GitHub.
3. Rode o deploy (Actions → **deploy** → **Run workflow**).
4. Depois do deploy, apague o secret antigo no Google Cloud.

## Pedido de exclusão fora do site

Se alguém pedir a exclusão sem conseguir entrar (por exemplo, perdeu o acesso ao e-mail), confirme a identidade da pessoa pelo canal de atendimento e então, no console da conta de prod:

1. Cognito → User pools → `egt-prod-auth-learners` → **Users** → busque o e-mail → anote o `sub`. Se o atributo `identities` lista o Google, anote também o `userId` dele e desvincule antes de apagar:
   `aws cognito-idp admin-disable-provider-for-user --user-pool-id <id do pool> --user ProviderName=Google,ProviderAttributeName=Cognito_Subject,ProviderAttributeValue=<userId do Google em identities>`
2. DynamoDB → Tables → `egt-prod-data-main` → **Explore items** → consulta com `PK = USER#<sub>` → selecione todos os itens → **Delete items** (o perfil e o progresso saem primeiro, como na API).
3. Por último, no Cognito, **Delete user**.
