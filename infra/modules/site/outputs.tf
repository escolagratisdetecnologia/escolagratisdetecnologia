output "bucket_id" {
  description = "Nome do bucket do site."
  value       = aws_s3_bucket.site.id
}

output "bucket_arn" {
  description = "ARN do bucket do site."
  value       = aws_s3_bucket.site.arn
}

output "bucket_regional_domain_name" {
  description = "Domínio regional do bucket, usado como origem do CloudFront."
  value       = aws_s3_bucket.site.bucket_regional_domain_name
}
