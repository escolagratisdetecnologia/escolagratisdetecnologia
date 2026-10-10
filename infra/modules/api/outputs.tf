output "origin_domain" {
  description = "Domínio do API Gateway, origem do caminho /api/* no CloudFront."
  value       = replace(aws_apigatewayv2_api.http.api_endpoint, "https://", "")
}

output "endpoint" {
  description = "URL direta do API Gateway (só para conferir que ela recusa acesso direto)."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "origin_verify_secret" {
  description = "Segredo que o CloudFront envia em x-origin-verify."
  value       = random_password.origin_verify.result
  sensitive   = true
}

output "function_name" {
  description = "Nome da Lambda da API."
  value       = aws_lambda_function.handler.function_name
}
