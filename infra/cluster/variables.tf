variable "aws_region" {
  description = "AWS region for the EKS cluster and supporting resources."
  type        = string
  default     = "us-west-2"
}

variable "cluster_name" {
  description = "Name of the EKS cluster."
  type        = string
  default     = "eks-admin-cluster"
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS control plane."
  type        = string
  default     = "1.29"
}

variable "vpc_id" {
  description = "VPC to launch the cluster into. Expected to already exist."
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs (spanning at least two AZs) for the EKS cluster and node group."
  type        = list(string)
}

variable "node_instance_type" {
  description = "Instance type for the managed node group."
  type        = string
  default     = "t3.medium"
}

variable "node_min_size" {
  description = "Minimum number of nodes in the managed node group."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum number of nodes in the managed node group."
  type        = number
  default     = 5
}

variable "node_desired_size" {
  description = "Desired number of nodes in the managed node group."
  type        = number
  default     = 2
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the Access application."
  type        = string
}

variable "cloudflare_zone" {
  description = "Cloudflare zone (domain) that the *.internal subdomain pattern is applied to."
  type        = string
  default     = "internal"
}

variable "tags" {
  description = "Common tags applied to all AWS resources."
  type        = map(string)
  default = {
    Project   = "vibeyeeter3000"
    ManagedBy = "opentofu"
  }
}
