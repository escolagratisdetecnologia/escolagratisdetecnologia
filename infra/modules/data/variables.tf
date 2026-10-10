variable "name_prefix" {
  description = "Prefixo dos nomes: egt-<ambiente>."
  type        = string
}

variable "deletion_protection" {
  description = "Impede apagar a tabela (ligado em prod; a remoção total desliga antes, veja docs/runbooks/remover-projeto.md)."
  type        = bool
  default     = true
}
