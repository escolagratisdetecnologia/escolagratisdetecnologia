module "tags" {
  source      = "../../modules/tags"
  environment = var.environment
}

locals {
  prefix = module.tags.name_prefix
  tags   = { Component = "bootstrap" }

  # Repositories created after 2026-07-15 get immutable OIDC subjects that embed the owner and
  # repository IDs (repo:<owner>@<owner_id>/<repo>@<repo_id>:...). Renaming or transferring the
  # repository changes the prefix, so update github_subject_prefix first (ADR 0014).
  github_subjects = {
    plan = "${var.github_subject_prefix}:pull_request"
    # The environment subject is issued to any job that declares the environment, so the GitHub
    # Environments dev/prod MUST restrict deployments to main (docs/runbooks/configurar-github.md);
    # that restriction is what keeps feature branches away from the apply role.
    apply = "${var.github_subject_prefix}:environment:${var.environment}"
    audit = "${var.github_subject_prefix}:ref:refs/heads/main"
  }
}

# --- Terraform state (bucket created via CLI and adopted here) ---

import {
  to = module.state_bucket.aws_s3_bucket.this
  id = var.state_bucket_name
}

module "state_bucket" {
  source      = "../../modules/state-bucket"
  bucket_name = var.state_bucket_name
}

# --- GitHub Actions via OIDC (no long-lived keys) ---

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = local.tags
}

data "aws_iam_policy_document" "github_trust" {
  for_each = local.github_subjects

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [each.value]
    }
  }
}

resource "aws_iam_role" "github" {
  for_each = local.github_subjects

  name                 = "${local.prefix}-bootstrap-github-${each.key}"
  description          = "GitHub Actions (${each.key}) for ${var.github_repository}"
  assume_role_policy   = data.aws_iam_policy_document.github_trust[each.key].json
  max_session_duration = 3600
  tags                 = local.tags
}

resource "aws_iam_role_policy_attachment" "plan_read_only" {
  role       = aws_iam_role.github["plan"].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "plan_state_lock" {
  statement {
    # PR plans only touch the live state, so the plan role can never delete the bootstrap lock.
    sid       = "TerraformLockFiles"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${module.state_bucket.bucket_arn}/live/*.tflock"]
  }
}

resource "aws_iam_role_policy" "plan_state_lock" {
  name   = "terraform-state-lock"
  role   = aws_iam_role.github["plan"].id
  policy = data.aws_iam_policy_document.plan_state_lock.json
}

# PR jobs run without approval, so the read-only plan role must not read content (personal data,
# secrets, logs). kms:Decrypt also blocks SecureString parameter values; if a future module makes
# Terraform refresh SecureString parameters, revisit this deny in that module's ADR.
data "aws_iam_policy_document" "plan_deny_data_reads" {
  statement {
    sid           = "DenyObjectReadsOutsideState"
    effect        = "Deny"
    actions       = ["s3:GetObject", "s3:GetObjectVersion"]
    not_resources = ["${module.state_bucket.bucket_arn}/*"]
  }

  statement {
    sid    = "DenyDataPlaneReads"
    effect = "Deny"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:GetRecords",
      "dynamodb:PartiQLSelect",
      "cognito-idp:ListUsers",
      "cognito-idp:ListUsersInGroup",
      "cognito-idp:AdminGetUser",
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
      "logs:StartQuery",
      "logs:GetQueryResults",
      "logs:StartLiveTail",
      "secretsmanager:GetSecretValue",
      "secretsmanager:BatchGetSecretValue",
      "kms:Decrypt",
      "sqs:ReceiveMessage",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "plan_deny_data_reads" {
  name   = "deny-data-reads"
  role   = aws_iam_role.github["plan"].id
  policy = data.aws_iam_policy_document.plan_deny_data_reads.json
}

# Broad apply access, restricted to jobs in protected GitHub Environments (ADR 0014).
resource "aws_iam_role_policy_attachment" "apply_admin" {
  role       = aws_iam_role.github["apply"].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

data "aws_iam_policy_document" "audit" {
  statement {
    sid = "ResourceExplorerSearch"
    actions = [
      "resource-explorer-2:Search",
      "resource-explorer-2:GetView",
      "resource-explorer-2:GetDefaultView",
      "resource-explorer-2:ListViews",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "audit" {
  name   = "tag-audit"
  role   = aws_iam_role.github["audit"].id
  policy = data.aws_iam_policy_document.audit.json
}

# --- Resource Explorer (tag-based inventory; used by the weekly audit) ---

resource "aws_resourceexplorer2_index" "aggregator" {
  type = "AGGREGATOR"
  tags = local.tags
}

resource "aws_resourceexplorer2_index" "us_east_1" {
  provider = aws.us_east_1
  type     = "LOCAL"
  tags     = local.tags
}

resource "aws_resourceexplorer2_view" "all" {
  name         = "${local.prefix}-bootstrap-all-resources"
  default_view = true
  tags         = local.tags

  included_property {
    name = "tags"
  }

  depends_on = [aws_resourceexplorer2_index.aggregator]
}

# --- DNS ---

resource "aws_route53_zone" "this" {
  name    = var.zone_name
  comment = "Escola Gratis de Tecnologia (${var.environment})"
  tags    = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

# Other domains of the site in this account (ADR 0020).
resource "aws_route53_zone" "additional" {
  for_each = toset(var.additional_zone_names)

  name    = each.key
  comment = "Escola Gratis de Tecnologia (${var.environment})"
  tags    = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "delegation" {
  for_each = var.subdomain_delegations

  zone_id = aws_route53_zone.this.zone_id
  name    = each.key
  type    = "NS"
  ttl     = 172800
  records = each.value
}
