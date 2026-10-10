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
    condition     = aws_budgets_budget.monthly.name == "egt-test-observability-monthly-budget"
    error_message = "Nome do orçamento inesperado."
  }

  assert {
    condition     = aws_sns_topic.alerts.name == "egt-test-observability-alerts"
    error_message = "Nome do tópico de alertas inesperado."
  }

  assert {
    condition     = length(aws_sns_topic_subscription.alert_email) == 1 && aws_sns_topic_subscription.alert_email[0].protocol == "email"
    error_message = "Esperada 1 assinatura por e-mail."
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

  assert {
    condition     = length(aws_sns_topic_subscription.alert_email) == 0
    error_message = "Sem e-mails, não deve haver assinaturas."
  }
}
