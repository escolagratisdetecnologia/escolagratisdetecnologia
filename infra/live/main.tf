module "tags" {
  source      = "../modules/tags"
  environment = var.environment
}

data "aws_route53_zone" "site" {
  name = var.domain_name
}

module "site" {
  source      = "../modules/site"
  name_prefix = module.tags.name_prefix
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
  zone_id                          = data.aws_route53_zone.site.zone_id
  site_bucket_id                   = module.site.bucket_id
  site_bucket_arn                  = module.site.bucket_arn
  site_bucket_regional_domain_name = module.site.bucket_regional_domain_name
}

module "observability" {
  source             = "../modules/observability"
  name_prefix        = module.tags.name_prefix
  monthly_budget_usd = var.monthly_budget_usd
  alert_emails       = var.alert_emails
}
