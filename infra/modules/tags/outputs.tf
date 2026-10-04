output "default_tags" {
  description = "Tags aplicadas a todo recurso via default_tags do provider AWS."
  value = {
    Project     = local.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = local.repository
  }
}

output "name_prefix" {
  description = "Prefixo dos nomes de recursos: egt-<ambiente>."
  value       = "egt-${var.environment}"
}
