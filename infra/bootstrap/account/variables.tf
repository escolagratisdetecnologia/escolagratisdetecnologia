variable "environment" {
  description = "Ambiente desta conta: dev ou prod."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment deve ser dev ou prod."
  }
}

variable "state_bucket_name" {
  description = "Bucket de estado desta conta (criado via CLI, ver docs/runbooks/bootstrap-aws.md)."
  type        = string
}

variable "zone_name" {
  description = "Zona DNS hospedada nesta conta."
  type        = string
}

variable "subdomain_delegations" {
  description = "Subdomínios delegados a outras contas: nome => lista de name servers."
  type        = map(list(string))
  default     = {}
}

variable "github_repository" {
  description = "Repositório autorizado a assumir as roles via OIDC (owner/nome)."
  type        = string
  default     = "escolagratisdetecnologia/escolagratisdetecnologia"
}
