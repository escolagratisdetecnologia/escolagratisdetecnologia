# 0011. Operações via Claude Code + MCP, sempre em PR

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D11

## Contexto

O blueprint define o Claude Code como hub de conectores.

Ações externas têm risco de marca e de custo.

## Decisão

Skills ficam em `.claude/skills/` e servidores em `.mcp.json`. Toda operação termina em PR e ações externas só ocorrem após aprovação humana. O MCP remoto do HeyGen só aceita OAuth, então os vídeos são gerados no Claude Code local do mantenedor. Buffer e Stripe aceitam chave e podem rodar no GitHub Actions.

## Alternativas consideradas

- Integrações dentro do app em tempo de execução: app mais pesado e sem revisão humana.

## Consequências

- Positivas:
  - App enxuto, trilha de auditoria e humano no circuito.
- Negativas:
  - As operações dependem de alguém com acesso aos conectores.

## Pilares Well-Architected

Excelência operacional e segurança.

## Revisar quando

O HeyGen aceitar chave no MCP remoto.
