output "site_bucket_name" {
  description = "Bucket que recebe o build do site."
  value       = module.site.bucket_id
}

output "distribution_id" {
  description = "Distribuição CloudFront do site."
  value       = module.edge.distribution_id
}

output "distribution_domain_name" {
  description = "Domínio *.cloudfront.net da distribuição."
  value       = module.edge.distribution_domain_name
}

output "site_url" {
  description = "URL pública do site neste ambiente."
  value       = "https://${var.domain_name}"
}

output "api_gateway_endpoint" {
  description = "URL direta do API Gateway; o deploy confere que ela responde 403."
  value       = module.api.endpoint
}
