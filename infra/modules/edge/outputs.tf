output "distribution_id" {
  description = "ID da distribuição CloudFront (usado para invalidação)."
  value       = aws_cloudfront_distribution.site.id
}

output "distribution_arn" {
  description = "ARN da distribuição CloudFront."
  value       = aws_cloudfront_distribution.site.arn
}

output "distribution_domain_name" {
  description = "Domínio *.cloudfront.net da distribuição."
  value       = aws_cloudfront_distribution.site.domain_name
}
