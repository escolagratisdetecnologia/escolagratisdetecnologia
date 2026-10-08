variable "environment" {
  description = "Ambiente dos recursos: dev, prod ou shared (conta de gerenciamento)."
  type        = string

  validation {
    condition     = contains(["dev", "prod", "shared"], var.environment)
    error_message = "environment deve ser dev, prod ou shared."
  }
}
