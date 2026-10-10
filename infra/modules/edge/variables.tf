variable "name_prefix" {
  description = "Prefixo de nomes (egt-<ambiente>)."
  type        = string
}

variable "domain_name" {
  description = "Domínio canônico do site neste ambiente."
  type        = string
}

variable "redirect_www" {
  description = "Se true, atende www.<domínio> (e o www de cada domínio em redirect_zone_ids) e redireciona para o domínio canônico."
  type        = bool
  default     = false
}

variable "redirect_zone_ids" {
  description = "Outros domínios que redirecionam para o domínio canônico => ID da zona Route 53 de cada um (ADR 0020)."
  type        = map(string)
  default     = {}
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

variable "api_origin_domain" {
  description = "Domínio do API Gateway (sem https://), origem do caminho /api/*."
  type        = string
}

variable "api_origin_verify_secret" {
  description = "Segredo enviado à API no cabeçalho x-origin-verify (ADR 0022)."
  type        = string
  sensitive   = true
}
