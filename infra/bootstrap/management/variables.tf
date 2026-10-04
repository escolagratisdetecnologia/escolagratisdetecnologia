variable "state_bucket_name" {
  description = "Bucket de estado da conta de gerenciamento (criado via CLI)."
  type        = string
}

variable "member_account_ids" {
  description = "Contas-membro do projeto, ex.: { dev = \"111...\", prod = \"222...\" }. Defina via TF_VAR_member_account_ids."
  type        = map(string)

  validation {
    condition     = length(var.member_account_ids) > 0 && alltrue([for id in values(var.member_account_ids) : can(regex("^[0-9]{12}$", id))])
    error_message = "member_account_ids precisa listar ao menos uma conta, com IDs de 12 dígitos (nunca o root nem uma OU)."
  }
}

variable "alert_emails" {
  description = "E-mails que recebem alertas de anomalia de custo. Defina via TF_VAR_alert_emails."
  type        = list(string)
  default     = []
}

variable "anomaly_threshold_usd" {
  description = "Impacto mínimo (USD) de uma anomalia para gerar alerta."
  type        = number
  default     = 10
}

variable "activate_cost_allocation_tags" {
  description = "Ativa Project/Environment/Component como cost allocation tags (só depois que as tags aparecerem no billing, ~24 h após o primeiro deploy)."
  type        = bool
  default     = false
}
