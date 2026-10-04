variable "name_prefix" {
  description = "Prefixo de nomes (egt-<ambiente>)."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Orçamento mensal da conta em USD."
  type        = number
}

variable "alert_emails" {
  description = "E-mails que recebem alertas de orçamento. Vazio desliga as notificações."
  type        = list(string)
  default     = []
}
