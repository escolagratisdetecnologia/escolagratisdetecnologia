# 0016. Licenças

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D16

## Contexto

O projeto é beneficente e aberto.

Queremos evitar clones comerciais fechados e manter o conteúdo reutilizável por alunos e educadores.

## Decisão

O código usa AGPL-3.0-or-later e o conteúdo usa CC BY-SA 4.0. Nome e marca são reservados (`TRADEMARK.md`).

Vídeos (Texto B, restritivo): são de uso livre e gratuito para assistir e compartilhar o link, mas não podem ser baixados para redistribuição ou edição; roteiros e transcrições seguem CC BY-SA 4.0. A decisão se baseia na verificação dos termos do HeyGen lida em 2026-10-04 (fontes: https://www.heygen.com/terms e https://www.heygen.com/moderation-policy):

- Planos pagos (seção 3): "you own all rights in your User Input or User Output", sem restrição ao uso comercial.
- Plano gratuito (seção 4): licença "limited, non-exclusive, non-transferable, revocable"; o resultado "may not be sold, sublicensed, redistributed, monetized, or used in connection with commercial activities".
- Seção 2: quem distribui o resultado deve "proactively disclose that such User Output was created using artificial intelligence technologies".
- Os termos e a política de moderação são omissos sobre avatares e vozes de estoque e sobre avatares criados por prompt.

Como a titularidade depende do plano e os termos são omissos sobre avatares de estoque, na dúvida adotou-se o Texto B. Este resumo foi produzido por uma ferramenta de busca que resume páginas, não pelo texto bruto: o mantenedor deve reler os termos originais antes de publicar o primeiro vídeo.

## Alternativas consideradas

- MIT/Apache: permitiriam um fork fechado oferecido como serviço.
- CC BY-NC: impediria o uso comercial legítimo pelos próprios alunos.
- Vídeos sob CC BY-SA (Texto A): descartado pela dúvida sobre o direito de sublicenciar.

## Consequências

- Positivas:
  - Os derivados continuam livres e a licença dos vídeos protege a Escola de violar os termos do HeyGen.
- Negativas:
  - Algumas empresas evitam AGPL.
  - Os vídeos do HeyGen que contêm avatares de IA exigem aviso de que foram criados com inteligência artificial (seção 2); isso deve constar nos vídeos publicados a partir da Fase 3.
  - Imagens ou quadros extraídos dos vídeos seguem os mesmos termos dos vídeos.

## Pilares Well-Architected

Não se aplica diretamente.

## Revisar quando

Os termos do HeyGen mudarem, houver plano pago com confirmação escrita do HeyGen sobre sublicenciamento ou surgir pedido de licenciamento diferente.
