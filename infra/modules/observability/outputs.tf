output "budget_name" {
  description = "Nome do orçamento mensal."
  value       = aws_budgets_budget.monthly.name
}
