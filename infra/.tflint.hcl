config {
  call_module_type = "local"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "aws" {
  enabled = true
  version = "0.49.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

# Project, Environment, ManagedBy e Repository chegam via default_tags (checadas no plano pelo
# tools/check-tags). Aqui garantimos que cada recurso tagueável declare seu Component.
rule "aws_resource_missing_tags" {
  enabled = true
  tags    = ["Component"]
}
