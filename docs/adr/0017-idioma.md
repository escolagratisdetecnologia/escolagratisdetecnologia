# 0017. Idioma de docs e código

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D17

## Contexto

A comunidade e o público são brasileiros.

O código convive com bibliotecas e serviços em inglês.

## Decisão

Docs, ADRs, commits e PRs ficam em pt-BR. Identificadores, comentários técnicos, logs e exceções ficam em inglês. Todo texto exibido a pessoas fica em pt-BR.

No Terraform, as `description` de `variable` e `output` são em pt-BR; os metadados do lado da AWS (`comment`/`description` de recursos AWS) são em inglês ASCII; os comentários técnicos são em inglês.

## Alternativas consideradas

- Tudo em pt-BR: foge do padrão de mercado que os alunos vão encontrar.
- Tudo em inglês: afasta o público.

## Consequências

- Positivas:
  - Acessível à comunidade e alinhado ao mercado.
- Negativas:
  - Exige atenção na fronteira (mensagens de erro).

## Pilares Well-Architected

Excelência operacional.

## Revisar quando

Houver contribuidores frequentes de fora do Brasil.
