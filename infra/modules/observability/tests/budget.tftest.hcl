mock_provider "aws" {}

variables {
  name_prefix        = "egt-test"
  monthly_budget_usd = 20
}

run "with_alert_emails" {
  command = plan

  variables {
    alert_emails = ["alertas@example.com"]
  }

  assert {
    condition     = length(aws_budgets_budget.monthly.notification) == 3
    error_message = "Esperadas 3 notificações com e-mails de alerta."
  }

  assert {
    condition     = aws_budgets_budget.monthly.name == "egt-test-monthly"
    error_message = "Nome do orçamento inesperado."
  }
}

run "without_alert_emails" {
  command = plan

  variables {
    alert_emails = []
  }

  assert {
    condition     = length(aws_budgets_budget.monthly.notification) == 0
    error_message = "Sem e-mails, não deve haver notificações."
  }
}
