# Plano flat-rate do CloudFront

O provider Terraform AWS (6.67, verificado em 2026-10-03) não gerencia a assinatura do plano (ADR 0004). Faça pelo console, uma vez por distribuição (dev e prod).

## Assinar

1. Console do CloudFront (conta do ambiente) → Distributions → distribuição com comentário `egt-<env> site`.
2. **Manage plan** → escolha **Free** no beta (cada conta pode ter até 3 planos Free).
3. Em **Manage plan**, anexe a zona Route 53 do ambiente ao plano (passa a cobrir zona, registros e consultas).
4. Confirme que não há recursos não suportados (real-time logs, continuous deployment, rule groups próprios). O Terraform já associa o WAF exigido pelo plano: `egt-<env>-edge-waf`.

## Limites do WAF

O plano Free permite 5 regras de WAF. O web ACL `egt-<env>-edge-waf` usa 4: 3 grupos gerenciados da AWS (Common, Known Bad Inputs, IP Reputation) e o limite de requisições por IP, que ignora `/_astro/`. Respostas customizadas de bloqueio exigem o plano Pro; até lá, um visitante bloqueado vê a página 404 do site.

## Depois de assinar

Rode `infra/tf live <env> plan`. O esperado é "No changes". Se o Terraform quiser desfazer algo do plano, abra uma issue e proponha, por PR, um `lifecycle { ignore_changes = [...] }` no atributo afetado do módulo `edge`.

## Quando subir de plano

A AWS envia e-mails em 50%, 80% e 100% da franquia mensal. Suba de plano quando o uso passar de 50% por 2 meses seguidos:

| Plano    | Preço   | Requisições/mês | Transferência/mês |
| -------- | ------- | --------------- | ----------------- |
| Free     | US$ 0   | 1 milhão        | 100 GB            |
| Pro      | US$ 15  | 10 milhões      | 50 TB             |
| Business | US$ 200 | 125 milhões     | 50 TB             |

Registre a mudança na transparência (Fase 4) e no comentário de custo do PR mais próximo.
