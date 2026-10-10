locals {
  tags          = { Component = "auth" }
  function_name = "${var.name_prefix}-auth-triggers"
  site_origin   = "https://${var.domain_name}"
  mail_from     = "bounce.${var.domain_name}"
}

# --- E-mail (SES in sa-east-1, the pool's region; Cognito sends the codes through it) ---

resource "aws_ses_domain_identity" "mail" {
  domain = var.domain_name
}

resource "aws_route53_record" "ses_verification" {
  zone_id = var.zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.mail.verification_token]
}

# Cognito only accepts a verified identity: wait for it before the pool.
resource "aws_ses_domain_identity_verification" "mail" {
  domain     = aws_ses_domain_identity.mail.domain
  depends_on = [aws_route53_record.ses_verification]
}

resource "aws_ses_domain_dkim" "mail" {
  domain = aws_ses_domain_identity.mail.domain
}

resource "aws_route53_record" "dkim" {
  count = 3

  zone_id = var.zone_id
  name    = "${aws_ses_domain_dkim.mail.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.mail.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# Bounces come back to bounce.<domain>, aligned with the From domain (SPF and DMARC).
resource "aws_ses_domain_mail_from" "mail" {
  domain                 = aws_ses_domain_identity.mail.domain
  mail_from_domain       = local.mail_from
  behavior_on_mx_failure = "UseDefaultValue"
}

resource "aws_route53_record" "mail_from_mx" {
  zone_id = var.zone_id
  name    = local.mail_from
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.sa-east-1.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  zone_id = var.zone_id
  name    = local.mail_from
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# Only SES sends as this domain, DKIM-signed: anything else goes to spam.
resource "aws_route53_record" "dmarc" {
  zone_id = var.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=quarantine; adkim=s; aspf=r"]
}

# --- Cognito triggers (link Google to the e-mail account; code e-mails in pt-BR) ---

data "archive_file" "package" {
  type             = "zip"
  source_dir       = var.package_dir
  output_path      = "${path.root}/.terraform/build/auth-triggers.zip"
  output_file_mode = "0644"
}

resource "aws_cloudwatch_log_group" "triggers" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

data "aws_iam_policy_document" "assume_lambda" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "triggers" {
  name               = local.function_name
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
  tags               = local.tags
}

# Least privilege: find the account by e-mail, create it when missing (or replace an unconfirmed
# e-mail sign-up), link Google to it.
data "aws_iam_policy_document" "triggers" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.triggers.arn}:*"]
  }

  statement {
    sid       = "LinkGoogleAccounts"
    actions   = ["cognito-idp:ListUsers", "cognito-idp:AdminCreateUser", "cognito-idp:AdminLinkProviderForUser", "cognito-idp:AdminDeleteUser"]
    resources = [aws_cognito_user_pool.learners.arn]
  }
}

resource "aws_iam_role_policy" "triggers" {
  name   = "least-privilege"
  role   = aws_iam_role.triggers.id
  policy = data.aws_iam_policy_document.triggers.json
}

resource "aws_lambda_function" "triggers" {
  function_name    = local.function_name
  description      = "Cognito triggers of the learner pool"
  role             = aws_iam_role.triggers.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "triggers.handler"
  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256
  memory_size      = 256
  # Cognito waits at most 5 seconds for a trigger.
  timeout = 5
  tags    = local.tags

  environment {
    variables = {
      NODE_OPTIONS = "--enable-source-maps"
    }
  }

  logging_config {
    log_format            = "JSON"
    log_group             = aws_cloudwatch_log_group.triggers.name
    application_log_level = "INFO"
    system_log_level      = "WARN"
  }
}

resource "aws_lambda_permission" "cognito" {
  statement_id  = "AllowCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.triggers.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.learners.arn
}

# --- Learner user pool (Essentials: passwordless e-mail codes, spec §5.1, ADR 0024) ---

resource "aws_cognito_user_pool" "learners" {
  name                = "${var.name_prefix}-auth-learners"
  user_pool_tier      = "ESSENTIALS"
  username_attributes = ["email"]
  # Cognito confirms the e-mail with the first code; nobody has a password.
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"
  tags                     = merge(local.tags, { DataClassification = "personal" })

  sign_in_policy {
    # Cognito always lists PASSWORD; no learner has one, so it is never used.
    allowed_first_auth_factors = ["EMAIL_OTP", "PASSWORD"]
  }

  username_configuration {
    case_sensitive = false
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  # No password to recover: a new code is the way back in.
  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  email_configuration {
    email_sending_account = "DEVELOPER"
    source_arn            = aws_ses_domain_identity.mail.arn
    from_email_address    = "Escola Gratis de Tecnologia <nao-responda@${var.domain_name}>"
  }

  lambda_config {
    pre_sign_up    = aws_lambda_function.triggers.arn
    custom_message = aws_lambda_function.triggers.arn
  }

  depends_on = [aws_ses_domain_identity_verification.mail]
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.learners.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email"
  }

  # Without email_verified the e-mail counts as unverified and is never linked.
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }
}

# The API's confidential client (the BFF, spec §5.2): e-mail codes through the API, Google
# through the pool domain, refresh tokens that rotate.
resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.name_prefix}-auth-web"
  user_pool_id                         = aws_cognito_user_pool.learners.id
  generate_secret                      = true
  explicit_auth_flows                  = ["ALLOW_USER_AUTH"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  callback_urls                        = ["${local.site_origin}/api/auth/callback"]
  supported_identity_providers         = [aws_cognito_identity_provider.google.provider_name]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  # Time to type the e-mail code.
  auth_session_validity  = 15
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  refresh_token_rotation {
    feature                    = "ENABLED"
    retry_grace_period_seconds = 10
  }
}
