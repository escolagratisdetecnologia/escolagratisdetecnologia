output "bucket_id" {
  description = "Nome do bucket de estado."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "ARN do bucket de estado."
  value       = aws_s3_bucket.this.arn
}
