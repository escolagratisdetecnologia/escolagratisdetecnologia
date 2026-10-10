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
        for domain in [
          "escolagratisdetecnologia.com.br", "www.escolagratisdetecnologia.com.br",
          "escolagratisdetecnologia.com", "www.escolagratisdetecnologia.com",
          "dev.escolagratisdetecnologia.com",
          ] : {
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
  api_origin_domain                = "abc123.execute-api.sa-east-1.amazonaws.com"
  api_origin_verify_secret         = "segredo-de-teste"
}

run "prod_serves_canonical_and_redirect_domains" {
  command = apply

  variables {
    domain_name       = "escolagratisdetecnologia.com.br"
    redirect_www      = true
    redirect_zone_ids = { "escolagratisdetecnologia.com" = "Z1111111111111" }
  }

  assert {
    condition = aws_cloudfront_distribution.site.aliases == toset([
      "escolagratisdetecnologia.com.br", "www.escolagratisdetecnologia.com.br",
      "escolagratisdetecnologia.com", "www.escolagratisdetecnologia.com",
    ])
    error_message = "Prod deveria atender o domínio canônico, o domínio antigo e o www de cada um."
  }

  assert {
    condition = (
      aws_acm_certificate.site.domain_name == "escolagratisdetecnologia.com.br" &&
      toset(aws_acm_certificate.site.subject_alternative_names) == toset([
        "www.escolagratisdetecnologia.com.br", "escolagratisdetecnologia.com", "www.escolagratisdetecnologia.com",
      ])
    )
    error_message = "O certificado deveria ter o domínio canônico e os outros nomes como SAN."
  }

  assert {
    condition     = length(aws_route53_record.alias) == 8
    error_message = "Prod precisa de registros A e AAAA para cada um dos quatro nomes."
  }

  # Static keys: each name goes to its own domain's zone.
  assert {
    condition = (
      aws_route53_record.alias["www.escolagratisdetecnologia.com.br-AAAA"].zone_id == "Z0000000000000" &&
      aws_route53_record.alias["www.escolagratisdetecnologia.com-AAAA"].zone_id == "Z1111111111111" &&
      aws_route53_record.certificate_validation["escolagratisdetecnologia.com.br"].zone_id == "Z0000000000000" &&
      aws_route53_record.certificate_validation["escolagratisdetecnologia.com"].zone_id == "Z1111111111111"
    )
    error_message = "Cada registro deveria ir para a zona do seu domínio."
  }

  assert {
    condition = (
      strcontains(aws_cloudfront_function.viewer_request.code, "var CANONICAL_HOST = 'escolagratisdetecnologia.com.br';") &&
      strcontains(aws_cloudfront_function.viewer_request.code, "var REDIRECT_HOSTS = 'escolagratisdetecnologia.com,www.escolagratisdetecnologia.com,www.escolagratisdetecnologia.com.br'.split(',');")
    )
    error_message = "A função de borda deveria receber o domínio canônico e os nomes que redirecionam."
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
    condition     = strcontains(aws_cloudfront_function.viewer_request.code, "var REDIRECT_HOSTS = ''.split(',');")
    error_message = "Dev não deveria redirecionar nenhum nome."
  }

  assert {
    condition     = length(aws_wafv2_web_acl.edge.rule) == 4
    error_message = "O WAF deveria ter 3 grupos gerenciados e o rate limit."
  }

  assert {
    condition     = aws_cloudfront_distribution.site.tags["Component"] == "edge"
    error_message = "Recursos do edge precisam da tag Component=edge."
  }

  assert {
    condition = (
      aws_cloudfront_function.viewer_request.name == "egt-test-edge-viewer-request" &&
      aws_wafv2_web_acl.edge.name == "egt-test-edge-waf" &&
      aws_cloudfront_origin_access_control.site.name == "egt-test-edge-site-oac" &&
      aws_cloudfront_response_headers_policy.security.name == "egt-test-edge-security-headers"
    )
    error_message = "Os nomes devem seguir egt-{env}-edge-{nome}."
  }

  assert {
    condition     = one([for o in aws_cloudfront_distribution.site.origin : o if o.origin_id == "site"]).origin_access_control_id == aws_cloudfront_origin_access_control.site.id
    error_message = "A distribuição deveria usar o OAC."
  }

  assert {
    condition     = aws_cloudfront_distribution.site.web_acl_id == aws_wafv2_web_acl.edge.arn
    error_message = "A distribuição deveria usar o WAF."
  }

  assert {
    condition     = one(one(aws_cloudfront_distribution.site.default_cache_behavior).function_association).function_arn == aws_cloudfront_function.viewer_request.arn
    error_message = "A distribuição deveria usar a função de borda."
  }

  assert {
    condition     = anytrue([for r in aws_wafv2_web_acl.edge.rule : r.name == "rate-limit-ip" && length(r.statement[0].rate_based_statement[0].scope_down_statement) == 1])
    error_message = "O rate limit deveria ter scope-down para ignorar assets imutáveis."
  }
}

run "api_on_the_same_distribution" {
  command = apply

  variables {
    domain_name = "dev.escolagratisdetecnologia.com"
  }

  assert {
    condition = (
      one([for o in aws_cloudfront_distribution.site.origin : o if o.origin_id == "api"]).domain_name == "abc123.execute-api.sa-east-1.amazonaws.com" &&
      one(one([for o in aws_cloudfront_distribution.site.origin : o if o.origin_id == "api"]).custom_header).name == "x-origin-verify"
    )
    error_message = "A origem api deveria apontar para o API Gateway com o cabeçalho secreto."
  }

  assert {
    condition = (
      one(aws_cloudfront_distribution.site.ordered_cache_behavior).path_pattern == "/api/*" &&
      one(aws_cloudfront_distribution.site.ordered_cache_behavior).target_origin_id == "api" &&
      one(aws_cloudfront_distribution.site.ordered_cache_behavior).cache_policy_id == data.aws_cloudfront_cache_policy.disabled.id &&
      length(one(aws_cloudfront_distribution.site.ordered_cache_behavior).function_association) == 0
    )
    error_message = "/api/* deveria ir para a API, sem cache e sem a função de borda."
  }

  assert {
    condition     = [for r in aws_cloudfront_distribution.site.custom_error_response : r.error_code] == [403]
    error_message = "Só o 403 do S3 vira a página 404; erros da API passam intactos (ADR 0022)."
  }

  assert {
    condition = anytrue([
      for r in aws_wafv2_web_acl.edge.rule : r.name == "rate-limit-ip" &&
      r.action[0].block[0].custom_response[0].response_code == 429 &&
      r.action[0].block[0].custom_response[0].custom_response_body_key == "rate-limited"
    ])
    error_message = "O rate limit deveria responder 429 com corpo JSON."
  }

  assert {
    condition     = one(aws_wafv2_web_acl.edge.custom_response_body).content_type == "APPLICATION_JSON"
    error_message = "A resposta do rate limit deveria ser JSON."
  }
}
