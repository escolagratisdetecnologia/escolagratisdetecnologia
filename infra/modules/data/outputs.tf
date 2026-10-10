output "table_name" {
  description = "Nome da tabela única."
  value       = aws_dynamodb_table.main.name
}

output "table_arn" {
  description = "ARN da tabela única."
  value       = aws_dynamodb_table.main.arn
}
