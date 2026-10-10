output "budget_name" {
  description = "Nome do orçamento mensal."
  value       = aws_budgets_budget.monthly.name
}

output "alerts_topic_arn" {
  description = "Tópico SNS dos alarmes (e-mail)."
  value       = aws_sns_topic.alerts.arn
}
