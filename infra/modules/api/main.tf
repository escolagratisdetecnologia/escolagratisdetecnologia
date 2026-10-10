locals {
  tags          = { Component = "api" }
  function_name = "${var.name_prefix}-api-handler"
  alarms = {
    "5xx" = {
      namespace   = "AWS/ApiGateway"
      metric      = "5xx"
      dimensions  = { ApiId = aws_apigatewayv2_api.http.id }
      description = "API answered 5xx"
    }
    "lambda-errors" = {
      namespace   = "AWS/Lambda"
      metric      = "Errors"
      dimensions  = { FunctionName = local.function_name }
      description = "API Lambda failed (crash or timeout)"
    }
    "lambda-throttles" = {
      namespace   = "AWS/Lambda"
      metric      = "Throttles"
      dimensions  = { FunctionName = local.function_name }
      description = "API Lambda was throttled"
    }
  }
}

# --- Package (built by the CI before plan/apply: pnpm --filter @egt/api build) ---

data "archive_file" "package" {
  type             = "zip"
  source_dir       = var.package_dir
  output_path      = "${path.root}/.terraform/build/api-lambda.zip"
  output_file_mode = "0644"
}

# CloudFront sends this value in x-origin-verify; without it the API answers 403 (ADR 0022).
# Bump origin_verify_version in a PR to rotate it (docs/runbooks/deploy.md).
resource "random_password" "origin_verify" {
  length  = 48
  special = false

  keepers = {
    version = var.origin_verify_version
  }
}

# --- Lambda ---

resource "aws_cloudwatch_log_group" "handler" {
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

resource "aws_iam_role" "handler" {
  name               = local.function_name
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
  tags               = local.tags
}

# Least privilege: only what the routes use today (grow it with the routes).
data "aws_iam_policy_document" "handler" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.handler.arn}:*"]
  }

  statement {
    sid = "ReadWriteTable"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [var.table_arn]
  }

  # Sign-in with e-mail codes, the e-mail on the Eu page, and account deletion. SignUp,
  # ConfirmSignUp, token refresh and revocation are public Cognito APIs (no IAM).
  statement {
    sid = "LearnerAccounts"
    actions = [
      "cognito-idp:AdminInitiateAuth",
      "cognito-idp:AdminRespondToAuthChallenge",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:AdminDisableProviderForUser",
    ]
    resources = [var.user_pool_arn]
  }
}

resource "aws_iam_role_policy" "handler" {
  name   = "least-privilege"
  role   = aws_iam_role.handler.id
  policy = data.aws_iam_policy_document.handler.json
}

resource "aws_lambda_function" "handler" {
  function_name    = local.function_name
  description      = "School API (Hono)"
  role             = aws_iam_role.handler.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "lambda.handler"
  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256
  memory_size      = 512
  timeout          = 10
  tags             = local.tags

  environment {
    variables = {
      APP_ENV                 = var.environment
      APP_VERSION             = var.app_version
      TABLE_NAME              = var.table_name
      SITE_ORIGIN             = var.site_origin
      ORIGIN_VERIFY_SECRET    = random_password.origin_verify.result
      USER_POOL_ID            = var.user_pool_id
      USER_POOL_CLIENT_ID     = var.user_pool_client_id
      USER_POOL_CLIENT_SECRET = var.user_pool_client_secret
      AUTH_DOMAIN             = var.auth_domain
      NODE_OPTIONS            = "--enable-source-maps"
    }
  }

  logging_config {
    log_format            = "JSON"
    log_group             = aws_cloudwatch_log_group.handler.name
    application_log_level = "INFO"
    system_log_level      = "WARN"
  }

  depends_on = [aws_iam_role_policy.handler]
}

# --- API Gateway (HTTP API) ---

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.name_prefix}-api-http"
  protocol_type = "HTTP"
  tags          = local.tags
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name_prefix}-api-http"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
  tags        = local.tags

  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }

  # No IP or user agent: only what is needed to operate the API (LGPD).
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      time             = "$context.requestTime"
      method           = "$context.httpMethod"
      path             = "$context.path"
      status           = "$context.status"
      latencyMs        = "$context.responseLatency"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_apigatewayv2_integration" "handler" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.handler.invoke_arn
  payload_format_version = "2.0"
}

# Hono does the routing: every request goes to the Lambda.
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.handler.id}"
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handler.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# --- Alarms (any occurrence in 5 minutes; e-mail via the observability topic) ---

resource "aws_cloudwatch_metric_alarm" "api" {
  for_each = local.alarms

  alarm_name          = "${var.name_prefix}-api-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  dimensions          = each.value.dimensions
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = local.tags
}
