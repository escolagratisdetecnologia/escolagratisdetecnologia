# 0007. Amazon Cognito para identidade

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D7

## Contexto

Precisamos de SSO Google, login sem senha por e-mail e MFA via SMS.

O mantenedor prefere serviço gerenciado.

## Decisão

O pool de alunos usa o plano Essentials (Google + código por e-mail, com telas próprias via BFF e cookies HttpOnly). O pool da equipe usa o plano Lite (senha + SMS MFA obrigatório).

## Alternativas consideradas

- Biblioteca open source no Lambda (Better Auth): cerca de US$ 5/mês com 100 mil MAU e roda localmente, mas a segurança fica por nossa conta.
- Cognito Lite com gatilhos customizados.

## Consequências

- Positivas:
  - Serviço gerenciado e menos código de segurança.
- Negativas:
  - O custo cresce (US$ 0,015/MAU acima de 10 mil; cerca de US$ 600/mês com 50 mil MAU).
  - Não roda localmente; usamos um emissor OIDC falso.
  - O MFA do Cognito não se aplica a usuários federados nem ao login sem senha.
- Detalhes do login dos alunos (código por e-mail, vínculo com o Google, sessão, idade mínima): ADR 0024.

## Pilares Well-Architected

Segurança e custo.

## Revisar quando

O projeto chegar a **30 mil MAU**: reavaliar o Lite com gatilhos ou autenticação própria.
