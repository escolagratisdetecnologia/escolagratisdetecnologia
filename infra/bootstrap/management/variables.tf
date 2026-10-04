variable "state_bucket_name" {
  description = "Bucket de estado da conta de gerenciamento (criado via CLI)."
  type        = string
}

variable "member_account_ids" {
  description = "Contas-membro do projeto, ex.: { dev = \"111...\", prod = \"222...\" }. Defina via TF_VAR_member_account_ids."
  type        = map(string)
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
