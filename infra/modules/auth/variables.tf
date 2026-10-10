variable "name_prefix" {
  description = "Prefixo dos nomes: egt-<ambiente>."
  type        = string
}

variable "domain_name" {
  description = "Domínio do site; os e-mails saem de nao-responda@<domínio>."
  type        = string
}

variable "zone_id" {
  description = "Zona Route 53 do domínio, onde ficam os registros do SES (verificação, DKIM, MAIL FROM e DMARC)."
  type        = string
}

variable "package_dir" {
  description = "Pasta com o build da API (apps/api/dist), que traz também os gatilhos do Cognito (triggers.mjs)."
  type        = string
}

variable "google_client_id" {
  description = "ID do cliente OAuth do Google deste ambiente (Google Cloud Console)."
  type        = string
}

variable "google_client_secret" {
  description = "Segredo do cliente OAuth do Google deste ambiente."
  type        = string
  sensitive   = true
}

variable "deletion_protection" {
  description = "Impede apagar o user pool (ligue em prod)."
  type        = bool
}

variable "log_retention_days" {
  description = "Retenção dos logs dos gatilhos."
  type        = number
  default     = 30
}
