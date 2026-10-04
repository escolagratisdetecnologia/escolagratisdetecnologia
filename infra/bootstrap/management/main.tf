module "tags" {
  source      = "../../modules/tags"
  environment = "shared"
}

locals {
  tags = { Component = "bootstrap" }

  # Enforced resource types: tagging operations with non-standard values are blocked.
  # If AWS rejects a type (InvalidInputException), remove it from this list.
  enforced_resource_types = [
    "s3:bucket",
    "dynamodb:table",
    "lambda:function",
    "acm:certificate",
    "cloudfront:distribution",
  ]

  tag_policy = {
    tags = {
      Project = {
        tag_key      = { "@@assign" = "Project" }
        tag_value    = { "@@assign" = ["escola-gratis-de-tecnologia"] }
        enforced_for = { "@@assign" = local.enforced_resource_types }
      }
      Environment = {
        tag_key      = { "@@assign" = "Environment" }
        tag_value    = { "@@assign" = ["dev", "prod", "shared"] }
        enforced_for = { "@@assign" = local.enforced_resource_types }
      }
    }
  }
}

import {
  to = module.state_bucket.aws_s3_bucket.this
  id = var.state_bucket_name
}

module "state_bucket" {
  source      = "../../modules/state-bucket"
  bucket_name = var.state_bucket_name
}

# --- Tag policy: attached only to the project accounts, never to the organization root ---

resource "aws_organizations_policy" "tags" {
  name        = "egt-tag-policy"
  description = "Escola Gratis de Tecnologia tag standard (ADR 0015)"
  type        = "TAG_POLICY"
  content     = jsonencode(local.tag_policy)
  tags        = local.tags
}

resource "aws_organizations_policy_attachment" "tags" {
  for_each = var.member_account_ids

  policy_id = aws_organizations_policy.tags.id
  target_id = each.value
}

# --- Cost anomaly detection on the project accounts ---

resource "aws_ce_anomaly_monitor" "member_accounts" {
  provider     = aws.us_east_1
  name         = "egt-contas-do-projeto"
  monitor_type = "CUSTOM"
  tags         = local.tags

  monitor_specification = jsonencode({
    And            = null
    CostCategories = null
    Not            = null
    Or             = null
    Tags           = null
    Dimensions = {
      Key          = "LINKED_ACCOUNT"
      MatchOptions = null
      Values       = values(var.member_account_ids)
    }
  })
}

resource "aws_ce_anomaly_subscription" "email" {
  count = length(var.alert_emails) > 0 ? 1 : 0

  provider         = aws.us_east_1
  name             = "egt-anomalias-de-custo"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.member_accounts.arn]
  tags             = local.tags

  dynamic "subscriber" {
    for_each = var.alert_emails

    content {
      type    = "EMAIL"
      address = subscriber.value
    }
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.anomaly_threshold_usd)]
    }
  }
}

# --- Cost allocation tags (cost per project, environment and component) ---

resource "aws_ce_cost_allocation_tag" "this" {
  for_each = var.activate_cost_allocation_tags ? toset(["Project", "Environment", "Component"]) : toset([])

  provider = aws.us_east_1
  tag_key  = each.key
  status   = "Active"
}
