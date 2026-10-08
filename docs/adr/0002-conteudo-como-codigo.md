# 0002. Conteúdo como código

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D2

## Contexto

O projeto é aberto, a autoria é assistida pelo Claude Code e a revisão pedagógica é obrigatória.

## Decisão

Os cursos ficam em Markdown/YAML em `content/`, validados por schema na CI. Os vídeos ficam no S3 e são referenciados por ID.

## Alternativas consideradas

- CMS headless: custo e dependência de fornecedor.
- Painel de administração próprio: mais código e maior superfície de ataque.

## Consequências

- Positivas:
  - Revisão por PR, histórico, contribuição externa e zero custo de CMS.
- Negativas:
  - Autores sem Git dependem de mantenedores ou do Claude Code.
  - Os gabaritos dos quizzes ficam públicos; isso é aceitável porque os quizzes são formativos e o projeto final é o portão do certificado.

## Pilares Well-Architected

Excelência operacional e custo.

## Revisar quando

Houver volume de autores não técnicos.
