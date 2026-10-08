# 0009. Avaliação com quizzes formativos e projeto corrigido por IA

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D9

## Contexto

O certificado precisa provar que o problema real foi resolvido.

## Decisão

Os quizzes são formativos (resposta imediata, tentativas ilimitadas). O projeto final é corrigido pelo Claude com rubrica pública. A nota é calculada por código a partir dos critérios. Há revisão humana sob demanda e por amostragem de 5%.

## Alternativas consideradas

- Só quiz: não prova a habilidade.
- Checklist autodeclarado: fácil de fraudar.

## Consequências

- Positivas:
  - Certificado com valor de mercado.
- Negativas:
  - Custo de IA (cerca de US$ 0,02 por correção).
  - Risco de injeção de prompt, mitigado com evidência marcada como não confiável, saída estruturada, verificações determinísticas e evals de pelo menos 90%.

## Pilares Well-Architected

Segurança e custo.

## Revisar quando

A concordância com avaliadores humanos ficar abaixo de 90% em algum curso.
