# 0004. CloudFront com plano flat-rate

- Status: aceita
- Data: 2026-10-03
- Decisão do spec: D4

## Contexto

O site é público e beneficente, exposto a picos e ataques.

A transparência financeira exige custo previsível.

## Decisão

Uma distribuição por ambiente, com WAF associado. O plano flat-rate Free vale no beta e sobe para Pro (US$ 15) ou Business (US$ 200) conforme as requisições. A assinatura é feita pelo console, pois o provider AWS 6.67 não a suporta (verificado em 2026-10-03), conforme `docs/runbooks/cloudfront-flat-rate.md`.

O rate limit do WAF (2000 requisições por 5 minutos por IP) conta apenas requisições fora de `/_astro/`, porque no Brasil a rede móvel com CGNAT compartilha IPs entre muitos usuários e os assets imutáveis inflariam a contagem.

Os bloqueios do WAF aparecem como a página 404 do site, porque respostas customizadas do WAF exigem o plano Pro. Reavaliar ao migrar para o Pro.

## Alternativas consideradas

- Pay-as-you-go: free tier de 1 TB, mas com risco de conta-surpresa e WAF cobrado à parte.

## Consequências

- Positivas:
  - Sem cobrança de excedente; WAF, DDoS e DNS inclusos.
- Negativas:
  - Sem real-time logs, continuous deployment nem rule groups próprios; excesso sustentado pode degradar a entrega.
  - Quem é bloqueado pelo WAF vê um 404, o que dificulta o diagnóstico.

## Pilares Well-Architected

Custo, segurança e confiabilidade.

## Revisar quando

O uso passar de 50% da franquia por 2 meses (subir de plano), o provider passar a suportar o plano (gerenciar no Terraform) ou houver migração para o Pro (respostas customizadas do WAF).
