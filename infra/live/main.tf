module "tags" {
  source      = "../modules/tags"
  environment = var.environment
}

data "aws_route53_zone" "site" {
  name = var.domain_name
}

data "aws_route53_zone" "redirect" {
  for_each = toset(var.redirect_domains)
  name     = each.key
}

module "site" {
  source      = "../modules/site"
  name_prefix = module.tags.name_prefix
}

module "data" {
  source              = "../modules/data"
  name_prefix         = module.tags.name_prefix
  deletion_protection = var.data_deletion_protection
}

module "api" {
  source = "../modules/api"

  name_prefix     = module.tags.name_prefix
  environment     = var.environment
  package_dir     = "${path.root}/../../apps/api/dist"
  app_version     = var.app_version
  site_origin     = "https://${var.domain_name}"
  table_name      = module.data.table_name
  table_arn       = module.data.table_arn
  alarm_topic_arn = module.observability.alerts_topic_arn

  # Rotation of the CloudFront → API secret: bump and merge (docs/runbooks/deploy.md).
  origin_verify_version = 1
}

module "edge" {
  source = "../modules/edge"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix                      = module.tags.name_prefix
  domain_name                      = var.domain_name
  redirect_www                     = var.redirect_www
  redirect_zone_ids                = { for domain, zone in data.aws_route53_zone.redirect : domain => zone.zone_id }
  zone_id                          = data.aws_route53_zone.site.zone_id
  site_bucket_id                   = module.site.bucket_id
  site_bucket_arn                  = module.site.bucket_arn
  site_bucket_regional_domain_name = module.site.bucket_regional_domain_name
  api_origin_domain                = module.api.origin_domain
  api_origin_verify_secret         = module.api.origin_verify_secret
}

module "observability" {
  source             = "../modules/observability"
  name_prefix        = module.tags.name_prefix
  monthly_budget_usd = var.monthly_budget_usd
  alert_emails       = var.alert_emails
}
