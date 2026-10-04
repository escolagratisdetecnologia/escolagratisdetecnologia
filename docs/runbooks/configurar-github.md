# Configuração do repositório no GitHub

Repositório: `escolagratisdetecnologia/escolagratisdetecnologia` (público), da conta pessoal `escolagratisdetecnologia`.

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

| Tipo                       | Nome                  | Valor                                            |
| -------------------------- | --------------------- | ------------------------------------------------ |
| Variable (repositório)     | `AWS_ACCOUNT_ID_DEV`  | ID da conta egt-dev                              |
| Variable (repositório)     | `AWS_ACCOUNT_ID_PROD` | ID da conta egt-prod                             |
| Variable (por environment) | `AWS_ACCOUNT_ID`      | ID da conta do environment (ver tabela acima)    |
| Secret                     | `ALERT_EMAILS`        | lista JSON, ex.: `["voce@exemplo.com"]`          |
| Secret                     | `INFRACOST_API_KEY`   | chave gratuita em https://dashboard.infracost.io |

`ALERT_EMAILS` é **Secret**, nunca Variable: Variables saem em texto puro nos logs públicos do Actions.

## Segurança (Settings → Advanced Security)

- Dependabot alerts: ligado.
- Secret scanning e push protection: ligados.
- Code scanning: **CodeQL default setup** (JavaScript/TypeScript e GitHub Actions).

## Renovate

Instale o app **Renovate** (https://github.com/apps/renovate) só neste repositório e aceite o PR de onboarding.

## Opcional: PRs abertos pelo Claude

Os pushes usam a chave SSH, que autentica como `escolagratisdetecnologia`. Se quiser que o Claude abra PRs pelo conector GitHub do claude.ai (logado como `engelmannlabs`), adicione `engelmannlabs` como colaborador com acesso **Write** (Settings → Collaborators). Sem isso, abra os PRs pelo navegador.
