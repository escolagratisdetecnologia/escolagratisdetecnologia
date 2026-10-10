# 0019. CloudFront pay-as-you-go

- Status: aceita
- Data: 2026-10-08
- Decisão do spec: D4 (substitui a ADR 0004)

## Contexto

A ADR 0004 previa assinar, pelo console, o plano flat-rate Free do CloudFront em cada distribuição depois do primeiro deploy. No primeiro deploy, o mantenedor optou por manter o preço pay-as-you-go.

Pesam a favor do pay-as-you-go: o plano flat-rate não é gerenciado pelo Terraform (passo manual por distribuição), não oferece real-time logs nem rule groups próprios e pode degradar a entrega sob excesso sustentado.

## Decisão

Uma distribuição por ambiente (dev e prod), no preço pay-as-you-go, sem assinatura de plano flat-rate.

O WAF continua nos dois ambientes, com as mesmas regras (3 grupos gerenciados da AWS e o rate limit por IP da ADR 0004, que ignora `/_astro/`), para que dev espelhe prod e regras novas sejam testadas antes.

Custo esperado na Fase 0, por ambiente:

- WAF: US$ 9 por mês (US$ 5 da web ACL e US$ 1 por regra), mais US$ 0,60 por milhão de requisições.
- CloudFront: dentro do free tier permanente (1 TB de saída, 10 milhões de requisições e 2 milhões de execuções de CloudFront Functions por mês); acima disso, cobrança por uso.

## Alternativas consideradas

- Plano flat-rate Free (ADR 0004): US$ 0 até 1 milhão de requisições e 100 GB, com WAF incluso e sem excedente. Exige assinatura manual no console e traz as limitações acima.
- WAF só em prod: economizaria cerca de US$ 9 por mês, mas dev deixaria de espelhar prod.

## Consequências

- Positivas:
  - Toda a borda é gerenciada pelo Terraform, sem passo manual no console.
  - Sem os limites do plano: real-time logs e rule groups próprios ficam disponíveis.
  - Respostas customizadas do WAF ficam disponíveis sem trocar de plano. O rate limit usa isso desde a ADR 0022 (429 em JSON); os bloqueios das regras gerenciadas ainda mostram a página 404 do site.
  - O Infracost estima CloudFront e WAF diretamente.
- Negativas:
  - Custo fixo de cerca de US$ 18 por mês (WAF dos dois ambientes).
  - Cobrança sem teto: pico de tráfego ou ataque aumenta a conta. Mitigação: orçamento por conta e detecção de anomalias, com alertas por e-mail.
  - O alerta de 50% do orçamento de dev (US$ 20) pode disparar todo mês, porque só o WAF chega perto de US$ 10 com impostos.
  - A entrega de vídeos (ADR 0003) passa a ser cobrada por GB acima do free tier.

## Pilares Well-Architected

Custo (custo fixo do WAF e cobrança por uso, acompanhados por orçamento e anomalias), segurança (o mesmo WAF nos dois ambientes) e excelência operacional (sem passo manual no console).

## Revisar quando

O tráfego passar do free tier do CloudFront por 2 meses, a entrega de vídeos (Fase 3) começar, um alerta de anomalia apontar custo de borda ou o provider Terraform passar a gerenciar o plano flat-rate.
