mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      id            = "abc123"
      api_endpoint  = "https://abc123.execute-api.sa-east-1.amazonaws.com"
      execution_arn = "arn:aws:execute-api:sa-east-1:123456789012:abc123"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:sa-east-1:123456789012:log-group:egt-test"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/egt-test-api-handler"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      invoke_arn = "arn:aws:apigateway:sa-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:sa-east-1:123456789012:function:egt-test-api-handler/invocations"
    }
  }
}

mock_provider "archive" {
  mock_data "archive_file" {
    defaults = {
      output_path         = "api-lambda.zip"
      output_base64sha256 = "aGFzaA=="
    }
  }
}

mock_provider "random" {}

variables {
  name_prefix     = "egt-test"
  environment     = "dev"
  package_dir     = "dist"
  app_version     = "abc1234"
  site_origin     = "https://dev.example.com"
  table_name      = "egt-test-data-main"
  table_arn       = "arn:aws:dynamodb:sa-east-1:123456789012:table/egt-test-data-main"
  alarm_topic_arn = "arn:aws:sns:sa-east-1:123456789012:egt-test-observability-alerts"

  user_pool_id            = "sa-east-1_Teste123"
  user_pool_arn           = "arn:aws:cognito-idp:sa-east-1:123456789012:userpool/sa-east-1_Teste123"
  user_pool_client_id     = "cliente-teste"
  user_pool_client_secret = "segredo-do-cliente"
  auth_domain             = "auth.dev.example.com"
}

run "lambda_behind_http_api" {
  command = apply

  assert {
    condition     = aws_lambda_function.handler.function_name == "egt-test-api-handler"
    error_message = "Nome da Lambda inesperado."
  }

  assert {
    condition     = aws_lambda_function.handler.runtime == "nodejs24.x" && aws_lambda_function.handler.architectures == tolist(["arm64"])
    error_message = "A Lambda deve rodar Node 24 em arm64."
  }

  assert {
    condition     = aws_lambda_function.handler.environment[0].variables["APP_ENV"] == "dev" && aws_lambda_function.handler.environment[0].variables["TABLE_NAME"] == "egt-test-data-main" && aws_lambda_function.handler.environment[0].variables["SITE_ORIGIN"] == "https://dev.example.com"
    error_message = "Variáveis de ambiente da API incompletas."
  }

  assert {
    condition = (
      aws_lambda_function.handler.environment[0].variables["USER_POOL_ID"] == "sa-east-1_Teste123" &&
      aws_lambda_function.handler.environment[0].variables["USER_POOL_CLIENT_ID"] == "cliente-teste" &&
      aws_lambda_function.handler.environment[0].variables["USER_POOL_CLIENT_SECRET"] == "segredo-do-cliente" &&
      aws_lambda_function.handler.environment[0].variables["AUTH_DOMAIN"] == "auth.dev.example.com"
    )
    error_message = "A Lambda recebe o pool, o cliente e o domínio de login."
  }

  assert {
    condition = (
      toset(one([for statement in data.aws_iam_policy_document.handler.statement : statement.actions if statement.sid == "ReadWriteTable"])) == toset(["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"]) &&
      toset(one([for statement in data.aws_iam_policy_document.handler.statement : statement.resources if statement.sid == "ReadWriteTable"])) == toset(["arn:aws:dynamodb:sa-east-1:123456789012:table/egt-test-data-main"])
    )
    error_message = "Na tabela, só as ações que os repositórios usam."
  }

  assert {
    condition = (
      toset(one([for statement in data.aws_iam_policy_document.handler.statement : statement.actions if statement.sid == "LearnerAccounts"])) == toset(["cognito-idp:AdminInitiateAuth", "cognito-idp:AdminRespondToAuthChallenge", "cognito-idp:AdminGetUser", "cognito-idp:AdminDeleteUser", "cognito-idp:AdminDisableProviderForUser"]) &&
      toset(one([for statement in data.aws_iam_policy_document.handler.statement : statement.resources if statement.sid == "LearnerAccounts"])) == toset(["arn:aws:cognito-idp:sa-east-1:123456789012:userpool/sa-east-1_Teste123"])
    )
    error_message = "No Cognito, só login por código, ler o e-mail e excluir a conta, neste pool."
  }

  assert {
    condition     = aws_lambda_function.handler.environment[0].variables["ORIGIN_VERIFY_SECRET"] == random_password.origin_verify.result
    error_message = "A Lambda deve conhecer o segredo de origem."
  }

  assert {
    condition     = aws_lambda_function.handler.logging_config[0].log_group == "/aws/lambda/egt-test-api-handler"
    error_message = "A Lambda deve escrever no log group criado pelo Terraform."
  }

  assert {
    condition     = aws_cloudwatch_log_group.handler.retention_in_days == 30 && aws_cloudwatch_log_group.access.retention_in_days == 30
    error_message = "Logs devem ficar 30 dias."
  }

  assert {
    condition     = aws_apigatewayv2_route.default.route_key == "$default"
    error_message = "Toda requisição deve ir para a Lambda."
  }

  assert {
    condition     = !strcontains(aws_apigatewayv2_stage.default.access_log_settings[0].format, "sourceIp")
    error_message = "O log de acesso não guarda IP."
  }

  assert {
    condition     = output.origin_domain == "abc123.execute-api.sa-east-1.amazonaws.com"
    error_message = "A origem do CloudFront é o domínio do API Gateway, sem https://."
  }

  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.api)) == toset(["5xx", "lambda-errors", "lambda-throttles"])
    error_message = "Esperados os alarmes 5xx, lambda-errors e lambda-throttles."
  }

  assert {
    condition     = alltrue([for alarm in aws_cloudwatch_metric_alarm.api : alarm.alarm_actions == toset(["arn:aws:sns:sa-east-1:123456789012:egt-test-observability-alerts"])])
    error_message = "Todo alarme deve avisar o tópico de alertas."
  }
}
