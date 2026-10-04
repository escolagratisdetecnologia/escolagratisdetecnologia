variable "name_prefix" {
  description = "Prefixo de nomes (egt-<ambiente>)."
  type        = string
}

variable "domain_name" {
  description = "Domínio canônico do site neste ambiente."
  type        = string
}

variable "redirect_www" {
  description = "Se true, atende www.<domínio> e redireciona para o domínio canônico."
  type        = bool
  default     = false
}

variable "zone_id" {
  description = "ID da zona Route 53 do domínio (criada no bootstrap)."
  type        = string
}

variable "site_bucket_id" {
  description = "Nome do bucket do site."
  type        = string
}

variable "site_bucket_arn" {
  description = "ARN do bucket do site."
  type        = string
}

variable "site_bucket_regional_domain_name" {
  description = "Domínio regional do bucket do site."
  type        = string
}

variable "rate_limit_per_5min" {
  description = "Máximo de requisições por IP a cada 5 minutos antes do bloqueio no WAF."
  type        = number
  default     = 2000
}
