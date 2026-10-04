output "tag_policy_id" {
  description = "ID da tag policy do projeto."
  value       = aws_organizations_policy.tags.id
}

output "anomaly_monitor_arn" {
  description = "Monitor de anomalias de custo das contas do projeto."
  value       = aws_ce_anomaly_monitor.member_accounts.arn
}
