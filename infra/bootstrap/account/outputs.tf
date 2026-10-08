output "zone_name_servers" {
  description = "Name servers da zona desta conta (copiar para o registrador ou para a delegação)."
  value       = aws_route53_zone.this.name_servers
}

output "github_role_arns" {
  description = "ARNs das roles assumidas pelo GitHub Actions."
  value       = { for key, role in aws_iam_role.github : key => role.arn }
}

output "state_bucket" {
  description = "Bucket de estado desta conta."
  value       = module.state_bucket.bucket_id
}
