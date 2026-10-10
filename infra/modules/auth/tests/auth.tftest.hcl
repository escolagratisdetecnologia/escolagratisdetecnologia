mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_ses_domain_identity" {
    defaults = {
      arn                = "arn:aws:ses:sa-east-1:123456789012:identity/dev.example.com"
      verification_token = "token-de-verificacao"
    }
  }

  mock_resource "aws_ses_domain_dkim" {
    defaults = {
      dkim_tokens = ["dkim1", "dkim2", "dkim3"]
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:sa-east-1:123456789012:log-group:egt-test"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/egt-test-auth-triggers"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:sa-east-1:123456789012:function:egt-test-auth-triggers"
    }
  }

  mock_resource "aws_cognito_user_pool" {
    defaults = {
      id  = "sa-east-1_Teste123"
      arn = "arn:aws:cognito-idp:sa-east-1:123456789012:userpool/sa-east-1_Teste123"
    }
  }
}

mock_provider "archive" {
  mock_data "archive_file" {
    defaults = {
      output_path         = "auth-triggers.zip"
      output_base64sha256 = "aGFzaA=="
    }
  }
}

variables {
  name_prefix          = "egt-test"
  domain_name          = "dev.example.com"
  zone_id              = "Z123"
  package_dir          = "dist"
  google_client_id     = "cliente.apps.googleusercontent.com"
  google_client_secret = "segredo-do-google"
  deletion_protection  = false
}

run "passwordless_learner_pool" {
  command = apply

  assert {
    condition     = aws_cognito_user_pool.learners.name == "egt-test-auth-learners" && aws_cognito_user_pool.learners.user_pool_tier == "ESSENTIALS"
    error_message = "O pool dos alunos usa o plano Essentials."
  }

  assert {
    condition     = toset(aws_cognito_user_pool.learners.sign_in_policy[0].allowed_first_auth_factors) == toset(["EMAIL_OTP", "PASSWORD"]) && aws_cognito_user_pool.learners.mfa_configuration == "OFF"
    error_message = "Login por código no e-mail, sem MFA (o Cognito não junta MFA com login sem senha)."
  }

  assert {
    condition     = aws_cognito_user_pool.learners.username_attributes == toset(["email"]) && aws_cognito_user_pool.learners.deletion_protection == "INACTIVE"
    error_message = "O e-mail é o login; a proteção contra exclusão segue a variável."
  }

  assert {
    condition     = aws_cognito_user_pool.learners.tags["Component"] == "auth" && aws_cognito_user_pool.learners.tags["DataClassification"] == "personal"
    error_message = "O pool guarda dados pessoais."
  }

  assert {
    condition     = aws_cognito_user_pool.learners.email_configuration[0].email_sending_account == "DEVELOPER" && aws_cognito_user_pool.learners.email_configuration[0].from_email_address == "Escola Gratis de Tecnologia <nao-responda@dev.example.com>"
    error_message = "Os códigos saem pelo SES, do domínio do site."
  }

  assert {
    condition     = aws_cognito_user_pool.learners.lambda_config[0].pre_sign_up == aws_lambda_function.triggers.arn && aws_cognito_user_pool.learners.lambda_config[0].custom_message == aws_lambda_function.triggers.arn
    error_message = "Os gatilhos vinculam o Google e escrevem os e-mails em pt-BR."
  }
}

run "confidential_client_with_rotation" {
  command = apply

  assert {
    condition     = aws_cognito_user_pool_client.web.generate_secret && aws_cognito_user_pool_client.web.explicit_auth_flows == toset(["ALLOW_USER_AUTH"])
    error_message = "Cliente confidencial; com rotação, REFRESH_TOKEN_AUTH fica de fora."
  }

  assert {
    condition     = aws_cognito_user_pool_client.web.refresh_token_rotation[0].feature == "ENABLED" && aws_cognito_user_pool_client.web.refresh_token_validity == 30
    error_message = "Sessão de 30 dias com refresh token que gira."
  }

  assert {
    condition     = aws_cognito_user_pool_client.web.callback_urls == toset(["https://dev.example.com/api/auth/callback"]) && aws_cognito_user_pool_client.web.supported_identity_providers == toset(["Google"])
    error_message = "O Google volta para a API do próprio site."
  }

  assert {
    condition     = aws_cognito_user_pool_client.web.prevent_user_existence_errors == "ENABLED" && aws_cognito_user_pool_client.web.enable_token_revocation
    error_message = "Sem revelar quem tem conta; logout revoga o refresh token."
  }

  assert {
    condition     = aws_cognito_identity_provider.google.attribute_mapping["email_verified"] == "email_verified" && aws_cognito_identity_provider.google.provider_details["client_id"] == "cliente.apps.googleusercontent.com"
    error_message = "Sem email_verified, o Google nunca seria vinculado."
  }
}

run "triggers_with_least_privilege" {
  command = apply

  assert {
    condition     = aws_lambda_function.triggers.handler == "triggers.handler" && aws_lambda_function.triggers.timeout == 5 && aws_lambda_function.triggers.runtime == "nodejs24.x"
    error_message = "Os gatilhos vêm do mesmo build da API e respondem em até 5 segundos."
  }

  assert {
    condition = toset(flatten([for statement in data.aws_iam_policy_document.triggers.statement : statement.actions])) == toset([
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "cognito-idp:ListUsers",
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminLinkProviderForUser",
    ])
    error_message = "Os gatilhos só podem achar, criar e vincular contas (e escrever os próprios logs)."
  }

  assert {
    condition     = aws_lambda_permission.cognito.principal == "cognito-idp.amazonaws.com" && aws_lambda_permission.cognito.source_arn == aws_cognito_user_pool.learners.arn
    error_message = "Só este pool chama os gatilhos."
  }

  assert {
    condition     = aws_cloudwatch_log_group.triggers.name == "/aws/lambda/egt-test-auth-triggers" && aws_cloudwatch_log_group.triggers.retention_in_days == 30
    error_message = "Logs dos gatilhos com 30 dias."
  }
}

run "ses_domain_records" {
  command = apply

  assert {
    condition     = length(aws_route53_record.dkim) == 3 && aws_route53_record.dkim[0].name == "dkim1._domainkey.dev.example.com"
    error_message = "Easy DKIM pede três CNAMEs."
  }

  assert {
    condition     = aws_route53_record.mail_from_mx.records == toset(["10 feedback-smtp.sa-east-1.amazonses.com"]) && aws_route53_record.mail_from_mx.name == "bounce.dev.example.com"
    error_message = "Os retornos vão para bounce.<domínio>, na região do SES."
  }

  assert {
    condition     = aws_route53_record.dmarc.records == toset(["v=DMARC1; p=quarantine; adkim=s; aspf=r"])
    error_message = "DMARC manda para a quarentena o que não vem do SES."
  }
}
