# 0018. Entidade de doações parametrizada

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D18

## Contexto

Ainda não está definido se as doações serão recebidas pela Engelmann Labs ou por uma associação sem fins lucrativos.

Isso muda os textos legais e os impostos.

## Decisão

Nome, CNPJ e regime fiscal ficam em `content/transparency/entidade.yaml`. A página `/apoie` só é publicada com o arquivo preenchido (validado na CI, Fase 4).

## Alternativas consideradas

- Decidir agora: bloquearia o projeto.

## Consequências

- Positivas:
  - O sistema fica neutro e pronto para qualquer das duas entidades.
- Negativas:
  - A Fase 4 só vai ao ar após a decisão jurídica.

## Pilares Well-Architected

Não se aplica diretamente.

## Revisar quando

A entidade for definida (substituir esta ADR por uma nova).
