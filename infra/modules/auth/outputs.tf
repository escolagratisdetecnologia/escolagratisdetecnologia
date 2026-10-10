output "user_pool_id" {
  description = "ID do user pool dos alunos."
  value       = aws_cognito_user_pool.learners.id
}

output "user_pool_arn" {
  description = "ARN do user pool, para a política da Lambda da API."
  value       = aws_cognito_user_pool.learners.arn
}

output "client_id" {
  description = "ID do cliente da API no user pool."
  value       = aws_cognito_user_pool_client.web.id
}

output "client_secret" {
  description = "Segredo do cliente da API no user pool."
  value       = aws_cognito_user_pool_client.web.client_secret
  sensitive   = true
}
