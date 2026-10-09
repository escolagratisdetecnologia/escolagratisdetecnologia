locals {
  tags = { Component = "edge" }
  # Every name the distribution serves => the Route 53 zone of its domain.
  host_zone_ids = merge([
    for domain, zone_id in merge(var.redirect_zone_ids, { (var.domain_name) = var.zone_id }) :
    var.redirect_www ? { (domain) = zone_id, "www.${domain}" = zone_id } : { (domain) = zone_id }
  ]...)
  aliases        = keys(local.host_zone_ids)
  redirect_hosts = [for host in local.aliases : host if host != var.domain_name]
  validation = {
    for option in aws_acm_certificate.site.domain_validation_options : option.domain_name => option
  }
  managed_rule_groups = {
    "aws-common"           = { priority = 10, name = "AWSManagedRulesCommonRuleSet" }
    "aws-known-bad-inputs" = { priority = 20, name = "AWSManagedRulesKnownBadInputsRuleSet" }
    "aws-ip-reputation"    = { priority = 30, name = "AWSManagedRulesAmazonIpReputationList" }
  }
}

# --- TLS certificate (CloudFront requires us-east-1) ---

resource "aws_acm_certificate" "site" {
  provider                  = aws.us_east_1
  domain_name               = var.domain_name
  subject_alternative_names = local.redirect_hosts
  validation_method         = "DNS"
  tags                      = local.tags

  lifecycle {
    create_before_destroy = true
  }
}

# Static keys (the domains) so for_each works before the certificate exists.
resource "aws_route53_record" "certificate_validation" {
  for_each = local.host_zone_ids

  zone_id         = each.value
  name            = local.validation[each.key].resource_record_name
  type            = local.validation[each.key].resource_record_type
  records         = [local.validation[each.key].resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

# --- WAF (CLOUDFRONT scope in us-east-1) ---

resource "aws_wafv2_web_acl" "edge" {
  provider = aws.us_east_1
  name     = "${var.name_prefix}-edge-waf"
  scope    = "CLOUDFRONT"
  tags     = local.tags

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups

    content {
      name     = rule.key
      priority = rule.value.priority

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.value.name
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name_prefix}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "rate-limit-ip"
    priority = 40

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5min
        aggregate_key_type = "IP"

        # Immutable hashed assets must not count toward the per-IP limit.
        scope_down_statement {
          not_statement {
            statement {
              byte_match_statement {
                positional_constraint = "STARTS_WITH"
                search_string         = "/_astro/"

                field_to_match {
                  uri_path {}
                }

                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-rate-limit-ip"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-edge-waf"
    sampled_requests_enabled   = true
  }
}

# --- CloudFront ---

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name_prefix}-edge-site-oac"
  description                       = "CloudFront access to the site bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "viewer_request" {
  name    = "${var.name_prefix}-edge-viewer-request"
  runtime = "cloudfront-js-2.0"
  comment = "Redirects alternate hosts and resolves directory index.html"
  publish = true
  code = replace(
    replace(file("${path.module}/functions/viewer-request.js"), "__CANONICAL_HOST__", var.domain_name),
    "__REDIRECT_HOSTS__", join(",", local.redirect_hosts)
  )
  tags = local.tags
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.name_prefix}-edge-security-headers"
  comment = "Security headers for the school site"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    content_security_policy {
      content_security_policy = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
      override                = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=()"
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = "PriceClass_All" # includes South America edge locations
  comment             = "${var.name_prefix} site"
  aliases             = local.aliases
  default_root_object = "index.html"
  web_acl_id          = aws_wafv2_web_acl.edge.arn
  tags                = local.tags

  origin {
    origin_id                = "site"
    domain_name              = var.site_bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_request.arn
    }
  }

  # Without s3:ListBucket a missing object answers 403; show the site's 404 page.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_route53_record" "alias" {
  for_each = {
    for pair in setproduct(local.aliases, ["A", "AAAA"]) : "${pair[0]}-${pair[1]}" => {
      name    = pair[0]
      type    = pair[1]
      zone_id = local.host_zone_ids[pair[0]]
    }
  }

  zone_id = each.value.zone_id
  name    = each.value.name
  type    = each.value.type

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

# --- CloudFront access to the bucket ---

data "aws_iam_policy_document" "site_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${var.site_bucket_arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [var.site_bucket_arn, "${var.site_bucket_arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = var.site_bucket_id
  policy = data.aws_iam_policy_document.site_bucket.json
}
