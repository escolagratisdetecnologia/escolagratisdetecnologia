# OIDC trust, role names and DNS zones: mocked providers, plan-only, no AWS access.
mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

# The root adopts the bucket with an import block, which mocks cannot import.
override_resource {
  target = module.state_bucket.aws_s3_bucket.this
  values = {
    arn = "arn:aws:s3:::escolagratis-tfstate-dev"
  }
}

override_data {
  target = module.state_bucket.data.aws_iam_policy_document.tls_only
  values = {
    json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
  }
}

# Mocked policy documents return random strings, but IAM policy arguments must be valid JSON.
override_data {
  target = data.aws_iam_policy_document.plan_state_lock
  values = {
    json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
  }
}

override_data {
  target = data.aws_iam_policy_document.plan_deny_data_reads
  values = {
    json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
  }
}

override_data {
  target = data.aws_iam_policy_document.audit
  values = {
    json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
  }
}

variables {
  environment       = "dev"
  state_bucket_name = "escolagratis-tfstate-dev"
  zone_name         = "dev.escolagratisdetecnologia.com"
}

run "trusts_immutable_subjects" {
  command = plan

  assert {
    condition = anytrue([
      for c in data.aws_iam_policy_document.github_trust["plan"].statement[0].condition :
      c.variable == "token.actions.githubusercontent.com:sub" && c.test == "StringEquals" && toset(c.values) == toset(["repo:escolagratisdetecnologia@337714343/escolagratisdetecnologia@1404541572:pull_request"])
    ])
    error_message = "A role plan deve confiar só no subject imutável de pull_request."
  }

  assert {
    condition = anytrue([
      for c in data.aws_iam_policy_document.github_trust["apply"].statement[0].condition :
      c.variable == "token.actions.githubusercontent.com:sub" && c.test == "StringEquals" && toset(c.values) == toset(["repo:escolagratisdetecnologia@337714343/escolagratisdetecnologia@1404541572:environment:dev"])
    ])
    error_message = "A role apply deve confiar só no subject imutável do environment dev."
  }

  assert {
    condition = anytrue([
      for c in data.aws_iam_policy_document.github_trust["audit"].statement[0].condition :
      c.variable == "token.actions.githubusercontent.com:sub" && c.test == "StringEquals" && toset(c.values) == toset(["repo:escolagratisdetecnologia@337714343/escolagratisdetecnologia@1404541572:ref:refs/heads/main"])
    ])
    error_message = "A role audit deve confiar só no subject imutável da branch main."
  }

  # Static keys: indexing the whole resource dynamically makes Terraform 1.16 crash while
  # rendering a failed assertion (the role object carries deprecation marks).
  assert {
    condition     = aws_iam_role.github["plan"].name == "egt-dev-bootstrap-github-plan"
    error_message = "A role de plan deve se chamar egt-dev-bootstrap-github-plan."
  }

  assert {
    condition     = aws_iam_role.github["apply"].name == "egt-dev-bootstrap-github-apply"
    error_message = "A role de apply deve se chamar egt-dev-bootstrap-github-apply."
  }

  assert {
    condition     = aws_iam_role.github["audit"].name == "egt-dev-bootstrap-github-audit"
    error_message = "A role de audit deve se chamar egt-dev-bootstrap-github-audit."
  }

  assert {
    condition     = aws_resourceexplorer2_view.all.name == "egt-dev-bootstrap-all-resources"
    error_message = "A view do Resource Explorer deve se chamar egt-dev-bootstrap-all-resources."
  }
}

run "rejects_subject_prefix_with_slash_in_repo" {
  command = plan

  variables {
    github_subject_prefix = "repo:a@1/b/c@2"
  }

  expect_failures = [var.github_subject_prefix]
}

run "rejects_mutable_subject_prefix" {
  command = plan

  variables {
    github_subject_prefix = "repo:escolagratisdetecnologia/escolagratisdetecnologia"
  }

  expect_failures = [var.github_subject_prefix]
}

run "has_no_additional_zones_by_default" {
  command = plan

  assert {
    condition     = length(aws_route53_zone.additional) == 0
    error_message = "Sem additional_zone_names, a conta deveria ter só a zona principal."
  }
}

run "creates_additional_zones" {
  command = plan

  variables {
    environment           = "prod"
    state_bucket_name     = "escolagratis-tfstate-prod"
    zone_name             = "escolagratisdetecnologia.com"
    additional_zone_names = ["escolagratisdetecnologia.com.br"]
  }

  assert {
    condition     = aws_route53_zone.additional["escolagratisdetecnologia.com.br"].name == "escolagratisdetecnologia.com.br"
    error_message = "A zona do escolagratisdetecnologia.com.br deveria ser criada."
  }

  assert {
    condition     = aws_route53_zone.additional["escolagratisdetecnologia.com.br"].tags["Component"] == "bootstrap"
    error_message = "As zonas adicionais precisam da tag Component=bootstrap."
  }
}
