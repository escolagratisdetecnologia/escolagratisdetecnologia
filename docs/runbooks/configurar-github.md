# Configuração do repositório no GitHub

Repositório: `escolagratisdetecnologia/escolagratisdetecnologia` (público), da conta pessoal `escolagratisdetecnologia`.

> **Não renomeie nem transfira o repositório sem preparar a AWS.** As roles da AWS confiam no claim `sub` no formato imutável do GitHub, que inclui nome e ID do dono e do repositório (`repo:escolagratisdetecnologia@337714343/escolagratisdetecnologia@1404541572:...`). Renomear ou transferir muda esse valor e os workflows deixam de assumir as roles. Antes, atualize `github_subject_prefix` em `infra/bootstrap/account/variables.tf` por PR e reaplique o bootstrap das duas contas (`docs/runbooks/bootstrap-aws.md`, passos 5 e 6; ADR 0014).

## Geral

- Settings → General → Pull Requests: permitir só **Squash merge**; marcar **Automatically delete head branches**.
- Settings → Actions → General → Workflow permissions: **Read repository contents**; mantenha marcado **Allow GitHub Actions to create and approve pull requests** (usado nas Fases 3–5).

## Proteção da `main` (Settings → Rules → Rulesets → New branch ruleset)

- Alvo: branch padrão.
- Exigir pull request antes do merge. Enquanto houver um único mantenedor, aprovações obrigatórias = 0 (o GitHub não permite aprovar o próprio PR); aumente para 1 quando houver outra pessoa mantenedora e ative "Require review from Code Owners".
- Exigir status checks: somente `verify`. Os jobs de infra são filtrados por caminho (só rodam quando `infra/` muda); não os torne obrigatórios.
- Bloquear force push e exclusão.

## Environments (Settings → Environments)

| Environment | Revisores                                | Branches  | Variável                                |
| ----------- | ---------------------------------------- | --------- | --------------------------------------- |
| `dev`       | nenhum                                   | só `main` | `AWS_ACCOUNT_ID` = ID da conta egt-dev  |
| `prod`      | `escolagratisdetecnologia` (obrigatório) | só `main` | `AWS_ACCOUNT_ID` = ID da conta egt-prod |

**Restrinja `dev` e `prod` à `main`** (Deployment branches and tags → Selected branches and tags → Add deployment branch or tag rule → `main`). Em `prod`, deixe **Prevent self-review desligado**: o único revisor é quem faz o merge. Motivo: a role de apply na AWS confia em qualquer job que declare o environment, então essa restrição é o que mantém branches de feature longe das credenciais de produção.

## Variáveis e segredos (Settings → Secrets and variables → Actions)

| Tipo                       | Nome                                                    | Valor                                                            |
| -------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| Variable (repositório)     | `AWS_ACCOUNT_ID_DEV`                                    | ID da conta egt-dev                                              |
| Variable (repositório)     | `AWS_ACCOUNT_ID_PROD`                                   | ID da conta egt-prod                                             |
| Variable (por environment) | `AWS_ACCOUNT_ID`                                        | ID da conta do environment (ver tabela acima)                    |
| Secret (repositório)       | `ALERT_EMAILS`                                          | lista JSON, ex.: `["voce@exemplo.com"]`                          |
| Variable (repositório)     | `GOOGLE_CLIENT_ID_DEV`, `GOOGLE_CLIENT_ID_PROD`         | Client ID do Google de cada ambiente (`docs/runbooks/contas.md`) |
| Secret (repositório)       | `GOOGLE_CLIENT_SECRET_DEV`, `GOOGLE_CLIENT_SECRET_PROD` | Client secret do Google de cada ambiente                         |

`ALERT_EMAILS` é Secret **do repositório** (não de environment), nunca Variable: os jobs de deploy declaram `environment:`, então um Secret de environment com o mesmo nome `ALERT_EMAILS` sobrescreveria o do repositório e plano/apply poderiam divergir. Se ficar vazio, o Terraform recebe `[]` e o orçamento fica sem notificações por e-mail.

## Segurança (Settings → Advanced Security)

- Dependabot alerts: ligado.
- Secret scanning e push protection: ligados.
- Code scanning: **CodeQL default setup** (JavaScript/TypeScript e GitHub Actions).

## Renovate

Instale o app **Renovate** (https://github.com/apps/renovate) só neste repositório e aceite o PR de onboarding.

## Infracost

O delta de custo dos PRs de infra vem do app do Infracost no GitHub, não de um workflow: não há chave nem Secret para configurar.

1. Entre em https://dashboard.infracost.io com a conta do GitHub e fique no plano **Free** (1.000 execuções por mês, sem cartão). Não inicie o trial do plano pago.
2. Settings → Org Settings → Integrations → GitHub: siga o assistente autorizando com a conta do GitHub `escolagratisdetecnologia` (dona do repositório) e dê acesso **só a este repositório**. Se ele oferecer o **Infracost (Limited)**, prefira-o: só comenta nos PRs e lê o código. O app completo também pede escrita no conteúdo do repositório, para o AutoFix, que não usamos.
3. Não defina configuração de repositório no painel: ela tem precedência sobre o `infracost.yml` da raiz, que define os projetos dev e prod e as premissas de uso (`infra/infracost-usage.yml`).
4. No próximo PR que tocar em `infra/`, confira se o comentário traz os dois projetos (`live-dev` e `live-prod`).
5. O Infracost Cloud liga políticas próprias, que marcam o check `Infracost` como falho. Esse check não é obrigatório para o merge, mas o X vermelho em todo PR de infra esconde falhas de verdade. Duas delas contradizem decisões do projeto:
   - **FinOps tags** (Governance → Tagging policies): a política de exemplo exige `Service` e `Environment` em `Dev`/`Stage`/`Prod`. As nossas tags seguem a ADR 0015 e já são conferidas por `tools/check-tags`, tflint e tag policy da AWS. Apague a política de exemplo e clique em **Re-run policies**.
   - **DynamoDB provisionado** (Governance → FinOps policies): a tabela é on-demand por decisão (ADR 0006). Comente `@infracost help` no PR e use o comando de dispensa (_dismiss_) do recurso `module.data.aws_dynamodb_table.main`, citando a ADR. Assim as outras políticas de FinOps continuam valendo.

## Opcional: PRs abertos pelo Claude

Os pushes usam a chave SSH, que autentica como `escolagratisdetecnologia`. Se quiser que o Claude abra PRs pelo conector GitHub do claude.ai (logado como `engelmannlabs`), adicione `engelmannlabs` como colaborador com acesso **Write** (Settings → Collaborators). Sem isso, abra os PRs pelo navegador.
