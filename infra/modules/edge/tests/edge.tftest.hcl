mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_cloudfront_function" {
    defaults = {
      arn = "arn:aws:cloudfront::123456789012:function/egt-test-viewer-request"
    }
  }

  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn            = "arn:aws:cloudfront::123456789012:distribution/E1234567890"
      domain_name    = "d111111abcdef8.cloudfront.net"
      hosted_zone_id = "Z2FDTNDATAQYW2"
    }
  }
}

mock_provider "aws" {
  alias = "us_east_1"

  mock_resource "aws_wafv2_web_acl" {
    defaults = {
      arn = "arn:aws:wafv2:us-east-1:123456789012:global/webacl/egt-test-edge/0000"
    }
  }

  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
      domain_validation_options = [
        for domain in ["escolagratisdetecnologia.com", "www.escolagratisdetecnologia.com", "dev.escolagratisdetecnologia.com"] : {
          domain_name           = domain
          resource_record_name  = "_validacao.${domain}."
          resource_record_type  = "CNAME"
          resource_record_value = "_valor.acm-validations.aws."
        }
      ]
    }
  }
}

variables {
  name_prefix                      = "egt-test"
  zone_id                          = "Z0000000000000"
  site_bucket_id                   = "egt-test-site-123"
  site_bucket_arn                  = "arn:aws:s3:::egt-test-site-123"
  site_bucket_regional_domain_name = "egt-test-site-123.s3.sa-east-1.amazonaws.com"
}

run "prod_serves_apex_and_www" {
  command = apply

  variables {
    domain_name  = "escolagratisdetecnologia.com"
    redirect_www = true
  }

  assert {
    condition     = aws_cloudfront_distribution.site.aliases == toset(["escolagratisdetecnologia.com", "www.escolagratisdetecnologia.com"])
    error_message = "Prod deveria atender o domínio e o www."
  }

  assert {
    condition     = length(aws_route53_record.alias) == 4
    error_message = "Prod precisa de registros A e AAAA para o domínio e o www."
  }

  assert {
    condition     = strcontains(aws_cloudfront_function.viewer_request.code, "var CANONICAL_HOST = 'escolagratisdetecnologia.com';")
    error_message = "A função de borda deveria receber o domínio canônico."
  }
}

run "dev_serves_only_its_domain" {
  command = apply

  variables {
    domain_name = "dev.escolagratisdetecnologia.com"
  }

  assert {
    condition     = aws_cloudfront_distribution.site.aliases == toset(["dev.escolagratisdetecnologia.com"])
    error_message = "Dev não deveria atender www."
  }

  assert {
    condition     = length(aws_route53_record.alias) == 2
    error_message = "Dev precisa só de A e AAAA."
  }

  assert {
    condition     = length(aws_wafv2_web_acl.edge.rule) == 4
    error_message = "O WAF deveria ter 3 grupos gerenciados e o rate limit."
  }

  assert {
    condition     = aws_cloudfront_distribution.site.tags["Component"] == "edge"
    error_message = "Recursos do edge precisam da tag Component=edge."
  }
}
