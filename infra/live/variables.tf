variable "environment" {
  description = "Ambiente da aplicação: dev ou prod."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment deve ser dev ou prod."
  }
}

variable "domain_name" {
  description = "Domínio do site neste ambiente (a zona Route 53 é criada no bootstrap)."
  type        = string
}

variable "redirect_www" {
  description = "Atende www.<domínio> redirecionando para o domínio (somente prod)."
  type        = bool
  default     = false
}

variable "redirect_domains" {
  description = "Outros domínios que redirecionam para domain_name (somente prod; a zona de cada um é criada no bootstrap, ADR 0020)."
  type        = list(string)
  default     = []
}

variable "monthly_budget_usd" {
  description = "Orçamento mensal da conta em USD."
  type        = number
}

variable "alert_emails" {
  description = "E-mails de alerta. Defina via TF_VAR_alert_emails; nunca versione e-mails pessoais."
  type        = list(string)
  default     = []
  sensitive   = true
}

variable "app_version" {
  description = "Versão publicada da API (o commit do deploy, via TF_VAR_app_version)."
  type        = string
  default     = "local"
}

variable "google_client_id" {
  description = "ID do cliente OAuth do Google deste ambiente (GitHub Variable GOOGLE_CLIENT_ID_<AMBIENTE>, via TF_VAR_google_client_id)."
  type        = string
}

variable "google_client_secret" {
  description = "Segredo do cliente OAuth do Google (GitHub Secret GOOGLE_CLIENT_SECRET_<AMBIENTE>, via TF_VAR_google_client_secret)."
  type        = string
  sensitive   = true
}

variable "data_deletion_protection" {
  description = "Proteção contra exclusão da tabela DynamoDB e do user pool dos alunos (ligada em prod)."
  type        = bool
  default     = true
}
