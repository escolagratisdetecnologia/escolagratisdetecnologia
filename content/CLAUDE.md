# content — cursos da Escola

Conteúdo como código (spec §4.1, decisão D2). Tudo aqui é validado por `pnpm content:check`, que roda na CI.

## Estrutura

    courses/{curso}/
      course.yaml              metadados do curso
      00-preparacao/           módulo 0, obrigatório: preparar o ambiente
        01-{aula}.md
      01-{modulo}/
        01-{aula}.md
        01-{aula}.vtt          legenda em português (obrigatória para publicar)
      projeto.md               projeto final e rubrica
    cast.yaml                  elenco de apresentadores (Fase 3)

## Regras que o `content:check` confere

- `course.yaml`: `outcome` começa com "Você sai com: "; `cost: 0` (ferramenta paga vai em `paidTools`, com alternativa grátis); `modules` lista as pastas na ordem, com títulos com acento; `hosts` existem em `cast.yaml`.
- Aulas numeradas a partir de `01`, sem buracos; o nome sem o número vira a URL (`/cursos/{curso}/{aula}/`) e não se repete no curso; `projeto` é reservado.
- Toda aula tem `summary` de uma linha (até 140 caracteres), 1 a 3 perguntas no `quiz` (`answer` conta a partir de 0) e o roteiro ou a transcrição no corpo.
- `variants` (passo a passo por aparelho) só no módulo 0, com pelo menos duas plataformas: `android`, `ios`, `windows`, `mac`, `chromeos`.
- Vídeo de 2 a 5 minutos (`durationSec` de 120 a 300). Curso com `status: published` precisa de vídeo e legenda em todas as aulas.
- Só Markdown: HTML solto no texto é recusado (a CSP do site bloqueia estilos e scripts inline). Exemplos de HTML vão entre crases ou em bloco de código, e links automáticos como `<https://…>` são aceitos.
- Rubrica do projeto com pesos somando 100 e `passScore` de 0 a 100.

## Renomear aulas

O nome do arquivo (sem o número) é o slug da aula, e a API só guarda progresso de aulas do catálogo (ADR 0024). Renomear uma aula publicada faz o progresso antigo dela sumir das telas: renomeie só enquanto o curso estiver em rascunho.

## Tom

Fale com "você", frases curtas, exemplos brasileiros (Pix, MEI, WhatsApp, comércio do bairro), jargão sempre explicado. Ferramentas grátis e no navegador primeiro. O guia de estilo completo chega na Fase 3 (`docs/conteudo/guia-de-estilo.md`).

## Rascunho e publicação

`status: draft` aparece só em dev e localmente (`SITE_DRAFTS=true`). Mude para `published` por PR quando o curso tiver vídeo e legenda em todas as aulas.
