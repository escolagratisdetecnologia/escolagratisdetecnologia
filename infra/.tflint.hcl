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

# Project, Environment, ManagedBy and Repository arrive via default_tags (checked in the plan by
# tools/check-tags). Here we ensure every taggable resource declares its Component.
rule "aws_resource_missing_tags" {
  enabled = true
  tags    = ["Component"]
}
