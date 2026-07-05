output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
}

output "platform_api_role_arn" {
  description = "IRSA role ARN — annotate the platform-api ServiceAccount with eks.amazonaws.com/role-arn."
  value       = module.platform_api_irsa.iam_role_arn
}

output "tf_runner_role_arn" {
  description = "IRSA role ARN — annotate the tf-runner ServiceAccount with eks.amazonaws.com/role-arn."
  value       = module.tf_runner_irsa.iam_role_arn
}

output "cloudflare_access_application_id" {
  value = cloudflare_access_application.apps_wildcard.id
}
