# 0008. Política de SMS

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D8

## Contexto

O Cognito não combina MFA com login sem senha, o público tem pouca experiência e cada SMS custa.

## Decisão

A equipe usa SMS MFA obrigatório a cada login. O aluno confirma o celular uma vez, antes do primeiro certificado. Vale a regra 1 celular = 1 conta, com máximo de 3 SMS por dia.

## Alternativas consideradas

- E-mail + SMS a cada login: mais atrito e custo.
- MFA opcional para alunos: fluxo confuso.

## Consequências

- Positivas:
  - Atrito mínimo, antifraude na emissão do certificado e custo previsível.
- Negativas:
  - A conta de aluno fica sem segundo fator; o risco é baixo, pois não há dados financeiros.

## Pilares Well-Architected

Segurança e custo.

## Revisar quando

Houver tomada de contas de alunos ou a conta passar a guardar algo de maior valor.
