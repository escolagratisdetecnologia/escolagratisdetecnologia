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

variable "monthly_budget_usd" {
  description = "Orçamento mensal da conta em USD."
  type        = number
}

variable "alert_emails" {
  description = "E-mails de alerta. Defina via TF_VAR_alert_emails; nunca versione e-mails pessoais."
  type        = list(string)
  default     = []
}
