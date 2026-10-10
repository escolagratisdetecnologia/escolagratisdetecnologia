variable "name_prefix" {
  description = "Prefixo dos nomes: egt-<ambiente>."
  type        = string
}

variable "environment" {
  description = "Ambiente (dev ou prod), repassado à API como APP_ENV."
  type        = string
}

variable "package_dir" {
  description = "Pasta com o build da API (apps/api/dist, gerado por pnpm --filter @egt/api build)."
  type        = string
}

variable "app_version" {
  description = "Versão publicada (o commit do deploy), exposta em /api/health."
  type        = string
}

variable "site_origin" {
  description = "Origem do site (https://<domínio>), a única aceita em mudanças (CSRF)."
  type        = string
}

variable "table_name" {
  description = "Tabela DynamoDB da aplicação."
  type        = string
}

variable "table_arn" {
  description = "ARN da tabela, para a política de menor privilégio."
  type        = string
}

variable "user_pool_id" {
  description = "User pool dos alunos (login, ADR 0024)."
  type        = string
}

variable "user_pool_arn" {
  description = "ARN do user pool, para a política de menor privilégio."
  type        = string
}

variable "user_pool_client_id" {
  description = "Cliente da API no user pool."
  type        = string
}

variable "user_pool_client_secret" {
  description = "Segredo do cliente da API no user pool."
  type        = string
  sensitive   = true
}

variable "auth_domain" {
  description = "Domínio de login do Cognito (auth.<domínio>), por onde passa o login com Google."
  type        = string
}

variable "alarm_topic_arn" {
  description = "Tópico SNS que recebe os alarmes."
  type        = string
}

variable "origin_verify_version" {
  description = "Troque o número para gerar um novo segredo de origem (rotação, ADR 0022)."
  type        = number
  default     = 1
}

variable "log_retention_days" {
  description = "Retenção dos logs da Lambda e do API Gateway."
  type        = number
  default     = 30
}

variable "throttling_burst_limit" {
  description = "Pico de requisições simultâneas aceito pelo API Gateway."
  type        = number
  default     = 100
}

variable "throttling_rate_limit" {
  description = "Requisições por segundo sustentadas no API Gateway."
  type        = number
  default     = 50
}
