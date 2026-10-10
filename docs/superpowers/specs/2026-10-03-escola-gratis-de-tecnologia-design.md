# Escola Grátis de Tecnologia — Design (spec guarda-chuva)

- **Status:** aprovado em brainstorming (2026-10-03)
- **Escopo:** arquitetura e decisões transversais de todas as fases (0–5). Cada fase terá seu próprio plano de implementação derivado deste documento.
- **Domínio:** `escolagratisdetecnologia.com.br` (`escolagratisdetecnologia.com` redireciona para ele; ADR 0020)
- **Repositório:** `github.com/escolagratisdetecnologia/escolagratisdetecnologia` (monorepo público)

---

## 1. Contexto e objetivos

A **Escola Grátis de Tecnologia** é uma escola online, 100% gratuita e beneficente, para brasileiros que querem aprender um tema de tecnologia em microcursos e **sair de cada curso resolvendo um problema real** — algo que possam vender como serviço (ex.: criar um site com IA, automatizar uma tarefa com Python). Ao concluir, a pessoa recebe um **certificado digital verificável e publicável**.

**Público:** majoritariamente geração Z, brasileira, com pouca a moderada experiência com tecnologia, sem base forte de programação, muitas vezes só com celular ou computador simples e plano de dados limitado.

**Princípios de produto**

1. **Grátis de verdade** — sem paywall, sem anúncios, sem venda de dados.
2. **Resultado concreto** — todo curso termina num projeto que resolve um problema real, corrigido e comprovado.
3. **Pré-requisitos mínimos** — ferramentas gratuitas e no navegador primeiro; nada de hardware caro.
4. **Mobile-first e leve** — abre rápido em celular intermediário com 4G; instalável como app.
5. **Pouca informação na tela** — UX simples, linguagem simples, acessível.
6. **Aberto e transparente** — código e conteúdo abertos; finanças públicas e auditáveis.
7. **Tom jovem, sem forçar a barra** — próximo, bem-humorado, inclusivo.

### 1.1 Rastreabilidade dos requisitos

| Requisito (briefing / blueprint) | Onde é atendido |
|---|---|
| AWS como cloud; serverless e cobrado sob demanda | §3, §11, §16 |
| Anthropic como provedor de IA | §7 (corretor), §8–§10 (operações via Claude Code) |
| GitHub, monorepo | §12 |
| Terraform como IaC; mudanças de arquitetura via PR com delta de custo | §11.4, §11.5 |
| AWS Well-Architected; documentar decisões arquiteturais | §15, §12.3 (ADRs) |
| MCP: Buffer, HeyGen, Stripe | §3.3, §8, §9, §10 |
| Rodar localmente | §13 |
| Testes funcionais e unitários | §14 |
| SSO Google; passwordless por e-mail; MFA via SMS | §5 |
| Site muito rápido | §4.6, §14 |
| Arquivos CLAUDE.md com padrões por seção | §12.2 |
| Licença adequada | §12.4 |
| 100% beneficente; transparência financeira | §10 |
| Resolver problema real como resultado-chave | §4.1, §7 |
| Código aberto | §12.4 |
| Muitos vídeos e muitos microcursos | §4.1, §4.3, §8.4 |
| UX simples e acessível | §4.4, §4.6 |
| Vídeos de preparação do ambiente no início, pré-requisitos mínimos | §4.2 |
| Mobile-first; app instalável (Android e iOS) | §4.4, §4.5 |
| Agendamento automático em redes sociais; formatos variados; métricas por formato e rede; CTA para o site | §9 |
| Certificados digitais publicáveis e verificáveis | §6 |
| HeyGen: avatares diversos falando pt-BR, cenas curtas e lúdicas sem exagero, Video Agent | §8 |
| Stripe: links de pagamento, 100% para o projeto, página de transparência com entradas, gastos e caixa | §10 |
| Tags padronizadas (dev/prod + tag única do projeto) | §11.3 |

---

## 2. Resumo das decisões

| # | Decisão | Alternativas descartadas | Motivo principal |
|---|---|---|---|
| D1 | **Static-first: Astro + ilhas Preact + API serverless** | Next.js SSR em Lambda; SPA React | Menor JS no celular, páginas servidas da borda, custo ~zero ocioso |
| D2 | **Conteúdo como código** (cursos em Markdown/YAML no Git) | CMS headless / admin próprio | Contribuição por PR, revisão, histórico, autoria pelo Claude Code |
| D3 | **Vídeo na AWS** (S3 + MediaConvert HLS + CloudFront) | YouTube embed | Sem anúncios/rastreamento de terceiros, player leve, custo por uso acompanhado por orçamento e alertas (ADR 0019) |
| D4 | **CloudFront pay-as-you-go com WAF** (ADR 0019, que substitui o plano flat-rate da ADR 0004) | Plano flat-rate (Free → Pro/Business) | Tudo no Terraform, sem os limites do plano; custo fixo do WAF e cobrança por uso acompanhados por orçamento e detecção de anomalias |
| D5 | **API única em Lambda (Hono, Node 24, arm64) atrás de API Gateway HTTP** | Uma Lambda por rota; Function URL | Menos cold starts, roda igual localmente, throttling nativo |
| D6 | **DynamoDB on-demand, tabela única** | Aurora Serverless; DSQL | Pago por uso real, sem pausa/retomada lenta, emulador local |
| D7 | **Amazon Cognito Essentials (alunos) + Lite (equipe)** | Biblioteca de auth própria; Cognito Lite + gatilhos | Serviço gerenciado (pilar de segurança); escolha do mantenedor |
| D8 | **SMS: MFA obrigatório para equipe; verificação única do celular do aluno antes do 1º certificado** | SMS a cada login; MFA opt-in | Restrição do Cognito (MFA × passwordless), menor atrito, antifraude |
| D9 | **Avaliação: quizzes formativos + projeto final corrigido pelo Claude** | Só quiz; checklist auto declarado | Certificado comprova o problema resolvido |
| D10 | **Certificados Open Badges 3.0 (VC 2.0, VC-JWT ES256) assinados via KMS; issuer `did:web`** | PDF simples com QR | Padrão aberto, verificável por terceiros, chave nunca sai do KMS |
| D11 | **Operações via Claude Code + MCP, sempre terminando em PR** | Integrações em tempo de execução no app | App enxuto e rápido; revisão humana; trilha de auditoria |
| D12 | **Números financeiros por scripts determinísticos; IA só escreve resumos** | Relatório 100% gerado por IA | Auditabilidade |
| D13 | **Região sa-east-1** (us-east-1 só para ACM/WAF do CloudFront) | us-east-1 | Latência e dados no Brasil |
| D14 | **Contas AWS separadas `dev` e `prod` em AWS Organizations** | Conta única com prefixos | Isolamento de blast radius, custo por ambiente claro |
| D15 | **Tags padronizadas obrigatórias, com tag única `Project`** | — | Pedido do mantenedor: custo e remoção de 100% do projeto por tag |
| D16 | **Licenças: AGPL-3.0-or-later (código), CC BY-SA 4.0 (conteúdo), marca reservada** | MIT/Apache; CC BY-NC | Impede fork comercial fechado; mantém derivados livres |
| D17 | **Docs em pt-BR; código (identificadores, comentários técnicos) em inglês** | Tudo pt-BR; tudo inglês | Comunidade brasileira + padrão de mercado |
| D18 | **Entidade que recebe doações parametrizada** (`entidade.yaml`) | — | Decisão jurídica pendente; Fase 4 só vai ao ar com ela definida |
| D19 | **Domínio principal `escolagratisdetecnologia.com.br`**; `.com` e `www` redirecionam (ADR 0020) | `.com` principal com `.com.br` redirecionando; encaminhamento do GoDaddy | Escolha do mantenedor: domínio brasileiro; a mesma distribuição e o mesmo WAF atendem todos os nomes |

Cada decisão vira um ADR em `docs/adr/` na Fase 0 (§12.3).

---

## 3. Arquitetura

### 3.1 Visão geral

```
                          Aluno (celular / app instalado)
                                       │ HTTPS
           ┌───────────────────────────▼────────────────────────────┐
           │ CloudFront + WAF · escolagratisdetecnologia.com.br     │  pay-as-you-go
           └───────┬───────────────────┬──────────────┬─────────────┘
                /* │            /api/* │              │ /media/*  /credentials/*
     S3 "site" (Astro estático)  API Gateway HTTP     S3 "media" (HLS, legendas,
     /.well-known/did.json       → Lambda "api"       miniaturas, certificados PNG/PDF,
     /cursos/**/achievement.json   (Hono)             status list)
                                       │
       ┌──────────────┬────────────────┼─────────────────┬────────────────────┐
   DynamoDB       Cognito           SQS "grading"      KMS (chave ES256    S3 "ingest" → EventBridge
   (tabela        alunos/equipe     → Lambda           de certificados)    → Lambda "media-events"
   única)         + SES + SMS       "grader" (Claude)                      → MediaConvert → S3 "media"
                                    → Lambda "issuer"

  ───────────────────────────── Plano de operações ─────────────────────────────
  Claude Code (local ou GitHub Actions) + MCP (HeyGen, Buffer, Stripe, GitHub)
      → PRs (cursos, vídeos, calendário social, transparência, infra)
      → CI/CD (testes, Terraform plan + Infracost) → merge → deploy na AWS
```

### 3.2 Plano de execução (runtime)

| Componente | Serviço | Responsabilidade |
|---|---|---|
| Borda | CloudFront + WAF (us-east-1 para ACM/WAF), Route 53 | TLS, cache, cabeçalhos de segurança (CSP, HSTS), rate limit, roteamento por caminho |
| Site | S3 (OAC) | HTML/CSS/JS gerados pelo Astro; `did.json`; `achievement.json` por curso |
| API | API Gateway HTTP API → Lambda `api` (Hono) | Auth (BFF), perfil, progresso, envios de projeto, certificados (página pública), área da equipe |
| Dados | DynamoDB on-demand, PITR | Perfis, progresso, envios, certificados, mídia, cotas, auditoria |
| Identidade | Cognito (2 user pools), SES, SNS/End User Messaging SMS | Login de alunos e equipe; e-mails de código; SMS |
| Correção | SQS `grading` (+DLQ) → Lambda `grader` | Busca evidências, chama Claude, grava veredito |
| Emissão | Lambda `issuer` (acionada ao cumprir o último requisito de elegibilidade) | Monta e assina credencial, gera PNG/PDF, atualiza status list |
| Mídia | S3 `ingest` → EventBridge → Lambda `media-events` → MediaConvert → S3 `media` | Transcodificação HLS, miniaturas, registro de mídia pronta |
| Segredos | SSM Parameter Store (SecureString/KMS) | Chave Anthropic, segredo do client Cognito, token GitHub de leitura |
| Observabilidade | CloudWatch (logs, métricas, alarmes), Powertools for AWS Lambda (TS), Budgets, Cost Anomaly Detection | Logs estruturados, alarmes de erro, custo |

Região principal **sa-east-1**. Recursos que a AWS exige em **us-east-1**: certificado ACM do CloudFront e do domínio customizado do Cognito, Web ACL do WAF (escopo CLOUDFRONT).

### 3.3 Plano de operações

Claude Code é o hub (blueprint do projeto). Roda na máquina do mantenedor ou em GitHub Actions (gratuito para repositório público) com os servidores MCP declarados em `.mcp.json` (chaves via variáveis de ambiente, nunca no repositório):

| MCP | Uso |
|---|---|
| HeyGen | Avatares do elenco, Video Agent para aulas, cortes para redes sociais. O MCP remoto do HeyGen só aceita OAuth, então operações de vídeo rodam no Claude Code local do mantenedor (nunca no CI) |
| Buffer | Agendamento de posts, métricas por post/canal |
| Stripe | Criação de Payment Links, consultas pontuais de receita |
| GitHub | Branches, PRs, issues |

Regra: **toda operação termina em PR** (curso, vídeo, calendário social, relatório de transparência, mudança de infra). Ações externas (publicar post, criar link de pagamento em produção) só acontecem após merge/aprovação humana.

### 3.4 Fluxos principais

1. **Assistir aula:** HTML estático vem da borda → player busca `/media/{videoId}/index.m3u8` → ao concluir, a ilha chama `PUT /api/progress/...` (ou grava localmente se anônimo).
2. **Entrar com e-mail:** `POST /api/auth/email/start` → Cognito envia código (cadastro ou login, mesma resposta para não revelar existência da conta) → `POST /api/auth/email/verify` → BFF grava cookies → aluno volta à página.
3. **Enviar projeto:** `POST /api/projects/{curso}/submissions` → valida cota/elegibilidade → SQS → `grader` busca evidências com proteções (§7) → Claude devolve avaliação estruturada → nota calculada por código → aprovado → aluno vê resultado na área "Eu". O `issuer` é acionado quando o **último** requisito de elegibilidade (§6.1) é cumprido — aprovação do projeto ou verificação do celular, o que vier depois.
4. **Publicar curso:** skill `novo-curso` → PR com conteúdo → skill `gerar-videos` → HeyGen → `pnpm media:ingest` → PR com IDs de vídeo → merge → CI rebuild + deploy.

### 3.5 Modelo de dados (DynamoDB, tabela única `egt-{env}-data-main`)

Chaves genéricas `PK`, `SK`, `GSI1PK`, `GSI1SK`; atributo `ttl` para itens efêmeros. Entidades modeladas com ElectroDB em `packages/db`.

| Entidade | PK | SK | GSI1 | Conteúdo principal |
|---|---|---|---|---|
| Perfil | `USER#{sub}` | `PROFILE` | `SIGNUP#{yyyy-mm-dd}` / `{utmContent}` | nome, nomeNoCertificado, anoNascimento, celularVerificado, utm de 1º toque, criadoEm |
| Progresso por curso | `USER#{sub}` | `COURSE#{slug}` | — | aulasConcluídas (set), quizzesCorretos (set), últimaAula, status |
| Envio de projeto | `USER#{sub}` | `SUBMISSION#{slug}#{ulid}` | `REVIEWQ` / `{createdAt}` (só quando vai para humano) | evidências, status (`queued`, `grading`, `approved`, `rejected`, `needs_human`), critérios, nota, feedback, modelo |
| Certificado | `CERT#{id}` | `CERT` | `USER#{sub}` / `CERT#{slug}` | sub, curso, nome, emitidoEm, status, statusIndex, jwt, caminhos PNG/PDF, flags de visibilidade |
| Unicidade de celular | `PHONE#{hmac}` | `PHONE` | — | sub (put condicional) |
| Cota diária | `QUOTA#{sub}#{acao}#{yyyy-mm-dd}` | `QUOTA` | — | contador, `ttl` |
| Status list | `STATUSLIST#1` | `META` | — | próximo índice, bitstring de revogações |
| Mídia | `MEDIA#{id}` | `MEDIA` | — | status, duração, renditions, chave de origem |
| Auditoria (equipe) | `AUDIT#{yyyy-mm}` | `{ts}#{ulid}` | — | quem, ação, alvo, motivo |

Celular é guardado como atributo `phone_number` no Cognito; no DynamoDB só o HMAC (chave em SSM) para garantir 1 celular = 1 conta.

### 3.6 API (resumo de rotas)

| Grupo | Rotas |
|---|---|
| Saúde | `GET /api/health` |
| Auth aluno | `GET /api/auth/google` · `GET /api/auth/callback` · `POST /api/auth/email/start` · `POST /api/auth/email/verify` · `POST /api/auth/refresh` · `POST /api/auth/logout` |
| Perfil | `GET /api/me` · `PATCH /api/me` · `GET /api/me/export` · `DELETE /api/me` · `POST /api/me/phone` · `POST /api/me/phone/verify` |
| Progresso | `GET /api/progress` · `PUT /api/progress/{curso}/lessons/{aula}` · `POST /api/progress/merge` |
| Projetos | `POST /api/projects/{curso}/uploads` (POST pré-assinado) · `POST /api/projects/{curso}/submissions` · `GET /api/projects/{curso}/submissions` · `POST /api/projects/{curso}/submissions/{id}/appeal` |
| Certificados | `GET /certificado/{id}` (HTML com Open Graph) · `GET /api/certificates/{id}` · `POST /api/verify` |
| Equipe | `GET /api/staff/auth/*` · `GET /api/staff/review-queue` · `POST /api/staff/submissions/{id}/decision` · `POST /api/staff/certificates/{id}/revoke` · `GET /api/staff/users/{sub}` (atendimento LGPD) |

Validação de entrada com zod; erros no formato `{ error: { code, message } }` com mensagens em pt-BR; mutações exigem cabeçalho `Origin` do próprio domínio (CSRF) além de cookies `SameSite=Lax`.

---

## 4. Experiência de aprendizagem

### 4.1 Modelo de conteúdo

```
content/courses/{slug}/
  course.yaml            # metadados do curso
  00-preparacao/         # módulo de preparação do ambiente (obrigatório)
    01-{aula}.md
  01-{modulo}/
    01-{aula}.md
  projeto.md             # projeto final + rubrica
```

`course.yaml` (chaves em inglês, valores em pt-BR):

| Campo | Exemplo / regra |
|---|---|
| `title` | "Crie seu site com IA" |
| `outcome` | "Você sai com: o site de um cliente no ar" (obrigatório; é o "problema real") |
| `level` | `iniciante` |
| `durationMin` | 30–90 |
| `devices` | `[celular, computador]` (o que serve) |
| `cost` | `0` — se algo pago for citado, precisa de alternativa grátis |
| `requirements` | contas grátis necessárias: `google`, `github`, `claude` |
| `skills` | habilidades certificadas (vão para o Open Badge) |
| `hosts` | IDs do elenco (§8.2) |
| `status` | `draft` · `published` |
| `paidTools` | ferramentas pagas citadas, cada uma com `freeAlternative` |
| `modules` | lista ordenada `{ id, title }` igual às pastas `NN-slug`; a primeira é `00-preparacao` |

Aula (`.md`, frontmatter + corpo):

| Campo | Regra |
|---|---|
| `title`, `summary` | resumo de 1 linha |
| `video` | `{ id, durationSec }` — `id` deve existir como mídia pronta |
| `captions` | VTT pt-BR obrigatória para publicar |
| `variants` | (só no módulo 0) passo a passo `{ steps }` por plataforma: `android`, `ios`, `windows`, `mac`, `chromeos` |
| `quiz` | obrigatório: 1–3 perguntas: `question`, `options`, `answer`, `explanation` |
| `checkpoint` | checklist opcional "mão na massa" |
| corpo | roteiro/transcrição (usado no HeyGen e exibido como transcrição) |

A URL da aula é `/cursos/{curso}/{aula}/`, com o nome do arquivo sem o número; ele não se repete no curso, e `projeto` é reservado. Corpo e passos só em Markdown: HTML solto é recusado; exemplos de HTML vão entre crases ou em bloco de código.

`projeto.md`: cenário realista, entregáveis aceitos (`url`, `github`, `images`, `text`), rubrica (`criteria: [{ id, description, weight, required }]`), `passScore` (0–100).

O validador (`pnpm content:check`, roda na CI) garante: módulo 0 presente, `outcome` presente, custo 0 ou alternativa grátis, legendas, quizzes bem formados, rubrica com pesos somando 100, aulas de 2–5 min, IDs de vídeo e de elenco válidos.

### 4.2 Preparação do ambiente (módulo 0)

- Primeira parte de todo curso; mostra a variação da plataforma detectada (com troca manual).
- Card "O que você precisa" no topo do curso: aparelho, contas grátis, custo R$0, internet.
- Preferência por ferramentas gratuitas no navegador (Google Colab, GitHub Codespaces, Claude.ai etc.). Instalação local só quando indispensável, justificada no `course.yaml`.

### 4.3 Formato das aulas e do vídeo

- Microaulas de 2–5 min; curso de 30–90 min.
- Vídeo **16:9** (demonstrações de tela legíveis); 9:16 reservado para redes sociais.
- HLS com renditions 360p/540p/720p, segmentos de 6 s, miniatura; legenda pt-BR **ligada por padrão**.
- Player: nativo quando o navegador suporta HLS; `hls.js` carregado sob demanda caso contrário. Velocidade 1×–2×, retomada de onde parou, modo "Economizar dados" (começa em 360p em rede móvel).
- Regras de ritmo do guia de estilo (§8.3).

### 4.4 UX

- Navegação com 3 abas: **Início**, **Cursos**, **Eu**.
- Página do curso: resultado em destaque, chips (duração · dispositivo · R$0), botão "Começar".
- Página da aula: vídeo no topo, título, barra de progresso, resumo de 1 linha, quiz e transcrição recolhíveis, botão fixo "Concluir e continuar".
- **Assistir não exige conta**: progresso local (localStorage) e mesclado à conta no login (união de aulas concluídas e quizzes corretos; nada é apagado). Login exigido só no projeto final.
- Área "Eu": cursos em andamento, certificados, dados pessoais, baixar meus dados, excluir conta.
- Identidade visual simples criada na Fase 1: wordmark tipográfico e paleta acessível (claro/escuro).
- Microcopy no tom da Escola (guia no `apps/web/CLAUDE.md`).

### 4.5 App instalável (PWA)

- Manifesto pt-BR (`display: standalone`, ícones maskable, atalho "Continuar curso").
- Service worker gerado pelo `workbox-build` no fim do build (ADR 0021): precache do shell, páginas visitadas disponíveis offline, página offline amigável; API sempre pela rede.
- Android: botão "Instalar app" via `beforeinstallprompt`. iPhone: folha ilustrada "Compartilhar → Adicionar à Tela de Início".

### 4.6 Desempenho e acessibilidade (bloqueiam merge na CI)

| Métrica | Orçamento |
|---|---|
| JS por página de conteúdo (gzip, sem player) | ≤ 30 KB |
| LCP (Lighthouse mobile, 4G, celular intermediário) | ≤ 2,0 s |
| CLS | ≤ 0,05 |
| Lighthouse Performance | ≥ 95 |
| Lighthouse Accessibility | ≥ 95 e zero violações axe sérias |

- Fonte do sistema no texto; uma fonte de títulos em subset (~20 KB, preload).
- WCAG 2.2 AA: alvos de toque ≥ 48 px, contraste, foco visível, modo escuro automático, `prefers-reduced-motion` respeitado, linguagem simples.
- Legenda e transcrição obrigatórias. Botão VLibras carregado sob demanda (fora do orçamento).

### 4.7 Métricas sem rastreamento

Sem cookies de terceiros nem pixels. Acessos por logs padrão do CloudFront (CloudWatch Logs, consultas Logs Insights); aprendizagem pelo DynamoDB; origem de cadastro (UTM de 1º toque guardado em `sessionStorage` e gravado no perfil no cadastro).

---

## 5. Identidade, segurança e privacidade

### 5.1 User pools

| | Alunos — `egt-{env}-learners` (Essentials) | Equipe — `egt-{env}-staff` (Lite) |
|---|---|---|
| Login | Google (federação OIDC) e código por e-mail (`EMAIL_OTP`, fluxo `USER_AUTH`; 6 dígitos no cadastro, 8 no login) | Senha forte + **SMS MFA obrigatório** (TOTP aceito como reserva) |
| Cadastro | Livre, sem senha | Fechado (contas criadas por CLI/Terraform) |
| MFA do pool | Desligado (o Cognito não permite MFA junto com passwordless) | Obrigatório |
| SMS | Verificação única do celular antes do 1º certificado | A cada login |
| Vinculação | Gatilho *pre sign-up* vincula o Google ao usuário do mesmo e-mail (`AdminLinkProviderForUser`), criado sem senha se ainda não existir: um aluno, uma conta (ADR 0024) | — |
| E-mail | SES com domínio próprio (DKIM, SPF, DMARC) | SES |
| Domínio Cognito | `auth.escolagratisdetecnologia.com.br` (prod), `auth.dev.escolagratisdetecnologia.com` (dev) — necessário para a federação Google | Nenhum: login pela API do Cognito (`USER_SRP_AUTH` + desafio `SMS_MFA`) em telas próprias |

Proteção contra enumeração de usuários ligada; a tela responde igual para conta nova e existente.

### 5.2 Sessão (BFF)

- Telas de login próprias (pt-BR); o backend chama a API do Cognito (app client confidencial). Google redireciona direto ao IdP via `identity_provider=Google` com PKCE e `state`.
- Cookies: `egt_at` (access token, HttpOnly, Secure, SameSite=Lax, `Path=/api`, 1 h), `egt_rt` (refresh, HttpOnly, `Path=/api/auth`, 30 dias para alunos), `egt_hint` (não sensível, só indica "logado" para a UI). Equipe: cookies separados `egt_staff_*`, sessão de 8 h.
- Verificação do JWT com `aws-jwt-verify` na AWS; localmente, o provedor de identidade local confere os tokens que ele mesmo assina (ADR 0024).
- Logout revoga o refresh token e limpa cookies.

### 5.3 Verificação do celular (alunos)

- Antes do 1º certificado: aluno informa o celular → código por SMS → confirmação. Regra **1 celular = 1 conta** (item `PHONE#{hmac}` com put condicional). Cota: 3 SMS/dia.
- Implementação preferida: verificação de atributo `phone_number` do próprio Cognito.
- **Verificação técnica obrigatória no início da Fase 1** (§18): confirmar que usuários federados (Google) conseguem verificar o atributo. Plano B: código próprio enviado pelo AWS End User Messaging SMS, guardado com hash no DynamoDB (`ttl` 10 min, máx. 5 tentativas).

### 5.4 Segurança

- WAF: regras gerenciadas da AWS; rate limit por IP de 50 requisições/5 min em `/api/auth/*` e 30 requisições/5 min em `/api/projects/*` (ajustáveis por variável Terraform).
- Cabeçalhos via response headers policy do CloudFront: CSP estrita (sem scripts inline não-hasheados), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- API na mesma distribuição (ADR 0022): só o 403 do S3 vira a página 404, e a API nunca responde 403 pela borda; o rate limit responde 429 em JSON; a origem só aceita o cabeçalho secreto do CloudFront; corpo até 8 KB.
- IAM de menor privilégio por Lambda; nenhuma chave AWS de longa duração (GitHub → AWS via OIDC).
- Segredos em SSM SecureString; criptografia em repouso padrão (S3 SSE, DynamoDB) e TLS 1.2+.
- CloudTrail (eventos de gerenciamento), IAM Access Analyzer, alarmes de segurança básicos.
- Cotas por aluno: 3 envios de projeto/dia, 3 SMS/dia.
- Log de auditoria de toda ação da equipe.

### 5.5 Privacidade (LGPD) e menores de idade

- Dados coletados: nome no certificado, e-mail, celular, ano de nascimento, progresso, envios de projeto. **Sem CPF.**
- Bases legais: execução dos termos (conta e curso), consentimento (exibir projeto e indexar certificado), legítimo interesse (segurança e antifraude).
- Autoatendimento: **Baixar meus dados** (JSON) e **Excluir conta** (remove perfil, progresso, envios, usuário Cognito; certificados removidos por padrão, ou mantidos públicos se o titular escolher).
- **Menores de 12 anos: bloqueados** no cadastro (art. 14 da LGPD exigiria consentimento parental específico). **12–17 anos: permitidos**; o produto não tem anúncios, perfilamento nem recursos sociais, alinhado ao ECA Digital (Lei 15.211/2025).
- Páginas de certificado com `noindex` por padrão (aluno pode liberar). Para menores, projeto oculto no certificado por padrão.
- Termos de uso e política de privacidade em linguagem simples.
- **Portão de lançamento:** revisão jurídica de termos, privacidade e ECA Digital (§20).

---

## 6. Certificados verificáveis

### 6.1 Elegibilidade

Todas as aulas concluídas **e** todos os quizzes acertados (tentativas ilimitadas) **e** projeto aprovado **e** celular verificado **e** nome no certificado confirmado. O nome fica travado após a emissão; correção gera certificado novo e revoga o anterior.

### 6.2 Formato

- **Open Badges 3.0** (`OpenBadgeCredential`, W3C Verifiable Credentials Data Model 2.0), protegido como **VC-JWT** com **ES256**.
- Chave privada no **AWS KMS** (`ECC_NIST_P256`, `SIGN_VERIFY`); nunca sai do KMS. Localmente, chave P-256 de desenvolvimento. Interface `Signer` única com implementações `KmsSigner` e `LocalSigner`.
- Emissor: `did:web:escolagratisdetecnologia.com.br` → `/.well-known/did.json` com as chaves públicas (atuais e aposentadas, para validar certificados antigos após rotação).
- `Achievement` por curso publicado em `/cursos/{slug}/achievement.json` (gerado do `course.yaml`, inclui `skills` e critérios).
- Revogação: **Bitstring Status List** (W3C) em `/credentials/status/1`, credencial assinada regenerada a cada revogação.
- ID do certificado: 12 caracteres base32 Crockford aleatórios (~60 bits).

### 6.3 Página pública e artefatos

- `/certificado/{id}`: HTML renderizado pela Lambda com tags Open Graph, em cache no CloudFront (invalidado na revogação). Mostra "✓ Certificado válido" (assinatura e status conferidos no servidor), nome, curso, resultado, habilidades, data e projeto (opcional).
- Botões: **Adicionar ao LinkedIn** (URL `linkedin.com/profile/add` com nome, organização, mês/ano, URL e ID), **Compartilhar** (Web Share API), **Baixar PDF**, **Baixar credencial (.json)**.
- Artefatos gerados na emissão (satori + resvg-wasm para PNG; pdf-lib para PDF): PNG 1200×630, PNG 1080×1920 (stories), PDF A4. Armazenados em `/media/certificados/{id}/`.
- `/verificar`: cole o ID ou envie o `.json` → servidor confere assinatura e status.

---

## 7. Avaliação por IA (corretor de projetos)

- **Modelo:** Claude Haiku 4.5 por padrão (suporta imagens); reavaliação por modelo Sonnet quando o resultado vier marcado como incerto. IDs de modelo centralizados em `packages/ai` (consultar a referência da Claude API ao implementar).
- **Evidências:**
  - URL: apenas HTTPS; DNS resolvido e IPs privados/link-local/metadados bloqueados (inclusive após redirecionamento); timeout 5 s; máx. 2 MB; extração de texto e metadados.
  - GitHub: API REST com token de leitura (SSM); README, árvore e até 20 arquivos de até 50 KB cada.
  - Imagens: enviadas por POST pré-assinado ao S3 (PNG/JPEG/WebP, máx. 5 MB cada, máx. 5).
  - Texto livre do aluno.
- **Defesa contra injeção de prompt:** evidência delimitada e marcada como dado não confiável; instruções do sistema explícitas; saída estruturada validada por zod; verificações determinísticas antes da IA (ex.: URL responde 200).
- **Saída estruturada:** por critério `{ id, met: sim|parcial|não, evidence, comment }`, `verdict`, `feedback` (pt-BR, tom da Escola), `flags` (conteúdo impróprio, incerteza). **A nota é calculada pelo código** a partir dos critérios e pesos; critérios `required` não atendidos reprovam.
- **Humano no circuito:** botão "pedir revisão humana" → fila `REVIEWQ`; 5% dos aprovados amostrados para auditoria; equipe pode revogar.
- **Robustez:** SQS com DLQ e reprocessamento; worker idempotente (atualizações condicionais por status); orçamento diário global de correções (parâmetro SSM) — se estourar, envios ficam na fila e a UI informa "correção em até 24 h".
- **Qualidade (evals):** conjunto-ouro de ~30 envios rotulados por curso; concordância ≥ 90% com rótulo humano antes de liberar o curso.
- **Custo:** limite de tokens de entrada por envio (evidência truncada); estimativa ~US$ 0,02 por correção com Haiku.
- **Local:** usa a API real se `ANTHROPIC_API_KEY` existir; caso contrário, `FakeGrader` determinístico.

---

## 8. Estúdio de conteúdo (Claude Code + HeyGen)

### 8.1 Skills de autoria (`.claude/skills/`)

| Skill | Entrada → Saída |
|---|---|
| `novo-curso` | tema + problema real → `course.yaml`, roteiros, quizzes, `projeto.md` com rubrica → `pnpm content:check` → PR rascunho |
| `gerar-videos` | aulas com roteiro aprovado → sessão do HeyGen Video Agent (modo chat, aprovação de storyboard) por aula → download → `pnpm media:ingest` → PR com `video.id` e legenda |
| `elenco` | mantém `content/cast.yaml` e o relatório de representatividade |

### 8.2 Elenco de apresentadores

- ~8 apresentadores fictícios brasileiros, criados no HeyGen (`create_prompt_avatar`), com vozes pt-BR. Diversidade de raça/etnia (preta, parda, branca, indígena, amarela), gênero, região/sotaque e pessoas com deficiência — sem caricatura.
- `content/cast.yaml`: `id`, nome/persona, IDs de look e voz no HeyGen, notas de estilo.
- Cada curso usa 1–2 apresentadores; relatório de equilíbrio do elenco no catálogo.
- Uso secundário: vídeos curtos 9:16 para redes sociais.

### 8.3 Guia de estilo (`docs/conteudo/guia-de-estilo.md`)

- Tom geração Z sem forçar: próximo, bem-humorado, inclusivo, sem infantilizar; jargão sempre explicado.
- Estrutura da aula: gancho ≤ 5 s → problema → demonstração → recapitulação de 10 s → chamada para a próxima aula.
- Ritmo: mudança visual (corte, zoom, b-roll, texto na tela) a cada 20–40 s; **no máximo um elemento animado por vez**; sem transições decorativas; nada piscando mais de 3×/s.
- Exemplos brasileiros: Pix, MEI, WhatsApp Business, comércio do bairro.
- Acessibilidade: legenda revisada, contraste do texto na tela, narrar o que acontece na tela.

### 8.4 Gravações de tela e pipeline de mídia

- Passos no navegador gravados automaticamente com **Playwright** (`tools/screencast/`, 1280×720, locale pt-BR) e enviados ao HeyGen como assets; instalações nativas gravadas manualmente com checklist.
- Pipeline implementado na Fase 1 (a plataforma precisa dele); as skills do HeyGen chegam na Fase 3.
- `pnpm media:ingest <arquivo> --lesson <caminho>`: envia ao S3 `ingest` → EventBridge → Lambda `media-events` cria job no MediaConvert (HLS 360/540/720p, AAC, segmentos de 6 s, miniatura; tags do projeto no job) → evento de conclusão → item `MEDIA#{id}` pronto → o comando grava `video.id`/`durationSec` no frontmatter e copia a legenda VTT.
- Originais vão para classe de armazenamento fria após 30 dias (regra de ciclo de vida).

---

## 9. Redes sociais (Claude Code + Buffer)

- **`divulgar`:** a partir de curso/aula novos, gera variações por rede conectada no Buffer — Reels/TikTok/Shorts 9:16 (cortes via `create_ai_clipping` do HeyGen ou vídeo de avatar), carrossel, post de LinkedIn ("venda isso como serviço"), texto curto.
- **CTA com UTM** em todo post: `utm_source={rede}&utm_medium={formato}&utm_campaign={curso}&utm_content={variante}`.
- **Ciclo semanal (GitHub Actions):**
  1. `social-semanal.yml` (cron domingo) roda a skill `planejar-semana`: lê métricas e cursos novos, monta calendário (70% formatos campeões por rede, 30% experimentos) → PR com `content/social/calendario/{ano}-W{semana}.yaml`.
  2. **Merge = aprovação.** `social-agendar.yml` agenda os posts no Buffer e grava os IDs no calendário.
  3. Coleta semanal de métricas → `content/social/metricas/{ano}-W{semana}.json` (por rede × formato) + cruzamento com cadastros por UTM (GSI `SIGNUP#`) → relatório com aprendizados que alimenta o próximo plano.
- Modo `draft` configurável (posts criados como rascunho no Buffer) para períodos de revisão mais rígida.

---

## 10. Transparência e doações (Claude Code + Stripe)

### 10.1 Doações — `/apoie`

- Stripe **Payment Links**: doação única (R$ 10, 25, 50 ou valor livre) e apoio mensal recorrente; criados via MCP do Stripe; URLs em `content/site/apoie.yaml`.
- Métodos conforme a conta Stripe (Pix preferido se disponível, cartão, boleto).
- Texto explícito: **100% dos recursos vão para o próprio projeto; não há fins lucrativos**.
- Entidade recebedora (nome, CNPJ, regime fiscal) em `content/transparency/entidade.yaml`. **A página `/apoie` só é publicada com esse arquivo preenchido** (validação na CI).
- Doadores anônimos por padrão; nome exibido só com consentimento explícito.

### 10.2 Transparência — `/transparencia`

Por mês:

- **Entradas:** doações brutas, taxas Stripe, estornos, líquido, número de doações.
- **Saídas por categoria:** AWS (por serviço), Anthropic, HeyGen, Buffer, domínio, impostos (quando houver), outros.
- **Caixa:** saldo Stripe (disponível + pendente) + saldo bancário declarado com comprovante.
- Gráfico de 12 meses; link para o JSON bruto no GitHub (histórico de PRs = trilha de auditoria); data de atualização.

### 10.3 Coleta determinística

`pnpm transparencia:snapshot --mes AAAA-MM` gera `content/transparency/{AAAA}/{MM}.json` (schema validado):

| Fonte | Como |
|---|---|
| Stripe | Balance transactions do mês e saldo de fim de mês, com chave restrita somente-leitura |
| AWS | Cost Explorer `GetCostAndUsage` por serviço, filtrado pela tag `Project` (§11.3) e pelas contas do projeto, via OIDC |
| Anthropic | API de custos da organização (Admin API) |
| Assinaturas | `content/transparency/assinaturas.yaml` (HeyGen, Buffer, domínio…) com comprovantes |
| Câmbio | PTAX do Banco Central (API pública) para USD→BRL; valor da fatura prevalece quando disponível |

`transparencia-mensal.yml` (cron dia 3) roda o script e abre PR; o Claude escreve apenas o **resumo em linguagem simples**, sem alterar números. CODEOWNERS exige revisão em `content/transparency/`.

---

## 11. Infraestrutura

### 11.1 Contas e ambientes

- AWS Organizations: conta de **gerenciamento** (billing, políticas da organização), conta **`dev`** e conta **`prod`**. O bootstrap aceita contas já existentes.
- Ambientes: `dev` (`dev.escolagratisdetecnologia.com`, zona delegada para a conta dev) e `prod` (apex `escolagratisdetecnologia.com.br`, com redirect de `www` e de `escolagratisdetecnologia.com`; ADR 0020).
- Desenvolvimento local não cria recursos na AWS (§13).

### 11.2 Layout Terraform

```
infra/
  bootstrap/        # por conta: bucket de estado (S3, lock nativo use_lockfile), OIDC do GitHub,
                    # roles plan (somente leitura) e apply; na conta de gerenciamento:
                    # tag policy e ativação das cost allocation tags
  modules/
    tags/           # fonte única das tags padrão (§11.3)
    edge/           # CloudFront, WAF, ACM (us-east-1), Route 53, response headers
    site/           # bucket do site + OAC
    api/            # API Gateway HTTP + Lambda api + log groups
    data/           # DynamoDB
    auth/           # Cognito (2 pools), domínio, SES, SMS
    media/          # buckets ingest/media, MediaConvert (role, job template), EventBridge, Lambda media-events
    jobs/           # SQS grading + DLQ, Lambdas grader e issuer
    certificates/   # chave KMS de assinatura
    observability/  # Budgets (Fase 0); alarmes, dashboard e SNS a partir da Fase 1
  live/             # raiz única da aplicação; um arquivo por ambiente evita divergência entre dev e prod
    env/dev.tfvars, env/dev.backend.hcl
    env/prod.tfvars, env/prod.backend.hcl
  tf                # wrapper: infra/tf <raiz> <env> <comando> (init com backend do ambiente + -var-file)
```

- Bootstrap: `infra/bootstrap/account` (raiz aplicada em dev e prod: estado, OIDC, roles, Resource Explorer, zona DNS) e `infra/bootstrap/management` (tag policy, Cost Anomaly Detection por conta-membro, cost allocation tags).
- Terraform ≥ 1.10; provider AWS 6.x com alias `us_east_1`.
- Lambdas: código empacotado na CI (esbuild, arm64), `source_code_hash` no Terraform; **log groups criados pelo Terraform** (com tags e retenção de 30 dias), nunca implicitamente.
- Ferramentas versionadas em `.mise.toml` (Node, pnpm, Terraform, tflint, infracost).
- CloudFront no preço pay-as-you-go, sem assinatura de plano (ADR 0019). O runbook `docs/runbooks/cloudfront-flat-rate.md` fica para uma eventual migração ao flat-rate.

### 11.3 Padrão de tags (obrigatório)

Toda infraestrutura criada pelo projeto na AWS carrega as tags abaixo. A **tag única do projeto** é `Project = escola-gratis-de-tecnologia`: filtrar por ela mostra **100% dos recursos e custos** do projeto, e é a referência para remoção total.

| Chave | Valores | Uso |
|---|---|---|
| `Project` | `escola-gratis-de-tecnologia` (fixo) | **Tag única**: custo total, inventário e remoção de 100% do projeto |
| `Environment` | `dev` · `prod` · `shared` | Classifica desenvolvimento × produção; `shared` só para recursos da conta de gerenciamento (ex.: políticas da organização) |
| `Component` | `edge` · `site` · `api` · `data` · `auth` · `media` · `jobs` · `certificates` · `observability` · `bootstrap` | Custo e responsabilidade por componente |
| `ManagedBy` | `terraform` · `app` | `app` para recursos criados em tempo de execução (ex.: jobs do MediaConvert) |
| `Repository` | `github.com/escolagratisdetecnologia/escolagratisdetecnologia` | Origem do recurso |
| `DataClassification` | `public` · `internal` · `personal` | Apenas em armazenamentos de dados (S3, DynamoDB, Cognito) — apoio à LGPD |

**Como é garantido**

1. **`default_tags` em todos os providers AWS** (inclusive o alias `us_east_1`), alimentados pelo módulo `tags`; módulos acrescentam `Component` e, quando aplicável, `DataClassification`.
2. **Recursos criados pela aplicação** (jobs do MediaConvert, objetos que suportem tags) recebem as mesmas tags via variáveis de ambiente das Lambdas.
3. **Checagem na CI:** `tools/check-tags` lê `terraform show -json` do plano e falha o PR se algum recurso com `tags_all` não tiver `Project`, `Environment`, `Component`, `ManagedBy` e `Repository` com valores válidos; tflint (`aws_resource_missing_tags`) como reforço.
4. **Tag Policy da AWS Organizations** padroniza chaves e valores permitidos de `Project` e `Environment` (com enforcement nos tipos de recurso suportados).
5. **Cost allocation tags** `Project`, `Environment` e `Component` ativadas na conta de gerenciamento (via Terraform, `aws_ce_cost_allocation_tag`) — habilita Cost Explorer, Budgets e o relatório de transparência por tag.
6. **Auditoria semanal** (`auditoria-tags.yml`): AWS Resource Explorer lista recursos das contas do projeto sem a tag `Project`; abre issue se encontrar.
7. **Remoção total** (`docs/runbooks/remover-projeto.md`): `terraform destroy` por ambiente → busca por `Project=escola-gratis-de-tecnologia` no Resource Explorer/Tag Editor em todas as regiões para limpar sobras → bootstrap por último.

Custos não tagueáveis (impostos, suporte, parte de transferência de dados) aparecem como "sem tag" no Cost Explorer; como as contas são dedicadas ao projeto, o filtro por conta cobre o restante — a transparência soma ambos.

**Nomes de recursos:** `egt-{env}-{component}-{nome}` (ex.: `egt-prod-api-handler`).

### 11.4 CI/CD (GitHub Actions)

| Workflow | Gatilho | Etapas |
|---|---|---|
| `ci.yml` | PR | lint (ESLint/Prettier), typecheck, unit + integração (Vitest, DynamoDB Local), `content:check`, build, e2e Playwright, Lighthouse CI, axe |
| `infra.yml` | PR que toca `infra/**` | fmt, validate, tflint, Trivy (misconfig), `terraform plan` em dev e prod (role somente leitura), `check-tags` |
| `deploy.yml` | push na `main` | build → apply **dev** → smoke tests → **aprovação manual** (environment `prod` com revisor obrigatório) → apply **prod** → sync do site + invalidação |
| `social-semanal.yml`, `social-agendar.yml` | cron / merge de calendário | §9 |
| `transparencia-mensal.yml` | cron dia 3 | §10.3 |
| `auditoria-tags.yml` | cron semanal | §11.3 |

- Delta de custo mensal: o app do Infracost no GitHub (plano Free, sem chave nem Secret) comenta todo PR que toca `infra/**`, com os projetos de `infracost.yml` e as premissas de `infra/infracost-usage.yml`.
- `main` protegida: checks obrigatórios, 1 revisão, CODEOWNERS em `infra/` e `content/transparency/`.
- Template de PR com seções obrigatórias: **Delta de custo**, **Pilares Well-Architected afetados**, **ADR** (quando houver decisão arquitetural).
- CodeQL, secret scanning e Renovate (gratuitos para repositório público).

### 11.5 Regra de mudança de arquitetura

Toda mudança de infraestrutura passa por PR com plano Terraform e delta de custo (Infracost); mudança de arquitetura exige ADR novo ou atualizado e revisão da seção correspondente de `docs/arquitetura/well-architected.md`. Nenhum `apply` em prod fora do pipeline.

---

## 12. Repositório e convenções

### 12.1 Estrutura do monorepo

```
apps/
  web/                 Astro + ilhas Preact (PWA)
  api/                 Hono: handler Lambda + servidor Node local
  workers/             grader, issuer, media-events, status-list
packages/
  core/                regras puras (conclusão, elegibilidade, nota da rubrica)
  db/                  entidades ElectroDB + repositórios
  content/             schemas zod, validador, manifesto de cursos
  certificates/        Open Badges 3.0: montar, assinar (KMS/local), verificar, PNG/PDF
  ai/                  cliente Anthropic, prompts, schemas de saída
  ui/                  tokens de design e componentes
content/               courses/, cast.yaml, social/, transparency/, site/
(raiz)                 tsconfig.base.json, eslint.config.js, prettier.config.mjs, vitest.config.ts compartilhados
infra/                 §11.2
tools/                 screencast/, media-ingest/, transparencia-snapshot/, check-tags/
docs/                  adr/, arquitetura/, conteudo/, runbooks/, superpowers/specs|plans/
.claude/               skills/, settings.json
.mcp.json              servidores MCP (segredos via ${ENV})
docker-compose.yml     ambiente local (§13)
```

pnpm workspaces + Turborepo; TypeScript `strict` (6.0, por compatibilidade com typescript-eslint); Node 24 LTS (`nodejs24.x` na Lambda).

### 12.2 Arquivos CLAUDE.md

| Arquivo | Conteúdo |
|---|---|
| `/CLAUDE.md` | Missão, glossário, mapa do repo, comandos, convenções globais (docs pt-BR / código inglês, TDD, Conventional Commits, PR obrigatório, ADR, checklist Well-Architected, delta de custo, padrão de tags, nunca commitar segredos) |
| `apps/web/CLAUDE.md` | Padrões Astro/ilhas, orçamentos de desempenho, acessibilidade, microcopy no tom da Escola |
| `apps/api/CLAUDE.md` | Padrão de rota Hono, validação zod, erros, middleware de auth, uso de repositórios, logs Powertools, testes |
| `apps/workers/CLAUDE.md` | Idempotência, DLQ, limites de custo, proteções SSRF |
| `packages/*/CLAUDE.md` | Onde houver padrões próprios (core, db, certificates, ai) |
| `infra/CLAUDE.md` | Padrão de módulos, tags (§11.3), nomes, menor privilégio, Infracost, proibido apply local em prod |
| `content/CLAUDE.md` | Schema de conteúdo, checklist de curso, link para o guia de estilo |

### 12.3 Documentação

- `docs/adr/NNNN-titulo.md` (formato MADR, pt-BR): uma ADR por decisão D1–D18.
- `docs/arquitetura/well-architected.md`: revisão por pilar, atualizada a cada mudança arquitetural.
- `docs/runbooks/`: deploy, flat-rate do CloudFront, saída do sandbox SES/SMS, rotação de chave KMS, remoção total do projeto, atendimento LGPD.
- README e CONTRIBUTING em pt-BR (como rodar, como contribuir com cursos e código).

### 12.4 Licenças

- **Código:** AGPL-3.0-or-later (`LICENSE`).
- **Conteúdo** (roteiros, textos, rubricas, imagens): CC BY-SA 4.0 (`LICENSE-CONTENT.md`).
- **Vídeos:** CC BY-SA 4.0 **se os termos do HeyGen permitirem** — verificação na Fase 0; se não permitirem, licença própria de uso gratuito documentada em `LICENSE-CONTENT.md`.
- **Marca:** nome "Escola Grátis de Tecnologia" e logo reservados (`TRADEMARK.md`), contra certificados falsos e uso indevido.

---

## 13. Execução local

`pnpm dev` sobe:

- `docker compose` (`pnpm db:up`): DynamoDB Local, `mock-oauth2-server` (o Google de mentira) e Mailpit (os e-mails com código). Sem Docker, a API guarda tudo na memória e o código de login aparece no terminal.
- Criação da tabela ao iniciar a API. Sem seed: localmente, qualquer e-mail entra, com o código no Mailpit e no terminal.
- API Hono como servidor Node em `:3001`; Astro dev em `:4321` com proxy `/api` → `:3001`.
- Corretor: Claude real se `ANTHROPIC_API_KEY` existir; senão `FakeGrader`.
- Certificados assinados com chave local; SMS impresso no console; vídeos de exemplo de `fixtures/media`.
- Opcional: apontar a API local para o user pool real de `dev` via `.env`.

Cursos em rascunho aparecem quando `SITE_DRAFTS=true` (local, dev e build da CI); o deploy de prod usa `false`.

Outros comandos: `pnpm test`, `pnpm test:e2e`, `pnpm content:check`, `infra/tf live dev plan`.

---

## 14. Testes e qualidade

| Camada | Ferramenta | Escopo |
|---|---|---|
| Unitário | Vitest | Regras de conclusão/elegibilidade, schemas de conteúdo, montar/assinar/verificar credencial, prompt e parsing do corretor, guarda SSRF, UTM, cálculos de transparência (golden files), check-tags |
| Integração | Vitest + DynamoDB Local | Rotas da API (`app.request`), repositórios, workers; Stripe/Buffer/HeyGen com respostas gravadas |
| Funcional (e2e) | Playwright (Pixel 7, iPhone 14) | Aula anônima → login (mock OIDC) → mescla de progresso → quiz → projeto (FakeGrader) → SMS (console) → certificado → página pública válida → link LinkedIn → PWA instalável → axe |
| Infra | `terraform test` (mock provider), tflint, Trivy, check-tags | Módulos e políticas |
| Desempenho | Lighthouse CI | Orçamentos do §4.6 |
| IA | Evals do corretor | Concordância ≥ 90% com rótulo humano (§7) |

Cobertura mínima de 80% em `packages/core`, `packages/certificates` e `packages/ai`. Desenvolvimento orientado a testes (TDD) é a convenção do projeto.

---

## 15. AWS Well-Architected (resumo)

| Pilar | Como o design atende |
|---|---|
| Excelência operacional | Tudo em IaC; mudanças por PR; ADRs; runbooks; logs estruturados (Powertools); alarmes; operações automatizadas por skills e workflows |
| Segurança | §5: Cognito gerenciado, MFA da equipe, BFF com cookies HttpOnly, WAF, CSP, menor privilégio, OIDC sem chaves longas, KMS, SSRF/injeção de prompt tratados, auditoria |
| Confiabilidade | Serviços serverless multi-AZ; DynamoDB PITR; S3 versionado; SQS com DLQ; workers idempotentes; degradação elegante (corretor fora → fila retém) |
| Eficiência de performance | Static-first na borda; HLS adaptativo; arm64; bundles pequenos; orçamentos na CI |
| Otimização de custos | Pago por uso; CDN pay-as-you-go no free tier; Budgets e Cost Anomaly Detection; Infracost em PR; tags de custo; gatilhos de revisão (Cognito em 30 mil MAU) |
| Sustentabilidade | Graviton; nada ocioso; conteúdo estático e cache; codificação eficiente; ciclo de vida para originais |

---

## 16. Custos estimados (USD/mês, sem assinaturas HeyGen e Buffer)

| Cenário | CDN | Cognito | Lambda/Dynamo/outros | Claude (correção) | SMS + MediaConvert | Total |
|---|---|---|---|---|---|---|
| Beta (~1 mil MAU, 20 mil aulas vistas) | 0 (Free) | 0 | ~5 | ~10 | ~5 | **~20** |
| Crescimento (~50 mil MAU, 1 milhão de aulas vistas) | 200 (Business) | ~600 | ~50 | ~200 | ~100 | **~1.200** |

Notas: Cognito Essentials é gratuito até 10 mil MAU e custa US$ 0,015/MAU acima disso — **ADR prevê reavaliação ao atingir 30 mil MAU**. O plano Pro do CloudFront (US$ 15) cobre até 10 M requisições/mês; HLS gera ~45 requisições por aula assistida, então ~1 M aulas/mês exigem o plano Business. Valores são estimativas para orientar decisões, não orçamento.

---

## 17. Fases e critérios de pronto

| Fase | Entrega | Pronto quando |
|---|---|---|
| **0 · Fundação** | Monorepo, CLAUDE.md, licenças, ADRs D1–D18, CI, ambiente local, `.mcp.json`, Terraform bootstrap (contas, estado, OIDC, tag policy, cost allocation tags), módulos `tags`, `edge`, `site`, `observability` | `pnpm dev` mostra página e `/api/health` localmente; CI verde; PR de infra recebe comentário Infracost e passa check-tags; página "Em breve" no ar em dev e prod; verificação de licença do HeyGen registrada |
| **1 · Plataforma** | Catálogo, curso, aula, player HLS, quiz, progresso (anônimo + conta), Cognito (2 pools), área "Eu", LGPD (exportar/excluir), PWA, pipeline de mídia (MediaConvert), curso piloto com vídeo provisório, identidade visual | Fluxo e2e (sem projeto) verde em Pixel/iPhone; orçamentos de desempenho e acessibilidade verdes; equipe entra com SMS MFA; verificação técnica do SMS de federados concluída (§18) |
| **2 · Projetos e certificados** | Envio de projeto, corretor, fila humana, verificação do celular, emissor OB 3.0 + KMS, página pública, LinkedIn, `/verificar`, revogação e status list | E2e completo verde; evals do corretor ≥ 90% no curso piloto; certificado validado por verificador externo de Open Badges 3.0 |
| **3 · Estúdio de cursos** | Skills `novo-curso`, `gerar-videos`, `elenco`; guia de estilo; screencasts Playwright; elenco no HeyGen; 2 cursos reais: "Crie seu site com IA" e "Automatize tarefas com Python" | Os 2 cursos publicados com vídeos HeyGen, legendas e evals do corretor aprovados |
| **4 · Transparência e doações** | `/apoie`, `/transparencia`, `transparencia:snapshot`, workflow mensal | Snapshot de um mês real gerado e revisado; **go-live condicionado a `entidade.yaml` preenchido** |
| **5 · Redes sociais** | Skills `divulgar`, `planejar-semana`; workflows de calendário, agendamento e métricas | Uma semana completa planejada, aprovada por PR, agendada no Buffer e medida (rede × formato + cadastros por UTM) |

---

## 18. Riscos e verificações técnicas

| # | Risco / verificação | Fase | Plano B |
|---|---|---|---|
| R1 | Usuário federado (Google) conseguir verificar `phone_number` no Cognito | 1 | OTP próprio via End User Messaging SMS + DynamoDB |
| R2 | Envio de SMS para o Brasil (saída do sandbox, origem, limite de gasto, custo real) | 1 | Ajustar provedor/rota dentro da AWS; limitar verificações |
| R3 | Termos do HeyGen permitem redistribuir vídeos sob CC BY-SA | 0 | Licença própria de uso gratuito para vídeos |
| R4 | Video Agent do HeyGen aceita fixar avatar/voz do elenco | 3 | `create_video_from_avatar` / `create_video_from_studio` com cenas roteirizadas |
| R5 | MCP/API do Buffer com chave em execução headless (CI) | 5 | Rodar `social-agendar` localmente pelo mantenedor |
| R6 | Confiabilidade do corretor e injeção de prompt | 2 | Evals, verificações determinísticas, amostragem humana, revogação |
| R7 | Suporte do provider Terraform ao plano flat-rate do CloudFront (ausente no provider 6.67, verificado em 2026-10-03; sem efeito no pay-as-you-go, ADR 0019) | 0 | Runbook manual |
| R8 | Custo do Cognito ao crescer | contínuo | ADR com gatilho em 30 mil MAU (reavaliar Lite + gatilhos ou auth própria) |
| R9 | Pix disponível na conta Stripe da entidade | 4 | Cartão e boleto; link para Pix direto da entidade documentado na transparência |
| R10 | Tempo de build com muitos cursos | 3 | Cache de build do Astro; medir com 500 aulas; considerar geração incremental |
| R11 | Conformidade LGPD/ECA Digital | antes do lançamento | Ajustar regras de idade e consentimento conforme parecer jurídico |

---

## 19. Fora de escopo (v1)

Download de aulas para ver offline; tutor de IA por aula; gamificação/sequência de dias; fórum/comunidade; outros idiomas; apps nativos (só PWA); notificações push; aulas ao vivo; captura de tela automática do site do aluno pelo corretor (headless browser); cursos pagos (nunca).

---

## 20. Portões de lançamento público

1. Revisão jurídica de termos de uso, política de privacidade e ECA Digital.
2. Termos de licença do HeyGen verificados (R3).
3. SES e SMS fora do sandbox, com limites de gasto configurados.
4. App OAuth do Google verificado (tela de consentimento).
5. Fases 0–2 concluídas e ao menos 1 curso real publicado (Fase 3).
6. Para `/apoie`: `entidade.yaml` preenchido.
