# Plano flat-rate do CloudFront

> **Não usado hoje.** O projeto está no pay-as-you-go (ADR 0019), sem plano flat-rate. Este runbook fica para uma eventual migração.

O provider Terraform AWS (6.67, verificado em 2026-10-03) não gerencia a assinatura do plano (ADR 0004). Faça pelo console, uma vez por distribuição (dev e prod).

## Assinar

1. Console do CloudFront (conta do ambiente) → Distributions → distribuição com comentário `egt-<env> site`.
2. **Manage plan** → escolha **Free** no beta (cada conta pode ter até 3 planos Free).
3. Em **Manage plan**, anexe a zona Route 53 do ambiente ao plano (passa a cobrir zona, registros e consultas).
4. Confirme que não há recursos não suportados (real-time logs, continuous deployment, rule groups próprios). O Terraform já associa o WAF exigido pelo plano: `egt-<env>-edge-waf`.

## Limites do WAF

O plano Free permite 5 regras de WAF, e o web ACL `egt-<env>-edge-waf` usa as 5: 3 grupos gerenciados da AWS (Common, Known Bad Inputs, IP Reputation), o limite de requisições do login (`/api/auth/*`, ADR 0024) e o limite geral por IP, que ignora `/_astro/`. Os dois limites usam uma resposta customizada (429 em JSON, ADR 0022), e respostas customizadas exigem o plano Pro. Para assinar o plano Free, primeiro troque, por PR, essas regras para o bloqueio padrão: o visitante bloqueado volta a ver a página 404 do site, e a API recebe essa página em vez do JSON.

## Depois de assinar

Rode o plano de conferência (o `TF_VAR_alert_emails` é obrigatório: sem ele o plano remove as 3 notificações do orçamento e parece drift):

```bash
export AWS_PROFILE=egt-<env>
export TF_VAR_alert_emails='["<seu-e-mail>"]'
export TF_VAR_google_client_id='<client ID do ambiente>' TF_VAR_google_client_secret='<client secret do ambiente>'
pnpm --filter @egt/api build
infra/tf live <env> plan
```

O esperado é "No changes". Se o Terraform quiser desfazer algo do plano, abra uma issue e proponha, por PR, um `lifecycle { ignore_changes = [...] }` no atributo afetado do módulo `edge`.

## Quando subir de plano

A AWS envia e-mails em 50%, 80% e 100% da franquia mensal. Suba de plano quando o uso passar de 50% por 2 meses seguidos:

| Plano    | Preço   | Requisições/mês | Transferência/mês |
| -------- | ------- | --------------- | ----------------- |
| Free     | US$ 0   | 1 milhão        | 100 GB            |
| Pro      | US$ 15  | 10 milhões      | 50 TB             |
| Business | US$ 200 | 125 milhões     | 50 TB             |

Registre a mudança na transparência (Fase 4) e no comentário de custo do PR mais próximo.
