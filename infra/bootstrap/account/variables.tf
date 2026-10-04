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
  description = "Repositório autorizado a assumir as roles via OIDC (owner/nome); usado na descrição das roles."
  type        = string
  default     = "escolagratisdetecnologia/escolagratisdetecnologia"
}

variable "github_subject_prefix" {
  description = "Prefixo do claim sub dos tokens OIDC do GitHub no formato imutável repo:<owner>@<owner_id>/<repo>@<repo_id>, usado por repositórios criados depois de 2026-07-15. Renomear ou transferir o repositório muda este prefixo: atualize-o antes (ADR 0014)."
  type        = string
  default     = "repo:escolagratisdetecnologia@337714343/escolagratisdetecnologia@1404541572"

  validation {
    condition     = can(regex("^repo:[^/@:]+@[0-9]+/[^/@:]+@[0-9]+$", var.github_subject_prefix))
    error_message = "github_subject_prefix deve seguir o formato imutável repo:<owner>@<owner_id>/<repo>@<repo_id> (ex.: repo:escolagratisdetecnologia@337714343/escolagratisdetecnologia@1404541572)."
  }
}
