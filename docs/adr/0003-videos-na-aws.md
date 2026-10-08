# 0003. Vídeos hospedados na AWS

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D3

## Contexto

O curso terá muitos vídeos.

Não queremos anúncios nem rastreamento de terceiros (LGPD) e queremos controle de player, legendas e economia de dados.

## Decisão

Os vídeos usam S3 + MediaConvert (HLS em 360/540/720p, segmentos de 6 s) + CloudFront.

## Alternativas consideradas

- YouTube: grátis, mas com anúncios, cookies de terceiros, player pesado e distrações.
- Vimeo: pago por armazenamento.

## Consequências

- Positivas:
  - Experiência limpa, acessível e sem rastreamento.
- Negativas:
  - Custo de transcodificação e de entrega, mitigado pela ADR 0004.

## Pilares Well-Architected

Performance, segurança (privacidade) e custo.

## Revisar quando

A entrega de vídeo passar de 30% dos gastos mensais.
