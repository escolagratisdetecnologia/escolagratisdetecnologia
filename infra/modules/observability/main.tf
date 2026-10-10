locals {
  tags = { Component = "observability" }
  notifications = [
    { threshold = 50, type = "ACTUAL" },
    { threshold = 80, type = "ACTUAL" },
    { threshold = 100, type = "FORECASTED" },
  ]
}

# The account is dedicated to the project, so the budget covers the whole account (including
# costs AWS does not allow tagging).
resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-observability-monthly-budget"
  budget_type  = "COST"
  limit_amount = format("%.2f", var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  tags         = local.tags

  dynamic "notification" {
    # alert_emails is sensitive; only whether it is empty drives the structure, so unwrap that bit.
    for_each = nonsensitive(length(var.alert_emails)) > 0 ? local.notifications : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.threshold
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.type
      subscriber_email_addresses = var.alert_emails
    }
  }
}

# Alarm notifications by e-mail; each address confirms its subscription once (link in the e-mail).
# Without a CMK: CloudWatch alarms cannot publish to topics encrypted with the AWS managed key,
# the messages carry only alarm metadata (no personal data), and a CMK would cost US$ 1/month
# per environment (ADR 0023).
#trivy:ignore:AWS-0095
resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-observability-alerts"
  tags = local.tags
}

# count (not for_each) keeps the addresses out of the plan: they stay sensitive.
resource "aws_sns_topic_subscription" "alert_email" {
  count     = nonsensitive(length(var.alert_emails))
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_emails[count.index]
}
